"""Bounded in-memory live frames through the shared image pipelines."""
import base64
import binascii
from collections import Counter
from contextlib import redirect_stdout
import json
import math
import sys

import cv2
import numpy as np

from gaze.live_session import LiveSeatMonitor
from gaze.review_setup import suggest_seats
from gaze.session_review import validate_settings

MAX_JPEG_BYTES = 1_000_000
MAX_MESSAGE_CHARS = 1_400_000
MAX_SETUP_SAMPLES = 5


class CameraProcessor:
    def __init__(self, pipeline, fallback=None):
        self.pipeline = pipeline
        self.fallback = fallback
        self.last_timestamp = -1.
        self.live = None
        self.setup_samples = []

    def configure(self, settings):
        if self.live is not None:
            raise ValueError('Seat monitoring is already configured')
        if not isinstance(settings, dict):
            raise ValueError('Expected seat settings')
        config = validate_settings({**settings, 'method': 'baseline'})
        if bool(self.pipeline.metadata.get('mirrored_input', False)) != config['mirrored']:
            raise ValueError('Pipeline mirroring must match seat settings')
        self.live = LiveSeatMonitor(config, config['mirrored'], self.fallback)
        return {'configured': True, 'seats': config['seats']}

    def suggest(self):
        if not self.setup_samples:
            raise ValueError('Send setup frames before suggesting seats')
        return {'suggested': True, **suggest_seats(self.setup_samples, self.pipeline)}

    def process(self, message):
        if not isinstance(message, dict):
            raise ValueError('Expected a frame object')
        timestamp = message.get('timestamp_seconds')
        if (isinstance(timestamp, bool) or not isinstance(timestamp, (int, float))
                or not math.isfinite(timestamp) or timestamp < 0):
            raise ValueError('Capture timestamp must be finite and nonnegative')
        if timestamp <= self.last_timestamp:
            raise ValueError('Capture timestamps must strictly increase')
        identifier = message.get('id')
        if isinstance(identifier, bool) or not isinstance(identifier, int) or not 0 <= identifier <= 2**53-1:
            raise ValueError('Frame id must be a nonnegative safe integer')
        encoded = message.get('image')
        if not isinstance(encoded, str) or not 0 < len(encoded) <= 1_333_336:
            raise ValueError('Frame must be a JPEG of at most 1 MB')
        try:
            data = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error) as error:
            raise ValueError('Invalid base64 JPEG frame') from error
        if len(data) > MAX_JPEG_BYTES or not data.startswith(b'\xff\xd8'):
            raise ValueError('Frame must be a JPEG of at most 1 MB')
        try:
            image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
        except cv2.error as error:
            raise ValueError('Cannot decode camera JPEG') from error
        if image is None:
            raise ValueError('Cannot decode camera JPEG')
        height, width = image.shape[:2]
        if max(width, height) > 1280 or width * height > 1280 * 720:
            raise ValueError('Camera frames must fit within 1280 x 720 pixels')
        open_alerts = self._open_alerts(message.get('open_alerts'))
        result = self.pipeline.process(image)
        response = {'id': identifier, 'timestamp_seconds': timestamp, 'result': result.to_dict(),
                    'counts': dict(Counter(d.direction for d in result.detections))}
        if self.live is not None:
            response.update(self.live.update(timestamp, result, image, open_alerts))
        self.last_timestamp = timestamp
        if message.get('setup') is True:
            self.setup_samples = (self.setup_samples + [image])[-MAX_SETUP_SAMPLES:]
        return response

    @staticmethod
    def _open_alerts(value):
        if value is None:
            return set()
        if not isinstance(value, list) or len(value) > 100 or any(
                not isinstance(pair, list) or len(pair) != 2 or not all(isinstance(v, str) for v in pair)
                for pair in value):
            raise ValueError('Open alerts must be a list of [seat, direction] pairs')
        return {tuple(pair) for pair in value}


def serve(pipeline, incoming, outgoing, fallback=None):
    """JSONL transport; EOF shuts down. Never persist camera pixels; seat crops are returned to the caller.

    `fallback` is the optional head-pose pipeline for seats whose face is lost (strong head turns)."""
    processor = CameraProcessor(pipeline, fallback)

    def emit(value):
        outgoing.write(json.dumps(value, allow_nan=False) + '\n')
        outgoing.flush()

    emit({'ready': True, 'pipeline': pipeline.metadata, 'head_turns': fallback is not None})
    while True:
        line = incoming.readline(MAX_MESSAGE_CHARS + 1)
        if not line:
            return
        if len(line) > MAX_MESSAGE_CHARS:
            emit({'error': 'Camera frame message is too large'})
            return
        message = None
        try:
            message = json.loads(line)
            kind = message.get('type') if isinstance(message, dict) else None
            with redirect_stdout(sys.stderr):
                if kind == 'configure':
                    result = processor.configure(message.get('settings'))
                elif kind == 'suggest_seats':
                    result = processor.suggest()
                else:
                    result = processor.process(message)
            emit(result)
        except (ValueError, RuntimeError, OSError, cv2.error) as error:
            emit({'id': message.get('id') if isinstance(message, dict) else None,
                  'error': str(error)})

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

MAX_JPEG_BYTES = 1_000_000
MAX_MESSAGE_CHARS = 1_400_000


class CameraProcessor:
    def __init__(self, pipeline):
        self.pipeline = pipeline
        self.last_timestamp = -1.

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
        result = self.pipeline.process(image)
        self.last_timestamp = timestamp
        return {'id': identifier, 'timestamp_seconds': timestamp, 'result': result.to_dict(),
                'counts': dict(Counter(d.direction for d in result.detections))}


def serve(pipeline, incoming, outgoing):
    """JSONL transport; EOF shuts down. Never persist camera pixels or records."""
    processor = CameraProcessor(pipeline)

    def emit(value):
        outgoing.write(json.dumps(value, allow_nan=False) + '\n')
        outgoing.flush()

    emit({'ready': True, 'pipeline': pipeline.metadata})
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
            with redirect_stdout(sys.stderr):
                result = processor.process(message)
            emit(result)
        except (ValueError, RuntimeError, OSError, cv2.error) as error:
            emit({'id': message.get('id') if isinstance(message, dict) else None,
                  'error': str(error)})

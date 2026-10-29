"""Live frames use capture time and the same image observation contract."""
import base64
import io
import json
import unittest

import cv2
import numpy as np

from gaze.camera import CameraProcessor, serve
from gaze.pipeline import FaceObservation, ImageResult


class Pipeline:
    metadata = {'method': 'injected'}

    def __init__(self):
        self.calls = 0

    def process(self, image):
        self.calls += 1
        h, w = image.shape[:2]
        return ImageResult(w, h, [FaceObservation((5, 5, 30, 30), 'left', {}, {})], 2., {})


def frame(timestamp=0., image=None):
    if image is None:
        image = np.zeros((60, 80, 3), np.uint8)
    encoded = cv2.imencode('.jpg', image)[1]
    return {'id': 1, 'timestamp_seconds': timestamp,
            'image': base64.b64encode(encoded).decode('ascii')}


class CameraTests(unittest.TestCase):
    def test_reuses_pipeline_and_counts_each_frame_independently(self):
        pipeline = Pipeline()
        processor = CameraProcessor(pipeline)
        first = processor.process(frame(0.1))
        second = processor.process({**frame(4.2), 'id': 2})
        self.assertEqual(pipeline.calls, 2)
        self.assertEqual(first['counts'], {'left': 1})
        self.assertEqual(second['counts'], {'left': 1})
        self.assertEqual(second['timestamp_seconds'], 4.2)
        self.assertEqual(second['result']['width'], 80)
        self.assertEqual(second['result']['detections'][0]['direction'], 'left')

    def test_rejects_invalid_timestamps_and_backwards_capture_time(self):
        processor = CameraProcessor(Pipeline())
        for value in [-1, float('nan'), float('inf'), True, '1', None]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                processor.process(frame(value))
        processor.process(frame(2.))
        for value in [2., 1.]:
            with self.assertRaisesRegex(ValueError, 'increase'):
                processor.process(frame(value))

    def test_rejects_corrupt_large_or_non_jpeg_frames_before_inference(self):
        pipeline = Pipeline()
        processor = CameraProcessor(pipeline)
        png = cv2.imencode('.png', np.zeros((60, 80, 3), np.uint8))[1]
        for payload in ['!', '', base64.b64encode(b'broken').decode(),
                        base64.b64encode(png).decode(), 'A' * 1_500_000]:
            with self.subTest(size=len(payload)), self.assertRaises(ValueError):
                processor.process({**frame(), 'image': payload})
        with self.assertRaises(ValueError):
            processor.process(frame(image=np.zeros((721, 1280, 3), np.uint8)))
        self.assertEqual(pipeline.calls, 0)

    def test_protocol_handles_two_frames_and_malformed_message_without_exiting(self):
        pipeline = Pipeline()
        incoming = io.StringIO(json.dumps(frame(.2)) + '\ninvalid\n' + json.dumps({**frame(.4), 'id': 2}) + '\n')
        outgoing = io.StringIO()
        serve(pipeline, incoming, outgoing)
        messages = [json.loads(line) for line in outgoing.getvalue().splitlines()]
        self.assertTrue(messages[0]['ready'])
        self.assertEqual(messages[1]['id'], 1)
        self.assertIn('error', messages[2])
        self.assertEqual(messages[3]['id'], 2)
        self.assertEqual(pipeline.calls, 2)

    def test_oversized_protocol_line_stops_without_processing_following_bytes(self):
        pipeline = Pipeline()
        outgoing = io.StringIO()
        serve(pipeline, io.StringIO('x' * 1_500_000 + '\n'), outgoing)
        self.assertIn('error', json.loads(outgoing.getvalue().splitlines()[-1]))
        self.assertEqual(pipeline.calls, 0)

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


SETTINGS = {'mirrored': False, 'tileGrid': 1, 'seats': [{'id': 'seat-1', 'roi': [0, 0, .5, 1]}],
            'movement': {'min_duration': 2., 'repetition_count': 3, 'repetition_window': 10.,
                         'max_gap': .75, 'repeat_min_duration': .25}}


def run_protocol(pipeline, messages):
    outgoing = io.StringIO()
    serve(pipeline, io.StringIO(''.join(json.dumps(m) + '\n' for m in messages)), outgoing)
    return [json.loads(line) for line in outgoing.getvalue().splitlines()][1:]


class SeatProtocolTests(unittest.TestCase):
    def test_configure_then_frames_return_seat_states(self):
        out = run_protocol(Pipeline(), [{'type': 'configure', 'settings': SETTINGS},
                                        frame(.1), {**frame(.4), 'id': 2, 'open_alerts': [['seat-1', 'left']]}])
        self.assertTrue(out[0]['configured'])
        self.assertEqual(out[0]['seats'][0]['id'], 'seat-1')
        self.assertEqual(out[1]['seats'], {'seat-1': {'direction': 'left', 'reason': None}})
        self.assertEqual(out[1]['events'], [])
        self.assertIn('seats', out[2])

    def test_frames_before_configure_have_no_seats(self):
        out = run_protocol(Pipeline(), [frame(.1)])
        self.assertNotIn('seats', out[0])
        self.assertNotIn('events', out[0])

    def test_second_configure_is_error(self):
        out = run_protocol(Pipeline(), [{'type': 'configure', 'settings': SETTINGS},
                                        {'type': 'configure', 'settings': SETTINGS}])
        self.assertTrue(out[0]['configured'])
        self.assertIn('already configured', out[1]['error'])

    def test_invalid_settings_and_open_alerts_are_errors(self):
        out = run_protocol(Pipeline(), [{'type': 'configure', 'settings': {**SETTINGS, 'seats': []}},
                                        {**frame(.1), 'open_alerts': 'x'}])
        self.assertIn('error', out[0])
        self.assertIn('error', out[1])

    def test_suggest_seats_uses_setup_frames(self):
        out = run_protocol(Pipeline(), [{**frame(i * .2), 'id': i + 1, 'setup': True} for i in range(6)]
                           + [{'type': 'suggest_seats'}])
        suggestion = out[-1]
        self.assertTrue(suggestion['suggested'])
        self.assertEqual(suggestion['sampled_frames'], 5)
        self.assertEqual([s['id'] for s in suggestion['seats']], ['seat-1'])

    def test_suggest_without_setup_frames_is_error(self):
        self.assertIn('error', run_protocol(Pipeline(), [{'type': 'suggest_seats'}])[0])


class HeadTurnProtocolTests(unittest.TestCase):
    def test_the_head_model_reads_seats_whose_face_is_lost(self):
        class NoFaces(Pipeline):
            def process(self, image):
                h, w = image.shape[:2]
                return ImageResult(w, h, [], 2., {})

        class Heads(Pipeline):
            def process(self, image):
                self.calls += 1
                h, w = image.shape[:2]
                return ImageResult(w, h, [FaceObservation((5, 5, 30, 30), 'right', {}, {}, None, 'head_pose_fallback')], 2., {})

        heads = Heads()
        outgoing = io.StringIO()
        messages = [{'type': 'configure', 'settings': SETTINGS}, frame(.1)]
        serve(NoFaces(), io.StringIO(''.join(json.dumps(m) + '\n' for m in messages)), outgoing, fallback=heads)
        out = [json.loads(line) for line in outgoing.getvalue().splitlines()]
        self.assertTrue(out[0]['head_turns'])
        self.assertEqual(out[2]['seats'], {'seat-1': {'direction': 'right', 'reason': None}})
        self.assertEqual(heads.calls, 1)

    def test_without_the_head_model_the_worker_says_so(self):
        outgoing = io.StringIO()
        serve(Pipeline(), io.StringIO(''), outgoing)
        self.assertFalse(json.loads(outgoing.getvalue().splitlines()[0])['head_turns'])


class SetupWithHeadsTests(unittest.TestCase):
    def test_setup_finds_people_the_face_model_misses(self):
        class NoFaces(Pipeline):
            def process(self, image):
                h, w = image.shape[:2]
                return ImageResult(w, h, [], 2., {})
        outgoing = io.StringIO()
        messages = [{**frame(i * .2), 'id': i + 1, 'setup': True} for i in range(3)] + [{'type': 'suggest_seats'}]
        serve(NoFaces(), io.StringIO(''.join(json.dumps(m) + '\n' for m in messages)), outgoing, fallback=Pipeline())
        suggestion = json.loads(outgoing.getvalue().splitlines()[-1])
        self.assertEqual([s['id'] for s in suggestion['seats']], ['seat-1'])


class AnalyseTests(unittest.TestCase):
    def test_analyse_matches_process_for_the_same_frame(self):
        image = np.zeros((60, 80, 3), np.uint8)
        message = {**frame(1.5, image), 'id': 7}
        decoded = cv2.imdecode(np.frombuffer(base64.b64decode(message['image']), np.uint8), cv2.IMREAD_COLOR)
        processed = CameraProcessor(Pipeline()).process(message)
        analysed = CameraProcessor(Pipeline()).analyse(1.5, decoded, set(), 7)
        self.assertEqual(analysed, processed)

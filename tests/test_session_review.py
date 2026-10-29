import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from gaze.pipeline import FaceObservation, ImageResult
from gaze.session_review import process_session, validate_settings


def settings():
    return {'method': 'baseline', 'mirrored': False, 'tileGrid': 1,
            'seats': [{'id': 'A', 'roi': [0, 0, .5, 1]}, {'id': 'B', 'roi': [.5, 0, 1, 1]}],
            'movement': {'min_duration': .5, 'repetition_count': 2,
                         'repetition_window': 3., 'repeat_min_duration': .25, 'max_gap': .5}}


class Pipeline:
    metadata = {'method': 'injected', 'mirrored_input': False}
    def __init__(self):
        self.index = 0
    def process(self, image):
        index = self.index
        self.index += 1
        observations = [] if index == 5 else [FaceObservation((5, 5, 12, 12), 'left', {}, {})]
        return ImageResult(64, 48, observations, 1., {})


class SessionReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.input = self.root / 'input.avi'
        writer = cv2.VideoWriter(str(self.input), cv2.VideoWriter_fourcc(*'MJPG'), 4., (64, 48))
        self.assertTrue(writer.isOpened())
        for _ in range(10):
            writer.write(np.zeros((48, 64, 3), np.uint8))
        writer.release()

    def test_session_exports_aligned_events_gaps_settings_and_provenance(self):
        output = self.root / 'output'
        review = process_session(self.input, output, settings(), Pipeline())
        self.assertEqual(len(review['frames']), 10)
        self.assertEqual(review['frames'][5]['time'], 1.25)
        self.assertEqual(review['frames'][5]['seats']['A']['direction'], 'unknown')
        self.assertEqual(review['frames'][0]['seats']['B']['reason'], 'missing')
        events = review['events']
        self.assertEqual(len(events), 2)
        self.assertEqual((events[0]['start_time'], events[0]['end_time']), (0., 1.))
        self.assertEqual(events[1]['start_time'], 1.5)
        self.assertTrue(events[0]['review_required'])
        self.assertEqual(review['settings'], validate_settings(settings()))
        self.assertEqual(len(review['source_sha256']), 64)
        self.assertEqual(json.loads((output / 'events.json').read_text())['input_sha256'], review['source_sha256'])
        self.assertEqual(json.loads((output / 'review.json').read_text())['events'], events)
        self.assertEqual([s['direction'] for s in review['histories']['A']], ['left', 'unknown', 'left'])
        self.assertEqual(review['histories']['A'][0]['end'], 1.)
        for name in ['annotated.avi', 'observations.jsonl', 'seat_history.json', 'settings.json', 'summary.json']:
            self.assertTrue((output / name).is_file())

    def test_existing_output_and_source_cannot_be_overwritten(self):
        output = self.root / 'existing'
        output.mkdir()
        (output / 'keep').write_text('keep')
        with self.assertRaises(ValueError):
            process_session(self.input, output, settings(), Pipeline())
        with self.assertRaises(ValueError):
            process_session(self.input, self.input, settings(), Pipeline())
        self.assertEqual((output / 'keep').read_text(), 'keep')

    def test_invalid_configuration_is_rejected_before_creating_outputs(self):
        invalid = settings()
        invalid['seats'][1]['roi'] = [.1, 0, 1, 1]
        with self.assertRaises(ValueError):
            process_session(self.input, self.root / 'bad', invalid, Pipeline())
        self.assertFalse((self.root / 'bad').exists())
        for changes in [{'mirrored': 'false'}, {'tileGrid': True}, {'method': 'pose'}, {'seats': []}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_settings({**settings(), **changes})

    def test_invalid_movement_values_and_duplicate_ids_are_rejected(self):
        for changes in [{'min_duration': float('nan')}, {'max_gap': 0}, {'repetition_count': 2.5},
                        {'repeat_min_duration': 4}, {'repetition_window': True}]:
            value = settings()
            value['movement'].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_settings(value)
        value = settings()
        value['seats'][1]['id'] = 'A'
        with self.assertRaises(ValueError):
            validate_settings(value)

    def test_corrupt_video_does_not_publish_review_record(self):
        self.input.write_bytes(b'not video')
        output = self.root / 'failed'
        with self.assertRaises(ValueError):
            process_session(self.input, output, settings(), Pipeline())
        self.assertFalse((output / 'review.json').exists())

    def test_frame_and_output_limits_do_not_publish_partial_sessions(self):
        output = self.root / 'too-many-frames'
        with patch('gaze.session_review.MAX_FRAMES', 5), self.assertRaises(ValueError):
            process_session(self.input, output, settings(), Pipeline())
        self.assertFalse(output.exists())
        output = self.root / 'too-large-output'
        with patch('gaze.session_review.MAX_OUTPUT_BYTES', 1), self.assertRaises(ValueError):
            process_session(self.input, output, settings(), Pipeline())
        self.assertFalse((output / 'review.json').exists())

    def test_mirrored_configuration_must_match_inference(self):
        value = settings()
        value['mirrored'] = True
        with self.assertRaisesRegex(ValueError, 'mirroring'):
            process_session(self.input, self.root / 'mirror', value, Pipeline())

    def test_ambiguous_seat_breaks_history_and_cannot_keep_a_review_flag(self):
        class Crowded(Pipeline):
            def process(self, image):
                index = self.index
                result = super().process(image)
                if index == 5:
                    return ImageResult(64, 48, [FaceObservation((5, 5, 10, 10), 'left', {}, {}),
                                               FaceObservation((16, 5, 10, 10), 'right', {}, {})], 1., {})
                return result
        review = process_session(self.input, self.root / 'crowded', settings(), Crowded())
        self.assertEqual(review['frames'][5]['seats']['A']['reason'], 'ambiguous')
        self.assertEqual(review['frames'][5]['seats']['A']['direction'], 'unknown')
        self.assertEqual(review['frames'][5]['review_flags'], [])
        self.assertEqual(review['events'][1]['start_time'], 1.5)

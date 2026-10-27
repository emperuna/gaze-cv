"""Exercise actual file dispatch and outputs with a small injected inference adapter."""
import json
from pathlib import Path
import tempfile
import unittest
import cv2
import numpy as np
from gaze.pipeline import FaceObservation, ImageResult
from gaze.preprocessing import write_image, read_image
from gaze.runner import run_inputs


class Pipeline:
    metadata = {'method': 'injected', 'direction_convention': 'test'}

    def process(self, image):
        h, w = image.shape[:2]
        return ImageResult(w, h, [FaceObservation((10, 10, 40, 40), 'left', {}, {})], 1., {})


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.inputs = self.root / 'inputs'
        self.inputs.mkdir()
        self.image = np.zeros((100, 120, 3), np.uint8)

    def test_three_mixed_inputs_produce_distinct_visible_outputs_and_counts(self):
        write_image(self.inputs / 'same.jpg', self.image)
        write_image(self.inputs / 'same.png', self.image)
        clip = self.inputs / 'clip.avi'
        writer = cv2.VideoWriter(str(clip), cv2.VideoWriter_fourcc(*'MJPG'), 10., (120, 100))
        self.assertTrue(writer.isOpened())
        for _ in range(3):
            writer.write(self.image)
        writer.release()
        output = self.root / 'results'
        report = run_inputs(self.inputs, output, Pipeline())
        self.assertEqual(report['successful_inputs'], 3)
        self.assertEqual(report['failed_inputs'], 0)
        self.assertEqual(len({r['output'] for r in report['inputs']}), 3)
        for row in report['inputs']:
            destination = output / row['output']
            if row['kind'] == 'image':
                self.assertEqual(row['direction_counts'], {'left': 1})
                self.assertGreater(int(read_image(destination / 'annotated.png').sum()), 0)
                self.assertEqual(json.loads((destination / 'observations.json').read_text())['result']['detections'][0]['direction'], 'left')
            else:
                self.assertEqual(row['processed_frames'], 3)
                self.assertEqual(row['direction_counts'], {'left': 3})
                capture = cv2.VideoCapture(str(destination / 'annotated.avi'))
                self.assertTrue(capture.read()[0])
                capture.release()

    def test_invalid_file_does_not_prevent_valid_sibling_and_failure_is_recorded(self):
        (self.inputs / 'bad.jpg').write_bytes(b'broken')
        write_image(self.inputs / 'good.png', self.image)
        report = run_inputs(self.inputs, self.root / 'results', Pipeline())
        self.assertEqual((report['successful_inputs'], report['failed_inputs']), (1, 1))
        self.assertIn('Cannot decode', report['inputs'][0]['error'])

    def test_empty_unsupported_and_existing_output_fail_without_overwriting(self):
        with self.assertRaises(ValueError):
            run_inputs(self.inputs, self.root / 'empty', Pipeline())
        text = self.inputs / 'notes.txt'
        text.write_text('not media')
        with self.assertRaises(ValueError):
            run_inputs(text, self.root / 'unsupported', Pipeline())
        write_image(self.inputs / 'good.png', self.image)
        output = self.root / 'existing'
        output.mkdir()
        (output / 'keep.txt').write_text('keep')
        with self.assertRaises(ValueError):
            run_inputs(self.inputs, output, Pipeline())
        self.assertEqual((output / 'keep.txt').read_text(), 'keep')

    def test_output_cannot_be_inside_input_folder(self):
        write_image(self.inputs / 'good.png', self.image)
        with self.assertRaises(ValueError):
            run_inputs(self.inputs, self.inputs / 'nested', Pipeline())

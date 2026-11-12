"""Protect held-out splits, frozen settings and failure denominators."""
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np

from gaze.checkpoint_evaluation import evaluate_protocol, freeze_protocol
from gaze.preprocessing import write_image


class Pipeline:
    metadata = {'method': 'test injection', 'model_sha256': 'unchanged'}
    calls = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def process(self, image):
        type(self).calls += 1
        face = SimpleNamespace(direction='forward', unavailable_reason=None)
        return SimpleNamespace(detections=[face], to_dict=lambda: {'injected': True})


class HeldOutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.image = self.root / 'test.png'
        write_image(self.image, np.full((20, 30, 3), 127, np.uint8))
        self.sample = {'id': 'held-out', 'image': 'test.png', 'subject': 'test-person',
                       'source': 'test-series', 'split': 'test', 'label': 'forward',
                       'yaw': 0, 'pitch': 0, 'sha256': hashlib.sha256(self.image.read_bytes()).hexdigest()}
        self.manifest = self.root / 'manifest.json'
        self.write_manifest([self.sample])
        self.protocol = self.root / 'protocol.json'
        self.output = self.root / 'results.json'
        self.factories = {'baseline': Pipeline, 'head': Pipeline}
        Pipeline.calls = 0

    def write_manifest(self, samples):
        self.manifest.write_text(json.dumps({'schema_version': 1, 'dataset': 'synthetic-test',
                                             'samples': samples}), encoding='utf-8')

    def freeze(self):
        return freeze_protocol(self.manifest, self.protocol, self.root, factories=self.factories)

    def run_protocol(self):
        return evaluate_protocol(self.protocol, self.output, self.root, factories=self.factories)

    def test_freeze_never_runs_inference_and_both_methods_score_same_test(self):
        self.freeze()
        self.assertEqual(Pipeline.calls, 0)
        report = self.run_protocol()
        self.assertEqual(Pipeline.calls, 2)
        for method in ('baseline', 'head'):
            self.assertEqual(report['methods'][method]['metrics']['correct'], 1)
            self.assertEqual(report['methods'][method]['records'][0]['id'], 'held-out')

    def test_split_leakage_is_rejected_before_inference(self):
        other = {**self.sample, 'id': 'development', 'image': 'development.png', 'split': 'validation'}
        self.write_manifest([self.sample, other])
        with self.assertRaisesRegex(ValueError, 'leakage'):
            self.freeze()
        self.assertEqual(Pipeline.calls, 0)

    def test_manifest_changes_and_changed_pixels_stop_the_run(self):
        self.freeze()
        self.manifest.write_text(self.manifest.read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'Manifest differs'):
            self.run_protocol()
        self.assertFalse(self.output.exists())

    def test_checksum_mismatch_stops_before_either_method(self):
        self.freeze()
        self.image.write_bytes(b'changed pixels')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            self.run_protocol()
        self.assertEqual(Pipeline.calls, 0)

    def test_changed_model_or_settings_stop_run(self):
        self.freeze()
        class Changed(Pipeline):
            metadata = {**Pipeline.metadata, 'model_sha256': 'different'}
        self.factories['head'] = Changed
        with self.assertRaisesRegex(ValueError, 'settings differ'):
            self.run_protocol()
        self.assertFalse(self.output.exists())
        self.assertEqual(Pipeline.calls, 0)

    def test_checksum_valid_corrupt_input_counts_against_both_methods(self):
        self.image.write_bytes(b'not an image')
        self.sample['sha256'] = hashlib.sha256(self.image.read_bytes()).hexdigest()
        self.write_manifest([self.sample])
        self.freeze()
        report = self.run_protocol()
        for result in report['methods'].values():
            self.assertEqual(result['metrics']['eligible'], 1)
            self.assertEqual(result['metrics']['accuracy'], 0)
            self.assertEqual(result['records'][0]['unavailable_reason'], 'unreadable_image')

    def test_outputs_cannot_overwrite_protocol_or_existing_results(self):
        self.freeze()
        with self.assertRaises(ValueError):
            evaluate_protocol(self.protocol, self.protocol, self.root, factories=self.factories)
        self.run_protocol()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.run_protocol()


if __name__ == '__main__':
    unittest.main()

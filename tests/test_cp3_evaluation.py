"""Fixed-set metrics must count missing predictions and reject changed inputs."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import numpy as np
from gaze.pipeline import ImageResult
from gaze.preprocessing import write_image
from gaze.cp3_evaluation import evaluate_manifest, load_cp3_manifest, summarize_records, configuration_signature


class EmptyPipeline:
    metadata = {'method': 'test no detections'}

    def process(self, image):
        return ImageResult(image.shape[1], image.shape[0], [], 1., {})


class CP3EvaluationTests(unittest.TestCase):
    def test_freeze_comparison_is_portable_but_still_checks_model_hash_and_threshold(self):
        a = {'detector': {'model_path': '/machine/a/model', 'model_sha256': 'abc'}, 'threshold': .4}
        b = {'detector': {'model_path': 'F:/other/model', 'model_sha256': 'abc'}, 'threshold': .4}
        self.assertEqual(configuration_signature(a), configuration_signature(b))
        b['threshold'] = .5
        self.assertNotEqual(configuration_signature(a), configuration_signature(b))
        b['threshold'] = .4; b['detector']['model_sha256'] = 'changed'
        self.assertNotEqual(configuration_signature(a), configuration_signature(b))

    def test_unknowns_and_imbalanced_classes_have_honest_denominators(self):
        records = [dict(expected=label, predicted='unknown', unavailable_reason='no_head', cause='occlusion')
                   for label in ['forward', 'forward', 'forward', 'left', 'right', 'down']]
        scored = summarize_records(records)
        self.assertEqual(scored['metrics']['eligible'], 6)
        self.assertEqual(scored['metrics']['accuracy'], 0.)
        self.assertEqual(scored['metrics']['macro_f1'], 0.)
        self.assertEqual(scored['metrics']['coverage'], 0.)
        self.assertEqual(scored['failure_counts'], {'occlusion': 6})
        self.assertEqual(scored['metrics']['confusion_matrix']['forward']['unknown'], 3)

    def test_manifest_checksums_and_separation_are_checked_before_inference(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_image(root/'sample.png', np.zeros((80, 80, 3), np.uint8))
            sample = {'id': 'one', 'image': 'sample.png', 'sha256': hashlib.sha256((root/'sample.png').read_bytes()).hexdigest(),
                      'label': 'down', 'subject': 'new-person', 'source': 'new-recording', 'cause': 'blur', 'variant': 'original'}
            manifest = {'schema_version': 1, 'purpose': 'cp3_fixed_test',
                        'excluded_subjects': ['development-person'], 'excluded_sources': ['development-recording'],
                        'samples': [sample]}
            path = root/'manifest.json'
            path.write_text(json.dumps(manifest))
            loaded = load_cp3_manifest(path, root)
            report = evaluate_manifest(loaded, root, EmptyPipeline())
            self.assertEqual(report['metrics']['eligible'], 1)
            self.assertEqual(report['metrics']['unavailable'], 1)
            self.assertEqual(report['records'][0]['unavailable_reason'], 'no_detection')
            (root/'sample.png').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                load_cp3_manifest(path, root)

    def test_manifest_rejects_traversal_reused_subject_and_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_image(root/'sample.png', np.zeros((80, 80, 3), np.uint8))
            sample = {'id': 'one', 'image': 'sample.png', 'sha256': hashlib.sha256((root/'sample.png').read_bytes()).hexdigest(),
                      'label': 'left', 'subject': 'new-person', 'source': 'new-recording', 'cause': 'angle', 'variant': 'original'}
            for change in ['traversal', 'subject', 'source', 'duplicate']:
                manifest = {'schema_version': 1, 'purpose': 'cp3_fixed_test', 'excluded_subjects': ['old'],
                            'excluded_sources': ['old'], 'samples': [dict(sample)]}
                if change == 'traversal': manifest['samples'][0]['image'] = '../outside.png'
                if change == 'subject': manifest['samples'][0]['subject'] = 'old'
                if change == 'source': manifest['samples'][0]['source'] = 'old'
                if change == 'duplicate': manifest['samples'].append(dict(sample))
                path = root/'manifest.json'; path.write_text(json.dumps(manifest))
                with self.subTest(change=change), self.assertRaises(ValueError):
                    load_cp3_manifest(path, root)

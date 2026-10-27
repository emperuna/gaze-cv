import copy
import unittest
import numpy as np

from gaze.head_models import HeadDetection
from gaze.head_session import HeadPipeline, build_calibration, validate_calibration


CONFIG = {'schema_version': 1, 'seats': [{'id': 'a', 'roi': [0, 0, 1, 1]}]}
HASHES = {'head': '1'*64, 'pose': '2'*64}


class Models:
    metadata = {'model_sha256': HASHES}
    heads = [HeadDetection((20, 20, 50, 50), .95)]
    raw = [0, 0, 0]

    def detect(self, image, threshold=.5):
        return self.heads

    def angles(self, image, bbox):
        return np.array(self.raw)

    def close(self):
        pass


class HeadSessionTests(unittest.TestCase):
    def setUp(self):
        self.image = np.random.default_rng(4).integers(0, 255, (100, 120, 3), dtype=np.uint8)
        self.calibration = build_calibration(CONFIG, '3'*64, HASHES,
            {'a': [(0, [0, 0, 0]), (1, [1, 0, 0])]})

    def test_calibration_requires_each_seat_and_consistent_references(self):
        for references in [{}, {'a': [(0, [0, 0, 0]), (1, [90, 0, 0])]}]:
            with self.assertRaises(ValueError):
                build_calibration(CONFIG, '3'*64, HASHES, references)

    def test_stale_source_models_regions_or_mirroring_are_rejected(self):
        changed = copy.deepcopy(CONFIG)
        changed['seats'][0]['roi'][2] = .9
        for config, source, models, mirrored in [(changed, '3'*64, HASHES, False),
                (CONFIG, '4'*64, HASHES, False), (CONFIG, '3'*64, {'head': '5'*64}, False),
                (CONFIG, '3'*64, HASHES, True)]:
            with self.assertRaises(ValueError):
                validate_calibration(self.calibration, config, source, models, mirrored)

    def test_calibration_rejects_edited_neutral_or_reference_evidence(self):
        for edit in ('rotation', 'references', 'rotation_convention'):
            calibration = copy.deepcopy(self.calibration)
            if edit == 'rotation':
                calibration['seats']['a']['rotation'] = [[0,0,1],[0,1,0],[-1,0,0]]
            elif edit == 'references':
                calibration['seats']['a']['references'][0]['frame_index'] = -1
            else:
                calibration[edit] = 'old incompatible convention'
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                validate_calibration(calibration, CONFIG, '3'*64, HASHES)

    def test_head_without_landmarks_is_estimated_and_empty_seat_stays_empty(self):
        models = Models()
        models.raw = [-40, 0, 0]
        with HeadPipeline(CONFIG, self.calibration, models=models) as pipeline:
            result = pipeline.process(self.image)
            self.assertEqual(result.detections[0].direction, 'left')
            self.assertEqual(result.detections[0].landmarks, {})
            self.assertEqual(result.detections[0].estimation_source, 'head_pose_fallback')
            models.heads = []
            self.assertEqual(pipeline.process(self.image).detections, [])

    def test_crowded_or_blurry_seat_cannot_receive_direction(self):
        models = Models()
        models.heads = [HeadDetection((20, 20, 40, 50), .95), HeadDetection((65, 20, 40, 50), .95)]
        with HeadPipeline(CONFIG, self.calibration, models=models) as pipeline:
            result = pipeline.process(self.image)
            self.assertEqual([d.direction for d in result.detections], ['unknown', 'unknown'])
        models.heads = [HeadDetection((20, 20, 50, 50), .95)]
        with HeadPipeline(CONFIG, self.calibration, models=models) as pipeline:
            self.assertEqual(pipeline.process(np.zeros_like(self.image)).detections[0].unavailable_reason, 'head_blurry')

    def test_invalid_pose_output_is_unknown_and_serializable(self):
        import json
        models = Models()
        models.raw = [float('nan'), 0, 0]
        with HeadPipeline(CONFIG, self.calibration, models=models) as pipeline:
            result = pipeline.process(self.image)
            self.assertEqual(result.detections[0].direction, 'unknown')
            self.assertEqual(result.detections[0].unavailable_reason, 'invalid_head_pose_output')
            json.dumps(result.to_dict(), allow_nan=False)

    def test_mirrored_input_maps_boxes_back_without_changing_subject_direction(self):
        models = Models()
        models.raw = [-40, 0, 0]
        calibration = build_calibration(CONFIG, '3'*64, HASHES, {'a': [(0, [0, 0, 0])]}, mirrored=True)
        with HeadPipeline(CONFIG, calibration, models=models, mirrored=True) as pipeline:
            result = pipeline.process(self.image[:, ::-1].copy())
            self.assertEqual(result.detections[0].direction, 'left')
            self.assertEqual(result.detections[0].bbox, (50, 20, 50, 50))

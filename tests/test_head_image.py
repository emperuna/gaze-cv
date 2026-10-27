"""Automatic head inference must not need per-input calibration."""
import json
import unittest
import numpy as np
from gaze.head_models import HeadDetection
from gaze.head_image import HeadImagePipeline


class Models:
    metadata = {'backend': 'injected', 'model_sha256': {}}

    def __init__(self, angles=(0, 0, 0), heads=None):
        self.raw = angles
        self.heads = [HeadDetection((10, 20, 40, 50), .95)] if heads is None else heads

    def detect(self, image, threshold):
        return self.heads

    def angles(self, image, bbox):
        return self.raw

    def close(self):
        pass


class HeadImageTests(unittest.TestCase):
    def setUp(self):
        self.image = np.random.default_rng(8).integers(0, 255, (100, 120, 3), dtype=np.uint8)

    def test_camera_relative_directions_without_calibration(self):
        for angles, expected in [((0, 0, 0), 'forward'), ((-40, 0, 0), 'left'),
                                 ((40, 0, 0), 'right'), ((0, -40, 0), 'down')]:
            with self.subTest(angles=angles), HeadImagePipeline(models=Models(angles)) as pipeline:
                result = pipeline.process(self.image)
                self.assertEqual(result.detections[0].direction, expected)
                self.assertIn('camera_yaw_degrees', result.detections[0].scores)
                self.assertNotIn('seat_yaw_degrees', result.detections[0].scores)

    def test_mirroring_maps_source_boxes_and_preserves_direction(self):
        with HeadImagePipeline(models=Models((-40, 0, 0)), mirrored=True) as pipeline:
            result = pipeline.process(self.image[:, ::-1].copy())
        self.assertEqual(result.detections[0].bbox, (70, 20, 40, 50))
        self.assertEqual(result.detections[0].direction, 'left')

    def test_multiple_heads_are_independent_and_empty_stays_empty(self):
        models = Models(heads=[HeadDetection((10, 20, 40, 50), .95), HeadDetection((65, 20, 40, 50), .9)])
        with HeadImagePipeline(models=models) as pipeline:
            self.assertEqual([d.direction for d in pipeline.process(self.image).detections], ['forward', 'forward'])
            models.heads = []
            self.assertEqual(pipeline.process(self.image).detections, [])

    def test_invalid_pose_and_blur_are_unknown_and_serializable(self):
        for image, angles, reason in [(self.image, (float('nan'), 0, 0), 'invalid_head_pose_output'),
                                      (np.zeros_like(self.image), (0, 0, 0), 'head_blurry')]:
            with self.subTest(reason=reason), HeadImagePipeline(models=Models(angles)) as pipeline:
                result = pipeline.process(image)
                self.assertEqual(result.detections[0].direction, 'unknown')
                self.assertEqual(result.detections[0].unavailable_reason, reason)
                json.dumps(result.to_dict(), allow_nan=False)

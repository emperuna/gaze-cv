import unittest
import numpy as np

from gaze.head_pose import HeadSettings, model_rotation, relative_direction, head_quality
from gaze.head_models import decode_heads, detector_input, pose_input


class HeadGeometryTests(unittest.TestCase):
    def test_coordinate_conversion_preserves_coupled_rotation(self):
        # Hand-derived S @ (Rz(90) Ry(30) Rx(20)) @ S, S=diag(-1,1,1).
        expected = [[0, .93969262, -.34202014],
                    [-.86602540, .17101007, .46984631],
                    [.5, .29619813, .81379768]]
        np.testing.assert_allclose(model_rotation([30,20,90]), expected, atol=1e-7)
    def test_subject_directions_and_mixed_pose(self):
        neutral = np.eye(3)
        for raw, expected in [([0, 0, 0], 'forward'), ([-35, 0, 0], 'left'),
                              ([35, 0, 0], 'right'), ([0, -35, 0], 'down'),
                              ([-35, -35, 0], 'unknown'), ([0, 35, 0], 'unknown')]:
            with self.subTest(raw=raw):
                direction, scores, reason = relative_direction(model_rotation(raw), neutral)
                self.assertEqual(direction, expected)
                self.assertEqual(reason is not None, expected == 'unknown')

    def test_neutral_rotation_wrap_and_seat_forward(self):
        self.assertEqual(relative_direction(model_rotation([-179, 0, 0]),
                                            model_rotation([179, 0, 0]))[0], 'forward')
        self.assertEqual(relative_direction(model_rotation([60, 0, 0]),
                                            model_rotation([90, 0, 0]))[0], 'left')

    def test_invalid_rotations_and_settings_rejected(self):
        for rotation in [np.zeros((3, 3)), np.diag([-1, 1, 1]), np.full((3, 3), np.nan)]:
            with self.assertRaises(ValueError):
                relative_direction(rotation, np.eye(3))
        for kwargs in [{'min_head_pixels': 0}, {'min_detection_score': 2},
                       {'min_blur_variance': -1}, {'max_clipped_fraction': 1}]:
            with self.assertRaises(ValueError):
                HeadSettings(**kwargs)

    def test_quality_rejects_empty_tiny_clipped_and_blurry_heads(self):
        image = np.random.default_rng(3).integers(0, 256, (100, 120, 3), dtype=np.uint8)
        self.assertIsNone(head_quality(image, (20, 20, 50, 50), .9))
        self.assertEqual(head_quality(image, (20, 20, 10, 10), .9), 'head_too_small')
        self.assertEqual(head_quality(image, (-30, 20, 50, 50), .9), 'head_clipped')
        self.assertEqual(head_quality(np.zeros_like(image), (20, 20, 50, 50), .9), 'head_blurry')
        self.assertEqual(head_quality(image, (20, 20, 50, 50), .1), 'head_detection_score')


class HeadAdapterTests(unittest.TestCase):
    def test_detector_decodes_xyxy_and_excludes_nonheads(self):
        rows = np.array([[0, 0, 64, 128, 192, 256, .9],
                         [0, 1, 0, 0, 64, 64, .9],
                         [0, 0, 0, 0, 64, 64, .1]])
        heads = decode_heads(rows, 1280, 720, .5)
        self.assertEqual(len(heads), 1)
        self.assertEqual(heads[0].bbox, (128, 144, 256, 144))

    def test_model_inputs_match_rgb_normalization_and_center_crop(self):
        image = np.full((60, 80, 3), (0, 0, 255), dtype=np.uint8)
        inp = detector_input(image)
        self.assertEqual(inp.shape, (1, 3, 640, 640))
        np.testing.assert_allclose(inp[0, :, 0, 0], [1, 0, 0])
        pose = pose_input(image)
        self.assertEqual(pose.shape, (1, 3, 224, 224))
        np.testing.assert_allclose(pose[0, :, 0, 0], [2.2489083, -2.0357143, -1.8044444], rtol=1e-5)

    def test_corrupt_detector_outputs_fail_closed(self):
        for rows in [np.ones((3, 6)), np.array([[0, 0, 0, 0, float('nan'), 80, .9]])]:
            with self.assertRaises(ValueError):
                decode_heads(rows, 100, 100, .5)

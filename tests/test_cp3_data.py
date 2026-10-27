import unittest
import numpy as np
from gaze.cp3_data import stress_variant


class CP3DataTests(unittest.TestCase):
    def test_stress_does_not_change_direction_geometry_or_dtype(self):
        image = np.full((100, 200, 3), 100, np.uint8)
        darker = stress_variant(image, 'low_light')
        self.assertEqual(darker.shape, image.shape)
        self.assertEqual(darker.dtype, np.uint8)
        self.assertEqual(int(darker[50, 100, 0]), 18)
        occluded = stress_variant(image, 'occlusion')
        self.assertEqual(int(occluded[0, 0, 0]), 100)
        self.assertEqual(int(occluded[55, 100, 0]), 96)
        with self.assertRaises(ValueError): stress_variant(image, 'not-a-variant')

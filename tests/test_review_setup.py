import tempfile
from pathlib import Path
import unittest

import cv2
import numpy as np

from gaze.review_setup import inspect_video, check_timestamps, suggest_seats
from gaze.pipeline import FaceObservation, ImageResult


class Detector:
    def __init__(self, observations):
        self.observations = iter(observations)
    def process(self, image):
        boxes = next(self.observations)
        return ImageResult(200, 100, [FaceObservation(box, 'unknown', {}, {}) for box in boxes], 1., {})


class ReviewSetupTests(unittest.TestCase):
    def test_timing_accepts_quantized_cfr_and_rejects_variable_or_unavailable_times(self):
        timing = check_timestamps([0., 17., 33., 50., 67.], 60.)
        self.assertTrue(timing['verified'])
        self.assertLess(timing['max_deviation_ms'], 1.)
        for values in [[0., 17., 80., 97.], [0., 0., 0.], [0.], [0., float('nan')]]:
            with self.subTest(values=values), self.assertRaises(ValueError):
                check_timestamps(values, 60.)

    def test_real_cfr_decode_is_checked_and_samples_span_the_clip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cfr.avi'
            writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'MJPG'), 10., (200, 100))
            self.assertTrue(writer.isOpened())
            for _ in range(20):
                writer.write(np.zeros((100, 200, 3), np.uint8))
            writer.release()
            timing, samples = inspect_video(path)
            self.assertTrue(timing['verified'])
            self.assertEqual(timing['frames'], 20)
            self.assertEqual(timing['sample_indices'], [0, 5, 10, 14, 19])
            self.assertEqual(len(samples), 5)

    def test_suggestions_require_persistent_detections_and_return_nonoverlapping_regions(self):
        images = [np.zeros((100, 200, 3), np.uint8) for _ in range(3)]
        detector = Detector([[(20, 20, 20, 30), (130, 20, 20, 30), (80, 80, 10, 10)],
                             [(22, 20, 20, 30), (128, 20, 20, 30)],
                             [(21, 20, 20, 30), (131, 20, 20, 30)]])
        result = suggest_seats(images, detector)
        self.assertEqual(len(result['seats']), 2)
        first, second = result['seats']
        self.assertEqual(first['id'], 'seat-1')
        self.assertLess(first['roi'][2], second['roi'][0])
        for seat in result['seats']:
            self.assertTrue(all(0 <= value <= 1 for value in seat['roi']))

    def test_zero_heads_keeps_manual_setup_available_without_inventing_seats(self):
        images = [np.zeros((100, 200, 3), np.uint8) for _ in range(3)]
        result = suggest_seats(images, Detector([[], [], []]))
        self.assertEqual(result['seats'], [])
        self.assertIn('manually', result['note'])

    def test_nearby_heads_in_one_frame_are_not_combined_as_one_seat(self):
        images = [np.zeros((100, 200, 3), np.uint8) for _ in range(3)]
        result = suggest_seats(images, Detector([[(70, 20, 8, 15), (82, 20, 8, 15)]] * 3))
        self.assertEqual(len(result['seats']), 2)

    def test_padding_cannot_discard_another_distinct_stable_head(self):
        images = [np.zeros((100, 200, 3), np.uint8) for _ in range(3)]
        result = suggest_seats(images, Detector([[(70, 20, 8, 15), (80, 20, 8, 15)]] * 3))
        self.assertEqual(len(result['seats']), 2)
        self.assertLessEqual(result['seats'][0]['roi'][2], result['seats'][1]['roi'][0])


class Boxes:
    """A pipeline that always returns the same boxes."""
    def __init__(self, boxes):
        self.boxes, self.calls = boxes, 0

    def process(self, image):
        self.calls += 1
        return ImageResult(200, 100, [FaceObservation(box, 'unknown', {}, {}) for box in self.boxes], 1., {})


class FacesAndHeadsTests(unittest.TestCase):
    def test_a_head_around_a_found_face_is_the_same_person(self):
        from gaze.review_setup import FacesAndHeads
        found = FacesAndHeads(Boxes([(20, 30, 20, 20)]), Boxes([(15, 20, 30, 35), (130, 20, 30, 35)])).process(None)
        self.assertEqual([d.bbox for d in found.detections], [(20, 30, 20, 20), (130, 20, 30, 35)])

    def test_a_student_looking_down_during_setup_still_gets_a_seat(self):
        from gaze.review_setup import FacesAndHeads
        images = [np.zeros((100, 200, 3), np.uint8) for _ in range(3)]
        faces_only = suggest_seats(images, Boxes([(20, 30, 20, 20)]))
        both = suggest_seats(images, FacesAndHeads(Boxes([(20, 30, 20, 20)]), Boxes([(130, 20, 30, 35)])))
        self.assertEqual(len(faces_only['seats']), 1)
        self.assertEqual(len(both['seats']), 2)

    def test_a_tiny_head_far_smaller_than_everyone_else_is_ignored(self):
        # e.g. a photo on a poster: a head-only find under a third of the typical person's width.
        from gaze.review_setup import FacesAndHeads
        found = FacesAndHeads(Boxes([(20, 30, 30, 30)]), Boxes([(15, 20, 40, 45), (130, 20, 36, 40), (180, 5, 9, 8)])).process(None)
        self.assertEqual([d.bbox for d in found.detections], [(20, 30, 30, 30), (130, 20, 36, 40)])

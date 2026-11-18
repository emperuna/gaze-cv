"""Live seat monitoring reuses the saved-video movement rules."""
import base64
import unittest

import cv2
import numpy as np

from gaze.live_session import LiveSeatMonitor, crop_still
from gaze.pipeline import FaceObservation, ImageResult

W, H = 200, 100


def config(max_gap=.75, roi=(0, 0, .5, 1)):
    return {'seats': [{'id': 'seat-1', 'roi': list(roi)}],
            'movement': {'min_duration': 2., 'repetition_count': 3, 'repetition_window': 10.,
                         'max_gap': max_gap, 'repeat_min_duration': .25}}


def result(direction):
    return ImageResult(W, H, [FaceObservation((40, 30, 20, 20), direction, {}, {})], 1., {})


def run(direction, times, open_alerts=frozenset(), **kwargs):
    monitor = LiveSeatMonitor(config(**kwargs), False)
    image = np.full((H, W, 3), 128, np.uint8)
    events = []
    for t in times:
        events += monitor.update(t, result(direction), image, set(open_alerts))['events']
    return events


class LiveSeatMonitorTests(unittest.TestCase):
    times = [round(.3 * i, 1) for i in range(8)]

    def test_sustained_right_emits_one_event_with_still(self):
        events = run('right', self.times)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['event_type'], 'sustained_movement')
        self.assertTrue(events[0]['review_required'])
        data = base64.b64decode(events[0]['still'])
        self.assertTrue(data.startswith(b'\xff\xd8'))
        self.assertLessEqual(len(data), 200_000)
        self.assertIsNotNone(cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR))

    def test_no_still_when_alert_open(self):
        events = run('right', self.times, {('seat-1', 'right')})
        self.assertEqual(len(events), 1)
        self.assertNotIn('still', events[0])

    def test_down_never_has_still(self):
        events = run('down', [i * .5 for i in range(7)])
        self.assertEqual(len(events), 1)
        self.assertFalse(events[0]['review_required'])
        self.assertNotIn('still', events[0])

    def test_gap_over_max_gap_prevents_event(self):
        self.assertEqual(run('right', [i * .9 for i in range(6)]), [])

    def test_seat_states_report_direction_and_reason(self):
        monitor = LiveSeatMonitor(config(), False)
        image = np.zeros((H, W, 3), np.uint8)
        seats = monitor.update(0., result('left'), image, set())['seats']
        self.assertEqual(seats, {'seat-1': {'direction': 'left', 'reason': None}})
        empty = ImageResult(W, H, [], 1., {})
        seats = monitor.update(.3, empty, image, set())['seats']
        self.assertEqual(seats['seat-1'], {'direction': 'unknown', 'reason': 'missing'})

    def test_crop_clamped_at_frame_edge(self):
        crop = cv2.imdecode(np.frombuffer(crop_still(np.zeros((H, W, 3), np.uint8), [.9, .9, 1, 1], False),
                                          np.uint8), cv2.IMREAD_COLOR)
        self.assertTrue(0 < crop.shape[0] <= H and 0 < crop.shape[1] <= W)

    def test_mirrored_crop_matches_drawn_region(self):
        # ROIs are canonical; a mirrored frame shows canonical [0, .5] on its right half.
        image = np.zeros((100, 100, 3), np.uint8)
        image[:, 50:] = 255
        crop = cv2.imdecode(np.frombuffer(crop_still(image, [0, 0, .5, 1], True), np.uint8), cv2.IMREAD_COLOR)
        self.assertGreater(crop.mean(), 200)
        plain = cv2.imdecode(np.frombuffer(crop_still(image, [0, 0, .5, 1], False), np.uint8), cv2.IMREAD_COLOR)
        self.assertLess(plain.mean(), 60)


if __name__ == '__main__':
    unittest.main()

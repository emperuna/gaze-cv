import unittest

from gaze.events import MovementMonitor, MovementSettings


class ReviewTests(unittest.TestCase):
    def test_sideways_requires_threshold_and_unknown_clears_overlay(self):
        monitor = MovementMonitor(['a'], MovementSettings(min_duration=1, max_gap=.5))
        monitor.update(0, {'a': 'left'})
        self.assertEqual(monitor.review_flags(), [])
        monitor.update(.5, {'a': 'left'})
        events = monitor.update(1, {'a': 'left'})
        self.assertTrue(events[0]['review_required'])
        self.assertEqual(events[0]['review_label'], 'For instructor review')
        self.assertEqual(monitor.review_flags()[0]['seat_id'], 'a')
        monitor.update(1.5, {'a': 'unknown'})
        self.assertEqual(monitor.review_flags(), [])

    def test_down_is_recorded_without_sideways_review_flag(self):
        monitor = MovementMonitor(['a'], MovementSettings(min_duration=.5))
        monitor.update(0, {'a': 'down'})
        event = monitor.update(.5, {'a': 'down'})[0]
        self.assertFalse(event['review_required'])
        self.assertEqual(monitor.review_flags(), [])

    def test_method_switch_cannot_accumulate_duration(self):
        monitor = MovementMonitor(['a'], MovementSettings(min_duration=1, max_gap=.5))
        monitor.update(0, {'a': 'right'}, {'a': 'facial_landmarks'})
        monitor.update(.5, {'a': 'right'}, {'a': 'facial_landmarks'})
        self.assertEqual(monitor.update(1, {'a': 'right'}, {'a': 'head_pose_fallback'}), [])
        monitor.update(1.5, {'a': 'right'}, {'a': 'head_pose_fallback'})
        event = monitor.update(2, {'a': 'right'}, {'a': 'head_pose_fallback'})[0]
        self.assertEqual(event['start_time'], 1)
        self.assertEqual(event['estimation_source'], 'head_pose_fallback')

    def test_repetition_notification_expires(self):
        monitor = MovementMonitor(['a'], MovementSettings(min_duration=10,
            repetition_count=2, repeat_min_duration=.25, max_gap=.5))
        for t, d in [(0, 'left'), (.25, 'left'), (.5, 'forward'), (.75, 'left'), (1, 'left')]:
            monitor.update(t, {'a': d})
        self.assertEqual(monitor.review_flags()[0]['event_type'], 'repeated_movement')
        for t in [1.5, 2, 2.5, 3, 3.5]:
            monitor.update(t, {'a': 'left'})
        self.assertEqual(monitor.review_flags(), [])

    def test_bad_source_does_not_mutate_monitor(self):
        monitor = MovementMonitor(['a'])
        before = monitor.to_dict()
        with self.assertRaises(ValueError):
            monitor.update(0, {'a': 'left'}, {'a': ''})
        self.assertEqual(before, monitor.to_dict())
        self.assertIsNone(monitor.last_timestamp)

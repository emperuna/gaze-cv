"""Check source-time continuity, disappearances, and unknown history entries."""

import json
from types import SimpleNamespace
import unittest

from gaze.history import HistoryTracker
from gaze.seats import AssociationResult


def association(direction="left", reason=None, unavailable=None):
    face = None if reason else SimpleNamespace(direction=direction, unavailable_reason=unavailable)
    return AssociationResult({"a": face}, {"a": reason}, {"a": 0 if face else None}, [])


class HistoryTests(unittest.TestCase):
    def test_duration_uses_source_span_and_resets_at_direction_change(self):
        tracker = HistoryTracker(["a"], max_gap_seconds=1)
        first = tracker.update(2, association())[0]
        second = tracker.update(2.4, association())[0]
        third = tracker.update(2.5, association("right"))[0]
        self.assertEqual(first.continuous_seconds, 0)
        self.assertAlmostEqual(second.continuous_seconds, .4)
        self.assertEqual(third.continuous_seconds, 0)
        self.assertNotEqual(second.segment_id, third.segment_id)

    def test_disappearance_and_reappearance_never_bridge_gap(self):
        tracker = HistoryTracker(["a"])
        tracker.update(0, association())
        tracker.update(.1, association())
        missing = tracker.update(.2, association(reason="missing"))[0]
        returned = tracker.update(.3, association())[0]
        self.assertFalse(missing.valid)
        self.assertEqual(missing.direction, "unknown")
        self.assertEqual(missing.reason, "missing")
        self.assertEqual(returned.continuous_seconds, 0)
        self.assertEqual(returned.segment_id, 1)

    def test_ambiguous_and_unreliable_observations_reset_continuity(self):
        for unavailable in ("unknown", "ambiguous", "degenerate_face_geometry"):
            with self.subTest(unavailable=unavailable):
                tracker = HistoryTracker(["a"])
                tracker.update(0, association())
                value = association(direction="unknown") if unavailable == "unknown" else (
                    association(reason="ambiguous") if unavailable == "ambiguous" else association(unavailable=unavailable))
                invalid = tracker.update(.1, value)[0]
                self.assertFalse(invalid.valid)
                self.assertEqual(invalid.direction, "unknown")
                self.assertEqual(tracker.update(.2, association())[0].continuous_seconds, 0)

    def test_unobserved_source_gap_starts_new_segment(self):
        tracker = HistoryTracker(["a"], max_gap_seconds=.3)
        tracker.update(.1, association())
        self.assertAlmostEqual(tracker.update(.4, association())[0].continuous_seconds, .3)
        after = tracker.update(.701, association())[0]
        self.assertEqual(after.continuous_seconds, 0)
        self.assertEqual(after.segment_id, 1)

    def test_timestamp_validation_leaves_prior_history_intact(self):
        tracker = HistoryTracker(["a"])
        tracker.update(1, association())
        for timestamp in (-1, 1, .5, float("nan"), float("inf"), True):
            with self.subTest(timestamp=timestamp), self.assertRaises(ValueError):
                tracker.update(timestamp, association())
        self.assertEqual(len(tracker.entries["a"]), 1)
        tracker.update(1.1, association())
        self.assertEqual(len(tracker.entries["a"]), 2)

    def test_all_configured_seats_required(self):
        tracker = HistoryTracker(["a", "b"])
        with self.assertRaises(ValueError):
            tracker.update(0, association())
        self.assertEqual(tracker.entries, {"a": [], "b": []})

    def test_options_and_json_serialization(self):
        for seats, gap in (([], .25), (["a", "a"], .25), (["a"], 0), (["a"], float("nan"))):
            with self.assertRaises(ValueError):
                HistoryTracker(seats, gap)
        tracker = HistoryTracker(["a"])
        tracker.update(0, association(reason="missing"))
        result = json.loads(json.dumps(tracker.to_dict(), allow_nan=False))
        self.assertFalse(result["seats"]["a"][0]["valid"])
        self.assertIsNone(result["seats"]["a"][0]["segment_id"])


if __name__ == "__main__":
    unittest.main()

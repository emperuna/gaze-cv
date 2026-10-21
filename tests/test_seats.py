"""Check fixed-position association without models or downloaded footage."""

import json
from dataclasses import dataclass
import unittest

from gaze.seats import SeatAssociator


@dataclass
class FakeFace:
    bbox: tuple
    direction: str = "forward"
    unavailable_reason: str | None = None

    def to_dict(self):
        return {"bbox": self.bbox, "direction": self.direction}


def configuration():
    return {"schema_version": 1, "seats": [
        {"id": "a", "roi": [0, 0, .5, 1]},
        {"id": "b", "roi": [.5, 0, 1, 1]},
    ]}


class SeatTests(unittest.TestCase):
    def test_frame_order_changes_do_not_change_seat_positions(self):
        associator = SeatAssociator(configuration())
        left, right = FakeFace((10, 20, 20, 20)), FakeFace((70, 20, 20, 20))
        first = associator.associate([left, right], 100, 100)
        second = associator.associate([right, left], 100, 100)
        self.assertIs(first.assignments["a"], left)
        self.assertIs(second.assignments["a"], left)
        self.assertEqual(second.detection_indices, {"a": 1, "b": 0})

    def test_two_faces_in_region_are_both_ambiguous(self):
        result = SeatAssociator(configuration()).associate([
            FakeFace((10, 20, 10, 10)), FakeFace((20, 20, 10, 10))], 100, 100)
        self.assertIsNone(result.assignments["a"])
        self.assertEqual(result.seat_reasons, {"a": "ambiguous", "b": "missing"})
        self.assertEqual([r["reason"] for r in result.unassigned], ["crowded_seat_region"] * 2)
        self.assertEqual(len(result.unassigned), 2)

    def test_shared_border_belongs_to_region_on_right(self):
        face = FakeFace((40, 20, 20, 20))  # center is exactly x=.5
        result = SeatAssociator(configuration()).associate([face], 100, 100)
        self.assertIsNone(result.assignments["a"])
        self.assertIs(result.assignments["b"], face)

    def test_image_outer_edge_is_included(self):
        face = FakeFace((90, 90, 20, 20))  # center at (1,1)
        result = SeatAssociator(configuration()).associate([face], 100, 100)
        self.assertIs(result.assignments["b"], face)

    def test_outside_and_invalid_detections_remain_unassigned(self):
        config = {"schema_version": 1, "seats": [{"id": "a", "roi": [.2, .2, .8, .8]}]}
        faces = [FakeFace((0, 0, 10, 10)), FakeFace((120, 0, 10, 10)),
                 FakeFace((0, 0, 0, 10)), FakeFace((float("nan"), 0, 10, 10))]
        result = SeatAssociator(config).associate(faces, 100, 100)
        self.assertEqual([row["reason"] for row in result.unassigned], [
            "outside_seat_regions", "outside_image", "invalid_bbox", "invalid_bbox"])
        self.assertEqual(result.seat_reasons["a"], "missing")

    def test_invalid_configs_rejected(self):
        bad = [
            {"schema_version": 2, "seats": []},
            {"schema_version": 1, "seats": []},
            {"schema_version": 1, "seats": [{"id": "a", "roi": [0, 0, 0, 1]}]},
            {"schema_version": 1, "seats": [{"id": "a", "roi": [0, 0, 2, 1]}]},
            {"schema_version": 1, "seats": [{"id": "a", "roi": [0, 0, float("nan"), 1]}]},
            {"schema_version": 1, "seats": [{"id": "a", "roi": [0, 0, 1, 1]}, {"id": "a", "roi": [0, 0, 1, 1]}]},
            {"schema_version": 1, "seats": [{"id": "a", "roi": [0, 0, .6, 1]}, {"id": "b", "roi": [.5, 0, 1, 1]}]},
        ]
        for config in bad:
            with self.subTest(config=config), self.assertRaises(ValueError):
                SeatAssociator(config)

    def test_dimensions_rejected_and_results_serialize(self):
        associator = SeatAssociator(configuration())
        for width, height in ((0, 10), (10, -1), (float("nan"), 10)):
            with self.assertRaises(ValueError):
                associator.associate([], width, height)
        result = associator.associate([FakeFace((10, 20, 20, 20))], 100, 100)
        value = json.loads(json.dumps(result.to_dict(), allow_nan=False))
        self.assertEqual(value["seats"]["a"]["detection_index"], 0)
        self.assertEqual(SeatAssociator(associator.to_dict()).seat_ids, ["a", "b"])


if __name__ == "__main__":
    unittest.main()

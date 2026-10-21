"""Video behavior tests use generated geometric frames, never pose evidence."""
from pathlib import Path
from types import SimpleNamespace
import json
import tempfile
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np

from gaze.video import VideoError, process_video, source_timestamp


class FakeResult:
    def __init__(self):
        self.detections = [SimpleNamespace(direction=d) for d in ("forward", "unknown", "left")]

    def to_dict(self):
        return {"detections": [{"direction": face.direction} for face in self.detections]}


class FakePipeline:
    def process(self, frame):
        time.sleep(0.001)  # Measurable processing delay must never change source time.
        return FakeResult()


class VideoTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.clip = self.root / "geometry.avi"
        writer = cv2.VideoWriter(str(self.clip), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (160, 120))
        self.assertTrue(writer.isOpened(), "MJPG video writer is required for behavioral tests")
        for index in range(6):
            frame = np.zeros((120, 160, 3), dtype=np.uint8)
            cv2.rectangle(frame, (index * 10, 20), (index * 10 + 20, 70), (255, 255, 255), -1)
            writer.write(frame)
        writer.release()

    def run_clip(self, **kwargs):
        return process_video(self.clip, self.root / "output", FakePipeline(),
                             annotate_fn=lambda frame, result: frame.copy(), **kwargs)

    def test_source_time_is_independent_of_processing_time(self):
        summary = self.run_clip(expected_faces=4, warmup_frames=2)
        records = [json.loads(line) for line in (self.root / "output/observations.jsonl").read_text().splitlines()]
        self.assertEqual([row["frame_index"] for row in records], list(range(6)))
        self.assertEqual([row["source_timestamp_seconds"] for row in records], [n / 10 for n in range(6)])
        self.assertEqual(summary["processed_frames"], 6)
        self.assertEqual(summary["timing"]["measured_frames"], 4)
        self.assertEqual(summary["unknown_observations"], 6)
        self.assertEqual(summary["frames_with_at_least_three_faces"], 6)
        self.assertEqual(summary["count_deficit_observations"], 6)
        self.assertEqual(records[0]["result"]["detections"][1]["direction"], "unknown")
        self.assertAlmostEqual(summary["source"]["last_timestamp_seconds"], 0.5)
        output = cv2.VideoCapture(str(self.root / "output/annotated.avi"))
        try:
            self.assertEqual(int(output.get(cv2.CAP_PROP_FRAME_COUNT)), 6)
            self.assertEqual(output.get(cv2.CAP_PROP_FPS), 10.0)
        finally:
            output.release()

    def test_frame_limit_and_warmup_have_no_invented_fps(self):
        summary = self.run_clip(max_frames=2, warmup_frames=5)
        self.assertEqual(summary["processed_frames"], 2)
        self.assertIsNone(summary["timing"]["processing_fps"])
        self.assertIsNone(summary["count_deficit_observations"])
        self.assertTrue(summary["stopped_at_requested_limit"])

    def test_evidence_and_no_silent_overwrite(self):
        evidence = self.root / "evidence.jpg"
        summary = self.run_clip(evidence_frame=evidence)
        self.assertTrue(evidence.is_file())
        self.assertEqual(summary["evidence_frame"], str(evidence))
        with self.assertRaisesRegex(VideoError, "already contains"):
            self.run_clip()

    def test_missing_and_undecodable_inputs(self):
        with self.assertRaisesRegex(VideoError, "does not exist"):
            process_video(self.root / "missing.avi", self.root / "output", FakePipeline())
        self.clip.write_bytes(b"not a video")
        with self.assertRaisesRegex(VideoError, "Cannot decode"):
            self.run_clip()

    def test_invalid_timing_values_are_rejected(self):
        for fps in (0, -1, float("nan"), float("inf")):
            with self.subTest(fps=fps), self.assertRaises(VideoError):
                source_timestamp(0, fps)
        with self.assertRaises(VideoError):
            source_timestamp(-1, 10)
        with self.assertRaisesRegex(VideoError, "positive"):
            self.run_clip(max_frames=0)

    def test_seat_gaps_and_events_use_video_source_time(self):
        from gaze.pipeline import FaceObservation
        from gaze.seats import SeatAssociator
        from gaze.history import HistoryTracker
        from gaze.events import MovementMonitor, MovementSettings
        config = {"schema_version": 1, "seats": [{"id": "seat-1", "roi": [0, 0, 1, 1]}]}
        associator = SeatAssociator(config)
        tracker = HistoryTracker(associator.seat_ids, max_gap_seconds=.15)
        monitor = MovementMonitor(associator.seat_ids, MovementSettings(min_duration=.15, max_gap=.15))
        class GapPipeline:
            index = 0
            def process(self, frame):
                result = FakeResult()
                result.detections = [] if self.index == 2 else [FaceObservation((30,30,30,30), "left", {}, {})]
                self.index += 1
                return result
        summary = process_video(self.clip, self.root / "seated", GapPipeline(),
                                annotate_fn=lambda frame, result: frame.copy(),
                                seat_associator=associator, history_tracker=tracker,
                                seat_config=config, movement_monitor=monitor)
        history = json.loads((self.root / "seated/seat_history.json").read_text())["seats"]["seat-1"]
        self.assertEqual([entry["timestamp_seconds"] for entry in history], [n/10 for n in range(6)])
        self.assertEqual(history[2]["direction"], "unknown")
        self.assertFalse(history[2]["valid"])
        self.assertNotEqual(history[1]["segment_id"], history[3]["segment_id"])
        self.assertAlmostEqual(history[5]["continuous_seconds"], .2)
        events = json.loads((self.root / "seated/events.json").read_text())
        self.assertEqual(len(events["events"]), 1)
        self.assertAlmostEqual(events["events"][0]["start_time"], .3)
        self.assertAlmostEqual(events["events"][0]["end_time"], .5)
        self.assertEqual(summary["movement_events_file"], "events.json")
        self.assertEqual(events["input_sha256"], summary["input_sha256"])

    def test_events_cannot_bridge_a_gap_that_breaks_history(self):
        from gaze.seats import SeatAssociator
        from gaze.history import HistoryTracker
        from gaze.events import MovementMonitor, MovementSettings
        config = {"schema_version": 1, "seats": [{"id": "seat-1", "roi": [0,0,1,1]}]}
        associator = SeatAssociator(config)
        tracker = HistoryTracker(associator.seat_ids, max_gap_seconds=.15)
        monitor = MovementMonitor(associator.seat_ids, MovementSettings(max_gap=.25))
        with self.assertRaisesRegex(VideoError, "cannot exceed"):
            self.run_clip(seat_associator=associator, history_tracker=tracker,
                          movement_monitor=monitor, seat_config=config)

    def test_seat_configuration_is_bound_to_video_when_hash_is_supplied(self):
        with self.assertRaisesRegex(VideoError, "checksum"):
            self.run_clip(seat_config={"source_sha256": "bad"})

    def test_odd_source_edges_are_padded_instead_of_silently_truncated(self):
        frames = iter([(True, np.zeros((121,161,3), dtype=np.uint8)) for _ in range(2)] + [(False,None)])
        capture = SimpleNamespace(isOpened=lambda:True, release=lambda:None,
                                  get=lambda key:10 if key==cv2.CAP_PROP_FPS else 2,
                                  read=lambda:next(frames))
        with patch("gaze.video.cv2.VideoCapture", return_value=capture):
            summary = self.run_clip()
        self.assertEqual((summary["source"]["width"], summary["source"]["height"]), (161,121))
        self.assertEqual((summary["output"]["padding_right"],summary["output"]["padding_bottom"]),(1,1))
        decoded = cv2.VideoCapture(str(self.root / "output/annotated.avi"))
        try:
            ok, frame = decoded.read()
            self.assertTrue(ok)
            self.assertEqual(frame.shape[:2], (122,162))
        finally:
            decoded.release()

    def test_evidence_cannot_overwrite_source_or_use_a_nonimage_extension(self):
        original = self.clip.read_bytes()
        with self.assertRaisesRegex(VideoError, "already exists"):
            self.run_clip(evidence_frame=self.clip)
        self.assertEqual(self.clip.read_bytes(), original)
        with self.assertRaisesRegex(VideoError, "supported image extension"):
            self.run_clip(evidence_frame=self.root / "output/summary.json")
        self.assertFalse((self.root / "output/observations.jsonl").exists())

    def test_concurrent_observation_file_is_not_truncated(self):
        target = self.root / "output/observations.jsonl"
        original_capture = cv2.VideoCapture
        def competing_capture(path):
            target.write_bytes(b"other run observations")
            return original_capture(path)
        with patch("gaze.video.cv2.VideoCapture", side_effect=competing_capture):
            with self.assertRaises(FileExistsError):
                self.run_clip()
        self.assertEqual(target.read_bytes(), b"other run observations")

    def test_concurrent_evidence_creation_is_not_overwritten(self):
        target = self.root / "shared.jpg"
        original_encode = cv2.imencode
        def competing_encode(extension, image):
            target.write_bytes(b"other evidence")
            return original_encode(extension, image)
        with patch("gaze.video.cv2.imencode", side_effect=competing_encode):
            with self.assertRaises(FileExistsError):
                self.run_clip(evidence_frame=target)
        self.assertEqual(target.read_bytes(), b"other evidence")

    def test_missing_source_fps_is_not_replaced_by_wall_clock(self):
        fake_capture = SimpleNamespace(isOpened=lambda: True, release=lambda: None, get=lambda key: 0)
        with patch("gaze.video.cv2.VideoCapture", return_value=fake_capture):
            with self.assertRaises(VideoError):
                self.run_clip()


if __name__ == "__main__":
    unittest.main()

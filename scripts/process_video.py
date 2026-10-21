"""Process a saved CFR video and save annotations plus source-time observations."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--max-faces", type=int, default=10)
    parser.add_argument("--method", choices=("baseline", "pose"), default="baseline")
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--tile-grid", type=int, default=1,
                        help="Generic overlapping detector tiling; 2 improves small-face coverage at extra cost.")
    parser.add_argument("--max-frames", type=int)
    parser.add_argument("--warmup-frames", type=int, default=5)
    parser.add_argument("--expected-faces", type=int,
                        help="Manually verified fixed reference count; not pose labels or matched recall.")
    parser.add_argument("--evidence-frame", type=Path)
    parser.add_argument("--run-label", default="unspecified")
    parser.add_argument("--mirrored", action="store_true")
    parser.add_argument("--seats", type=Path, help="Optional fixed normalized seat-region JSON; positions, never person identities.")
    parser.add_argument("--max-observation-gap-seconds", type=float, default=.25)
    parser.add_argument("--events", action="store_true", help="Export configurable source-time movement events; requires --seats. Event accuracy is unvalidated.")
    parser.add_argument("--min-duration", type=float, default=2.)
    parser.add_argument("--repetition-count", type=int, default=3)
    parser.add_argument("--repetition-window", type=float, default=10.)
    parser.add_argument("--repeat-min-duration", type=float, default=.25,
                        help="Minimum continuously observed episode before it counts as a repeated entry.")
    parser.add_argument("--max-event-gap", type=float, default=.25)
    parser.add_argument("--yaw-threshold", type=float, default=0.18)
    parser.add_argument("--down-threshold", type=float, default=0.40)
    args = parser.parse_args(argv)
    try:
        if not args.input.is_file():
            raise ValueError(f"Video file does not exist: {args.input}")
        from gaze.baseline import Thresholds
        from gaze.pipeline import ImagePipeline
        from gaze.video import process_video
        seat_config = associator = tracker = None
        if args.seats is not None:
            from gaze.seats import SeatAssociator
            from gaze.history import HistoryTracker
            seat_config = json.loads(args.seats.read_text(encoding="utf-8"))
            associator = SeatAssociator(seat_config)
            tracker = HistoryTracker(associator.seat_ids, args.max_observation_gap_seconds)
        monitor = None
        if args.events:
            if args.seats is None:
                raise ValueError("--events requires --seats.")
            from gaze.events import MovementMonitor, MovementSettings
            monitor = MovementMonitor(associator.seat_ids, MovementSettings(
                min_duration=args.min_duration, repetition_count=args.repetition_count,
                repetition_window=args.repetition_window, max_gap=args.max_event_gap,
                repeat_min_duration=args.repeat_min_duration))
        thresholds = Thresholds(yaw=args.yaw_threshold, down=args.down_threshold)
        with ImagePipeline(model_path=args.model, max_faces=args.max_faces,
                           max_width=args.max_width, mirrored=args.mirrored,
                           thresholds=thresholds, tile_grid=args.tile_grid, method=args.method) as pipeline:
            summary = process_video(args.input, args.output_dir, pipeline,
                                    max_frames=args.max_frames, warmup_frames=args.warmup_frames,
                                    expected_faces=args.expected_faces, evidence_frame=args.evidence_frame,
                                    run_label=args.run_label, seat_associator=associator,
                                    history_tracker=tracker, seat_config=seat_config, movement_monitor=monitor)
        print(json.dumps(summary, indent=2))
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print(f"Video processing failed: {str(error)!a}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

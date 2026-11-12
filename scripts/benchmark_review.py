"""Measure repeated integrated saved-review processing on the demo computer."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from gaze.data import sha256
from gaze.session_review import process_session, validate_settings
from gaze.video import _environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--settings', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--runs', type=int, default=3)
    args = parser.parse_args()
    if args.runs < 3 or args.runs > 10:
        parser.error('Use 3 to 10 repeated runs')
    if args.output_dir.exists():
        parser.error('Choose a new output directory')
    settings = validate_settings(json.loads(args.settings.read_text(encoding='utf-8')))
    if settings['method'] == 'head':
        from gaze.head_image import HeadImagePipeline
        factory = lambda: HeadImagePipeline(mirrored=settings['mirrored'])
    else:
        from gaze.pipeline import ImagePipeline
        factory = lambda: ImagePipeline(mirrored=settings['mirrored'], tile_grid=settings['tileGrid'])
    args.output_dir.mkdir(parents=True)
    runs = []
    for index in range(args.runs):
        # Each independent run loads its model before the wall timer. Every
        # source frame is included in the full-session timer (no discarded frames).
        with factory() as pipeline:
            started = perf_counter()
            review = process_session(args.input, args.output_dir / f'run-{index+1}', settings, pipeline)
            elapsed = perf_counter() - started
        runs.append({'run': index + 1, 'frames': len(review['frames']), 'seconds': elapsed,
                     'end_to_end_fps': len(review['frames']) / elapsed,
                     'frame_phase': review['timing'], 'direction_counts': review['direction_counts'],
                     'events': len(review['events'])})
        print(f"Run {index+1}: {runs[-1]['end_to_end_fps']:.2f} full-session FPS", flush=True)
    report = {'schema_version': 1, 'timestamp_utc': datetime.now(timezone.utc).isoformat(),
              'environment': _environment(), 'source_sha256': sha256(args.input),
              'settings_sha256': sha256(args.settings), 'settings': settings, 'source': review['source'],
              'pipeline': pipeline.metadata, 'runs': runs,
              'median_end_to_end_fps': statistics.median(r['end_to_end_fps'] for r in runs),
              'scope': 'Full process_session wall time: timing preflight, decode, preprocessing, inference, '
                       'seat/history/events, annotation/AVI, JSON exports and final writes. '
                       'Excludes model initialization, upload/network, browser rendering and manual setup. '
                       'No frames discarded for this full-session measurement. Per-frame timing separately '
                       'excludes its first five warmup frames and final exports.',
              'limitations': ['Public office-meeting proxy, not classroom event ground truth.',
                              'Counts are observations; not direction or event correctness.']}
    (args.output_dir / 'benchmark.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(f"Median: {report['median_end_to_end_fps']:.2f} full-session FPS")


if __name__ == '__main__':
    main()

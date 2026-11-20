"""Local recording worker: suggest seats from, or review, one saved video; JSON lines on stdout."""
import argparse
from contextlib import redirect_stdout
import json
import os
from pathlib import Path
import sys

# Bound decoding before importing OpenCV through the pipeline modules.
os.environ['OPENCV_IO_MAX_IMAGE_PIXELS'] = str(1280 * 720)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))

# Camera defaults for recordings: frames are evenly spaced, so the gap limit is fixed.
DEFAULT_MOVEMENT = {'min_duration': 1.5, 'repetition_count': 3, 'repetition_window': 10.,
                    'repeat_min_duration': .25, 'max_gap': 1.}


def emit(value):
    sys.stdout.write(json.dumps(value, allow_nan=False) + '\n')
    sys.stdout.flush()


def build_processor(mirrored, tile_grid, head_turns):
    from gaze.camera import CameraProcessor
    from gaze.live_session import live_thresholds
    from gaze.pipeline import ImagePipeline
    pipeline = ImagePipeline(mirrored=mirrored, tile_grid=tile_grid, thresholds=live_thresholds())
    fallback = None
    if head_turns:
        try:
            from gaze.head_image import HeadImagePipeline
            fallback = HeadImagePipeline(mirrored=mirrored)
        except (ImportError, OSError, ValueError, RuntimeError) as error:
            print(f'Head-turn reading unavailable, continuing without it: {error}', file=sys.stderr)
    return pipeline, fallback, CameraProcessor(pipeline, fallback)


def run(args):
    from gaze import recording
    with redirect_stdout(sys.stderr):
        pipeline, fallback, processor = build_processor(args.mirrored, args.tile_grid, args.head_turns)
    try:
        with pipeline:
            if args.command == 'suggest':
                emit(recording.suggest(args.input, processor))
                return
            settings = json.loads(sys.stdin.readline())
            if not isinstance(settings, dict):
                raise ValueError('Expected seat settings')
            settings = {**settings, 'movement': {**DEFAULT_MOVEMENT, **(settings.get('movement') or {})}}
            with redirect_stdout(sys.stderr):
                processor.configure(settings)
            recording.review(args.input, processor, emit)
    finally:
        if fallback is not None:
            fallback.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('suggest', 'review'))
    parser.add_argument('--input', required=True)
    parser.add_argument('--mirrored', action='store_true')
    parser.add_argument('--tile-grid', type=int, choices=range(1, 5), default=2)
    parser.add_argument('--head-turns', action='store_true',
                        help='Read seats whose face is lost (strong head turns) with the head-pose model')
    args = parser.parse_args()
    try:
        run(args)
    except (ValueError, RuntimeError, OSError) as error:
        emit({'error': str(error)})
        sys.exit(1)


if __name__ == '__main__':
    main()

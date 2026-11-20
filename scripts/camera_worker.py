"""Persistent local browser-frame worker; camera access stays in the browser."""
import argparse
from contextlib import redirect_stdout
import os
from pathlib import Path
import sys

# Bound decoding before importing OpenCV through the pipeline modules.
os.environ['OPENCV_IO_MAX_IMAGE_PIXELS'] = str(1280 * 720)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--method', choices=('head', 'baseline'), required=True)
    parser.add_argument('--mirrored', action='store_true')
    parser.add_argument('--tile-grid', type=int, choices=range(1, 5), default=1)
    parser.add_argument('--head-turns', action='store_true',
                        help='Read seats whose face is lost (strong head turns) with the head-pose model')
    args = parser.parse_args()
    from gaze.camera import serve
    with redirect_stdout(sys.stderr):
        if args.method == 'head':
            from gaze.head_image import HeadImagePipeline
            pipeline = HeadImagePipeline(mirrored=args.mirrored)
        else:
            from gaze.pipeline import ImagePipeline
            from gaze.live_session import live_thresholds
            pipeline = ImagePipeline(mirrored=args.mirrored, tile_grid=args.tile_grid, thresholds=live_thresholds())
        fallback = None
        if args.head_turns and args.method == 'baseline':
            try:
                from gaze.head_image import HeadImagePipeline
                fallback = HeadImagePipeline(mirrored=args.mirrored)
            except (ImportError, OSError, ValueError, RuntimeError) as error:
                print(f'Head-turn reading unavailable, continuing without it: {error}', file=sys.stderr)
    try:
        with pipeline:
            serve(pipeline, sys.stdin, sys.stdout, fallback)
    finally:
        if fallback is not None:
            fallback.close()


if __name__ == '__main__':
    main()

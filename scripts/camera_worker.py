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
    args = parser.parse_args()
    from gaze.camera import serve
    with redirect_stdout(sys.stderr):
        if args.method == 'head':
            from gaze.head_image import HeadImagePipeline
            pipeline = HeadImagePipeline(mirrored=args.mirrored)
        else:
            from gaze.pipeline import ImagePipeline
            pipeline = ImagePipeline(mirrored=args.mirrored, tile_grid=args.tile_grid)
    with pipeline:
        serve(pipeline, sys.stdin, sys.stdout)


if __name__ == '__main__':
    main()

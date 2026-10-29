"""Inspect decoded video timing and optionally suggest fixed head regions."""
import argparse
from contextlib import redirect_stdout
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--method', choices=('head', 'baseline'), default='head')
    parser.add_argument('--mirrored', action='store_true')
    parser.add_argument('--tile-grid', type=int, choices=range(1, 5), default=1)
    parser.add_argument('--suggest', action='store_true')
    args = parser.parse_args()
    try:
        from gaze.review_setup import inspect_video, suggest_seats
        timing, samples = inspect_video(args.input)
        result = {'timing': timing}
        if args.suggest:
            with redirect_stdout(sys.stderr):
                if args.method == 'head':
                    from gaze.head_image import HeadImagePipeline
                    pipeline = HeadImagePipeline(mirrored=args.mirrored)
                else:
                    from gaze.pipeline import ImagePipeline
                    pipeline = ImagePipeline(mirrored=args.mirrored, tile_grid=args.tile_grid)
                with pipeline:
                    result.update(suggest_seats(samples, pipeline))
        print(json.dumps(result, allow_nan=False))
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

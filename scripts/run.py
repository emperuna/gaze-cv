"""Run automatic direction estimation on an image, media folder or saved clip."""
import argparse
from pathlib import Path
import sys

from gaze.runner import run_inputs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--method', choices=['head', 'baseline'], default='head')
    parser.add_argument('--head-model-dir', type=Path)
    parser.add_argument('--model', type=Path, help='MediaPipe model for baseline')
    parser.add_argument('--mirrored', action='store_true', help='Input pixels are already mirrored')
    parser.add_argument('--tile-grid', type=int, choices=range(1, 5), default=1, help='Baseline detector tiles')
    args = parser.parse_args(argv)
    try:
        if args.method == 'head':
            from gaze.head_image import HeadImagePipeline
            pipeline = HeadImagePipeline(model_dir=args.head_model_dir, mirrored=args.mirrored)
        else:
            from gaze.pipeline import ImagePipeline
            pipeline = ImagePipeline(model_path=args.model, mirrored=args.mirrored, tile_grid=args.tile_grid)
        with pipeline:
            report = run_inputs(args.input, args.output_dir, pipeline)
        print(f"Processed {report['successful_inputs']} inputs; failed {report['failed_inputs']}; results: {args.output_dir}")
        return 0 if not report['failed_inputs'] else 1
    except (OSError, ValueError, RuntimeError) as error:
        print(f'Run failed: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

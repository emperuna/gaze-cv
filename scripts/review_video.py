"""Process a browser review session with shared head/seat/history/event modules."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    try:
        from gaze.session_review import process_session, validate_settings
        settings = validate_settings(json.loads(args.settings.read_text(encoding='utf-8')))
        if settings['method'] == 'head':
            from gaze.head_image import HeadImagePipeline
            pipeline = HeadImagePipeline(mirrored=settings['mirrored'])
        else:
            from gaze.pipeline import ImagePipeline
            pipeline = ImagePipeline(mirrored=settings['mirrored'], tile_grid=settings['tileGrid'])
        with pipeline:
            record = process_session(args.input, args.output_dir, settings, pipeline)
        print(f"Saved {len(record['frames'])} frames and {len(record['events'])} movement events")
        return 0
    except (ValueError, RuntimeError, OSError) as error:
        print(f'Review processing failed: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

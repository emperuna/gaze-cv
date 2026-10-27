"""Build calibration from manually verified forward frames in a saved CFR video.

References JSON maps each seat ID to nonnegative frame indices. Select frames
by visual inspection; this command does not decide which heads face forward.
"""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path)
    parser.add_argument('--seats', required=True, type=Path)
    parser.add_argument('--references', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--head-model-dir', type=Path)
    parser.add_argument('--mirrored', action='store_true')
    args = parser.parse_args(argv)
    models = capture = None
    try:
        import cv2
        from gaze.head_models import HeadModels
        from gaze.head_pose import HeadSettings
        from gaze.head_session import build_calibration, measure_seat_heads
        from gaze.seats import SeatAssociator
        from gaze.video import _sha256, source_timestamp
        protected = {path.resolve() for path in (args.input, args.seats, args.references)}
        if args.output.exists() or args.output.resolve() in protected:
            raise ValueError('Calibration output already exists or would overwrite an input; choose a new path')
        if not args.input.is_file():
            raise ValueError('Video does not exist')
        config = json.loads(args.seats.read_text(encoding='utf-8'))
        seats = SeatAssociator(config)
        references = json.loads(args.references.read_text(encoding='utf-8'))
        if not isinstance(references, dict) or set(references) != set(seats.seat_ids):
            raise ValueError('Reference JSON must map every seat ID to a list of verified forward frame indices')
        for indices in references.values():
            if (not isinstance(indices, list) or not 1 <= len(indices) <= 100 or
                    any(type(i) is not int or i < 0 for i in indices) or len(set(indices)) != len(indices)):
                raise ValueError('Each seat needs 1-100 unique nonnegative integer reference frames')
        source_hash = _sha256(args.input)
        if config.get('source_sha256') and config['source_sha256'] != source_hash:
            raise ValueError('Seat configuration source checksum differs from this video')
        capture = cv2.VideoCapture(str(args.input))
        if not capture.isOpened():
            raise ValueError('Cannot decode calibration video')
        source_timestamp(0, float(capture.get(cv2.CAP_PROP_FPS)))
        models = HeadModels(**({'directory':args.head_model_dir} if args.head_model_dir else {}))
        settings = HeadSettings()
        collected = {seat: [] for seat in seats.seat_ids}
        wanted = {index for indices in references.values() for index in indices}
        index = 0
        while wanted:
            ok, image = capture.read()
            if not ok:
                raise ValueError('A reference frame lies beyond the decodable video')
            if config.get('reference_resolution') and config['reference_resolution'] != [image.shape[1], image.shape[0]]:
                raise ValueError('Seat reference resolution does not match the video')
            if index in wanted:
                observations = measure_seat_heads(image, config, models, settings, args.mirrored)
                for seat, indices in references.items():
                    if index not in indices:
                        continue
                    candidates = [o for o in observations if o.scores['seat_id'] == seat]
                    if len(candidates) != 1 or candidates[0].unavailable_reason is not None:
                        raise ValueError(f'Reference frame {index}, seat {seat}: need exactly one usable detected head')
                    collected[seat].append((index, candidates[0].scores['model_angles_degrees']))
                wanted.remove(index)
            index += 1
        result = build_calibration(config, source_hash, models.metadata['model_sha256'], collected,
                                   mirrored=args.mirrored, settings=settings)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as output:
            json.dump(result, output, indent=2, allow_nan=False)
            output.write('\n')
        print(f'Saved neutral head calibration: {str(args.output)!a}')
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f'Head calibration failed: {error}', file=sys.stderr)
        return 2
    finally:
        if capture is not None:
            capture.release()
        if models is not None:
            models.close()


if __name__ == '__main__':
    raise SystemExit(main())

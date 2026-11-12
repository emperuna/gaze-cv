"""Create a bounded, public-domain FourPeople excerpt for the CP4 demo."""
import argparse
import hashlib
import json
from pathlib import Path

import cv2

SOURCE_SHA256 = '1e4a5df7e67ae985370321cc2c91b8595f7e3433ad8ee1e84da7a26ff5254deb'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=Path('data/raw/video/FourPeople_1280x720_60.webm'))
    parser.add_argument('--output', type=Path, default=Path('data/samples/cp4/fourpeople-2s.webm'))
    args = parser.parse_args()
    if args.output.exists() or args.output.resolve() == args.input.resolve():
        parser.error('Choose a new output path')
    if hashlib.sha256(args.input.read_bytes()).hexdigest() != SOURCE_SHA256:
        parser.error('Source checksum differs from the permitted FourPeople asset')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(args.input))
    writer = cv2.VideoWriter(str(args.output), cv2.VideoWriter_fourcc(*'VP80'), 60., (1280, 720))
    try:
        if not capture.isOpened() or not writer.isOpened():
            raise RuntimeError('Could not open source or VP8 WebM writer')
        for _ in range(120):
            ok, frame = capture.read()
            if not ok:
                raise RuntimeError('Source ended before the selected 120 frames')
            writer.write(frame)
    finally:
        capture.release()
        writer.release()
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    args.output.with_suffix('.json').write_text(json.dumps({
        'source': 'https://media.xiph.org/video/derf/webm/FourPeople_1280x720_60.webm',
        'permission': 'Public domain, as listed at https://media.xiph.org/video/derf/',
        'source_sha256': SOURCE_SHA256, 'sha256': digest,
        'transformation': 'First 120 decoded source frames, VP8 WebM, 1280x720 at 60 FPS; no audio.',
        'purpose': 'Two-second office-meeting proxy for integration and speed, not labeled classroom accuracy.',
    }, indent=2) + '\n', encoding='utf-8')
    print(f'Created {args.output}; SHA256 {digest}')


if __name__ == '__main__':
    main()

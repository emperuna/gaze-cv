"""Acquire optional CPU head detector (GPL-3.0 upstream) and pose model (MIT upstream)."""
import argparse
from pathlib import Path
import sys
import tarfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'src'))
from gaze.head_download import acquire_onnx
from gaze.head_models import MODEL_DIR, HEAD_FILE, HEAD_SHA256, POSE_FILE, POSE_SHA256


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=MODEL_DIR)
    args = parser.parse_args(argv)
    host = 'https://s3.ap-northeast-2.wasabisys.com/pinto-model-zoo/'
    assets = [(HEAD_FILE, HEAD_SHA256, '421_Gold-YOLO-Head/resources_n.tar.gz', 80, 30),
              (POSE_FILE, POSE_SHA256, '423_6DRepNet360/resources_full.tar.gz', 150, 100)]
    try:
        for filename, digest, archive, archive_mib, model_mib in assets:
            acquire_onnx(host+archive, filename, args.output_dir/filename, digest,
                         archive_mib*1024*1024, model_mib*1024*1024)
            print(f'Verified {filename}; SHA256 {digest}')
        return 0
    except (OSError, ValueError, tarfile.TarError, EOFError) as error:
        print(f'Head model acquisition failed: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

"""Record CP3 settings and hashes before any inference on the fixed set."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

from gaze.cp3_evaluation import load_cp3_manifest
from gaze.head_image import HeadImagePipeline
from gaze.pipeline import ImagePipeline


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.output.exists(): raise ValueError('Frozen protocol exists; do not replace it')
    load_cp3_manifest(args.manifest, root)
    pipelines = {}
    for method, factory in [('baseline', ImagePipeline), ('head', HeadImagePipeline)]:
        with factory() as pipeline: pipelines[method] = pipeline.metadata
    files = sorted((root/'src/gaze').glob('*.py')) + [root/'scripts'/name for name in
             ['run.py', 'evaluate_cp3.py', 'prepare_cp3.py', 'freeze_cp3.py']]
    result = {'schema_version': 1, 'created_utc': datetime.now(timezone.utc).isoformat(),
              'note': 'Model initialization only; no fixed-set samples passed through inference at freeze time',
              'manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
              'pipelines': pipelines,
              'inference_sha256': {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2, allow_nan=False); stream.write('\n')
    print(f'Frozen settings without test inference: {args.output}')


if __name__ == '__main__': main()

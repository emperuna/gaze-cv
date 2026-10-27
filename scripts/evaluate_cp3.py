"""Reproduce baseline/main classification and speed on the fixed CP3 set."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from gaze.cp3_evaluation import load_cp3_manifest, evaluate_manifest, configuration_signature
from gaze.head_image import HeadImagePipeline
from gaze.pipeline import ImagePipeline
from gaze.video import _environment


def implementation_hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for directory in ('src/gaze', 'scripts') for p in sorted((root/directory).rglob('*.py'))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--freeze', required=True, type=Path, help='Previously recorded frozen settings and source hashes')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    try:
        root = args.root.resolve()
        manifest = load_cp3_manifest(args.manifest, root)
        if args.output.exists(): raise ValueError('Evaluation output already exists; use a new file')
        if any(args.output.resolve() == (root/s['image']).resolve() for s in manifest['samples']):
            raise ValueError('Report cannot replace an input')
        freeze = json.loads(args.freeze.read_text(encoding='utf-8'))
        if freeze['manifest_sha256'] != hashlib.sha256(args.manifest.read_bytes()).hexdigest():
            raise ValueError('Manifest differs from frozen protocol')
        current = implementation_hashes(Path(__file__).resolve().parents[1])
        for path, expected in freeze['inference_sha256'].items():
            if current.get(path) != expected: raise ValueError(f'Inference code differs from freeze: {path}')
        results = {}
        for method, factory in [('baseline', ImagePipeline), ('head', HeadImagePipeline)]:
            with factory() as pipeline:
                if configuration_signature(pipeline.metadata) != configuration_signature(freeze['pipelines'][method]):
                    raise ValueError(f'{method} settings or models differ from freeze')
                results[method] = evaluate_manifest(manifest, root, pipeline)
        report = {'schema_version': 1, 'purpose': 'cp3_fixed_test', 'timestamp_utc': datetime.now(timezone.utc).isoformat(),
                  'manifest_sha256': freeze['manifest_sha256'], 'freeze_sha256': hashlib.sha256(args.freeze.read_bytes()).hexdigest(),
                  'environment': _environment(), 'implementation_sha256': current,
                  'source_revision': subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip(),
                  'working_tree_dirty': bool(subprocess.run(['git', 'status', '--porcelain'], capture_output=True, text=True).stdout),
                  'methods': results,
                  'limitations': manifest.get('limitations', []) + ['Prepared single-subject classification does not establish whole-classroom detection, seat association, eye gaze or movement-event accuracy.']}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as stream:
            json.dump(report, stream, indent=2, allow_nan=False); stream.write('\n')
        for method, result in results.items():
            metrics = result['metrics']
            print(f"{method}: accuracy={metrics['accuracy']:.4f} macro_F1={metrics['macro_f1']:.4f} coverage={metrics['coverage']:.4f} ms/image={result['timing']['ms_per_image']:.2f}")
        return 0
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        print(f'Evaluation failed: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

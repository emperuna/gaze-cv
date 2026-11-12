"""Frozen held-out image evaluation for the Phase 4 classroom hand-in.

The protocol is written before inference. Unknown and unreadable observations
stay in the metric denominator; no threshold fitting occurs here.
"""
from collections import Counter
from contextlib import ExitStack
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
from time import perf_counter

from gaze.cp3_evaluation import configuration_signature
from gaze.data import contained_path, load_manifest, sha256
from gaze.evaluation import direction_for_image, score_records, validate_report_output
from gaze.preprocessing import read_image
from gaze.video import _environment

SOURCE_ROOT = Path(__file__).resolve().parents[2]


def implementation_hashes():
    paths = sorted((SOURCE_ROOT / 'src/gaze').glob('*.py')) + [SOURCE_ROOT / 'src/evaluate.py']
    return {path.relative_to(SOURCE_ROOT).as_posix(): sha256(path) for path in paths}


def pipeline_factories():
    from gaze.pipeline import ImagePipeline
    from gaze.head_image import HeadImagePipeline
    return {'baseline': ImagePipeline, 'head': HeadImagePipeline}


def _timestamp():
    return datetime.now(timezone.utc).isoformat()


def _write_new(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write('\n')


def _selection(manifest_path, root):
    manifest = load_manifest(manifest_path, root=root, check_files=False)
    samples = [sample for sample in manifest['samples'] if sample['split'] == 'test']
    if not samples:
        raise ValueError('The manifest contains no held-out test samples')
    # Verify every selected pixel before either method runs. Missing data is a
    # setup failure; a checksum-valid but unreadable image is an unknown result.
    for sample in samples:
        image = contained_path(root, sample['image'])
        if not image.is_file() or sha256(image) != sample['sha256']:
            raise ValueError(f"Held-out input missing or checksum mismatch: {sample['id']}")
    return manifest, samples


def _protected(manifest_path, manifest, root):
    return [manifest_path, *[contained_path(root, s['image']) for s in manifest['samples']],
            *[p for p in (SOURCE_ROOT / 'models/downloads').glob('*') if p.is_file()],
            *[SOURCE_ROOT / p for p in implementation_hashes()]]


def freeze_protocol(manifest_path, output, root, *, factories=None):
    root, manifest_path = Path(root).resolve(), Path(manifest_path).resolve()
    if not manifest_path.is_relative_to(root):
        raise ValueError('The manifest must be inside the data root')
    manifest, samples = _selection(manifest_path, root)
    validate_report_output(output, _protected(manifest_path, manifest, root))
    factories = factories or pipeline_factories()
    if set(factories) != {'baseline', 'head'}:
        raise ValueError('Both baseline and head methods are required')
    metadata = {}
    for method, factory in factories.items():
        with factory() as pipeline:
            metadata[method] = configuration_signature(pipeline.metadata)
    protocol = {
        'schema_version': 1, 'purpose': 'cp4_held_out', 'created_utc': _timestamp(),
        'manifest': manifest_path.relative_to(root).as_posix(),
        'manifest_sha256': sha256(manifest_path), 'dataset': manifest.get('dataset'),
        'split': 'test', 'sample_ids': [s['id'] for s in samples],
        'class_counts': dict(Counter(s['label'] for s in samples)),
        'subjects': sorted({s['subject'] for s in samples}),
        'pipelines': metadata, 'implementation_sha256': implementation_hashes(),
        'note': 'Model initialization and input integrity checks only; no test inference at freeze time.',
        'protocol': 'Use the existing subject-separated Pointing04 test selection unchanged. '
                    'Defaults remain development-selected. No fitting or tuning on test outcomes. '
                    'Unknowns and unreadable images count as incorrect; multiple detections are ambiguous.',
        'limitations': ['Nominal pose labels, not measured gaze.',
                        'Pretrained-model training overlap cannot be fully audited.',
                        'Single-person laboratory images do not validate seat or event accuracy.'],
    }
    _write_new(output, protocol)
    return protocol


def evaluate_protocol(protocol_path, output, root, *, factories=None):
    root, protocol_path = Path(root).resolve(), Path(protocol_path).resolve()
    protocol = json.loads(protocol_path.read_text(encoding='utf-8'))
    if protocol.get('schema_version') != 1 or protocol.get('purpose') != 'cp4_held_out' or protocol.get('split') != 'test':
        raise ValueError('Expected a frozen CP4 held-out protocol')
    manifest_path = contained_path(root, protocol['manifest'])
    if sha256(manifest_path) != protocol['manifest_sha256']:
        raise ValueError('Manifest differs from frozen protocol')
    if implementation_hashes() != protocol['implementation_sha256']:
        raise ValueError('Implementation differs from frozen protocol; do not refreeze to bypass a mismatch')
    manifest, samples = _selection(manifest_path, root)
    if [s['id'] for s in samples] != protocol['sample_ids']:
        raise ValueError('Test selection differs from frozen protocol')
    validate_report_output(output, [protocol_path, *_protected(manifest_path, manifest, root)])
    factories = factories or pipeline_factories()
    if set(factories) != {'baseline', 'head'}:
        raise ValueError('Both baseline and head methods are required')
    results = {}
    with ExitStack() as stack:
        pipelines = {method: stack.enter_context(factory()) for method, factory in factories.items()}
        for method, pipeline in pipelines.items():
            if configuration_signature(pipeline.metadata) != protocol['pipelines'][method]:
                raise ValueError(f'{method} model or settings differ from frozen protocol')
        for method, pipeline in pipelines.items():
            records = []
            started = perf_counter()
            for sample in samples:
                observation = None
                try:
                    image = read_image(contained_path(root, sample['image']))
                except (OSError, ValueError):
                    predicted, reason = 'unknown', 'unreadable_image'
                else:
                    observation = pipeline.process(image)
                    predicted, reason = direction_for_image(observation.detections)
                records.append({**{k: sample[k] for k in ('id', 'image', 'subject', 'source')},
                                'expected': sample['label'], 'predicted': predicted,
                                'unavailable_reason': reason,
                                'observations': observation.to_dict() if observation else None})
            elapsed = perf_counter() - started
            results[method] = {
                'pipeline': pipeline.metadata, 'metrics': score_records(records), 'records': records,
                'timing': {'images': len(records), 'seconds': elapsed,
                           'ms_per_image': elapsed * 1000 / len(records),
                           'images_per_second': len(records) / elapsed if elapsed else None,
                           'scope': 'Decode, preprocessing, inference, prediction and record construction; '
                                    'excludes initialization, checksum preflight and report writing; '
                                    'no explicit warmup excluded. This is not video FPS.'},
            }
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=SOURCE_ROOT,
                              capture_output=True, text=True, check=False).stdout.strip()
    report = {'schema_version': 1, 'purpose': 'cp4_held_out', 'timestamp_utc': _timestamp(),
              'protocol_sha256': sha256(protocol_path), 'manifest_sha256': protocol['manifest_sha256'],
              'dataset': manifest.get('dataset'), 'split': 'test', 'source_revision': revision,
              'implementation_sha256': implementation_hashes(), 'environment': _environment(),
              'working_tree_dirty': bool(subprocess.run(['git', 'status', '--porcelain'], cwd=SOURCE_ROOT,
                                                       capture_output=True, text=True, check=False).stdout),
              'methods': results, 'limitations': protocol['limitations']}
    _write_new(output, report)
    return report

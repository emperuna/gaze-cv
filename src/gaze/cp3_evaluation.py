"""Frozen single-subject CP3 test-set evaluation; no fitting or threshold selection."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from time import perf_counter

from gaze.evaluation import DIRECTIONS, direction_for_image, score_records
from gaze.preprocessing import read_image


def configuration_signature(metadata):
    """Ignore local model location only; model content/settings remain pinned."""
    if isinstance(metadata, dict):
        return {k: configuration_signature(v) for k, v in metadata.items() if k != 'model_path'}
    if isinstance(metadata, list): return [configuration_signature(v) for v in metadata]
    return metadata


def load_cp3_manifest(path, root):
    root = Path(root).resolve()
    manifest = json.loads(Path(path).read_text(encoding='utf-8'))
    if manifest.get('schema_version') != 1 or manifest.get('purpose') != 'cp3_fixed_test':
        raise ValueError('Expected CP3 fixed-test manifest schema 1')
    samples = manifest.get('samples')
    if not isinstance(samples, list) or not samples:
        raise ValueError('Test manifest must contain labeled samples')
    ids, images = set(), set()
    for sample in samples:
        if not isinstance(sample, dict) or not all(isinstance(sample.get(k), str) and sample[k] for k in
                ('id', 'image', 'sha256', 'label', 'subject', 'source', 'cause', 'variant')):
            raise ValueError('Every sample needs identity, provenance, label, condition and checksum')
        image = (root / sample['image']).resolve()
        if not image.is_relative_to(root) or Path(sample['image']).is_absolute():
            raise ValueError('Test image path must stay inside dataset root')
        if sample['id'] in ids or image in images:
            raise ValueError('Duplicate test id or image path')
        ids.add(sample['id']); images.add(image)
        if sample['label'] not in DIRECTIONS:
            raise ValueError('Unsupported reference label')
        if sample['subject'] in manifest.get('excluded_subjects', []) or sample['source'] in manifest.get('excluded_sources', []):
            raise ValueError('Test sample overlaps declared development subjects or sources')
        if not image.is_file() or hashlib.sha256(image.read_bytes()).hexdigest() != sample['sha256']:
            raise ValueError(f"Test input checksum mismatch: {sample['id']}")
    return manifest


def summarize_records(records):
    return {'metrics': score_records(records),
            'failure_counts': dict(sorted(Counter(r['cause'] for r in records if r['expected'] != r['predicted']).items())),
            'failure_group_note': 'Groups are observed input conditions, not proven causal diagnoses'}


def evaluate_manifest(manifest, root, pipeline):
    """Evaluate one known subject per prepared image, with all misses counted.

    Additional detections make an image ambiguous; never select the best face.
    This is classification accuracy on prepared single-subject inputs, not
    multi-person localization AP or event accuracy.
    """
    records = []
    started = perf_counter()
    for sample in manifest['samples']:
        image = read_image(Path(root) / sample['image'])
        result = pipeline.process(image)
        predicted, reason = direction_for_image(result.detections)
        if reason == 'no_face': reason = 'no_detection'
        if reason == 'multiple_faces': reason = 'multiple_detections'
        records.append({**{k: sample[k] for k in ('id', 'image', 'subject', 'source', 'cause', 'variant')},
                        'expected': sample['label'], 'predicted': predicted,
                        'unavailable_reason': reason, 'observations': result.to_dict()})
    elapsed = perf_counter()-started
    inference_ms = sum(r['observations']['processing_ms'] for r in records)
    return {**summarize_records(records), 'records': records, 'pipeline': pipeline.metadata,
            'by_variant': {variant: summarize_records([r for r in records if r['variant'] == variant])
                           for variant in sorted({r['variant'] for r in records})},
            'timing': {'images': len(records), 'seconds': elapsed, 'images_per_second': len(records)/elapsed,
                       'ms_per_image': elapsed*1000/len(records), 'inference_ms_per_image': inference_ms/len(records),
                       'scope': 'Image decoding, shared preprocessing, inference, prediction and record construction; excludes model initialization, checksum preflight, annotation/report writes; no explicit warmup excluded'}}

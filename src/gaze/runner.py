"""One-command image/folder/saved-video dispatch using shared pipeline contracts."""
from collections import Counter
import hashlib
import json
from pathlib import Path
from time import perf_counter

import cv2
from gaze.preprocessing import read_image, write_image
from gaze.video import process_video, _environment
from gaze.visualization import annotate

IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}
VIDEO_SUFFIXES = {'.mp4', '.avi', '.mov', '.mkv', '.webm', '.m4v'}


def run_inputs(input_path, output_dir, pipeline):
    """Process every supported file in a folder (nonrecursive), or one media file.

    Never overwrite an existing run. Individual decode failures are logged and
    do not prevent other inputs from being processed. Counts are observations,
    not unique people; video counts aggregate all frames.
    """
    source, output = Path(input_path).resolve(), Path(output_dir).resolve()
    if not source.exists():
        raise ValueError(f'Input does not exist: {source}')
    if output == source or (source.is_dir() and output.is_relative_to(source)):
        raise ValueError('Output must be outside the input folder and different from the input')
    if output.exists():
        raise ValueError('Output already exists; choose a new run directory')
    candidates = sorted(source.iterdir()) if source.is_dir() else [source]
    inputs = [p for p in candidates if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES | VIDEO_SUFFIXES]
    if not inputs:
        raise ValueError('No supported image or saved-video inputs found')
    output.mkdir(parents=True, exist_ok=False)
    started = perf_counter()
    records = []
    for index, path in enumerate(inputs, 1):
        destination = output / f'{index:03d}-{path.stem}'
        record = {'input': str(path), 'output': destination.name,
                  'kind': 'image' if path.suffix.lower() in IMAGE_SUFFIXES else 'video'}
        try:
            if record['kind'] == 'image':
                stage_started = perf_counter()
                image = read_image(path)
                result = pipeline.process(image)
                destination.mkdir()
                write_image(destination / 'annotated.png', annotate(image, result))
                counts = dict(Counter(d.direction for d in result.detections))
                observation = {'input': str(path), 'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                               'pipeline': pipeline.metadata, 'result': result.to_dict(),
                               'detected_observations': len(result.detections), 'direction_counts': counts}
                (destination / 'observations.json').write_text(json.dumps(observation, indent=2, allow_nan=False)+'\n', encoding='utf-8')
                record.update({'detected_observations': len(result.detections), 'direction_counts': counts,
                               'processing_ms': result.processing_ms,
                               'input_to_output_ms': (perf_counter()-stage_started)*1000})
            else:
                summary = process_video(path, destination, pipeline, run_label='automatic batch runner')
                record.update({key: summary[key] for key in ('processed_frames', 'detected_observations', 'direction_counts', 'timing')})
            record['status'] = 'ok'
        except (OSError, ValueError, RuntimeError, cv2.error) as error:
            record.update({'status': 'failed', 'error': str(error)})
        records.append(record)
    report = {'schema_version': 1, 'input': str(source), 'pipeline': pipeline.metadata,
              'environment': _environment(), 'inputs': records,
              'successful_inputs': sum(r['status'] == 'ok' for r in records),
              'failed_inputs': sum(r['status'] == 'failed' for r in records),
              'elapsed_seconds': perf_counter()-started,
              'timing_note': 'Batch elapsed excludes model initialization; image input_to_output includes decode, inference, annotation and writes',
              'counts_note': 'Detected observations, not unique identities; video direction counts sum frame observations'}
    (output / 'run.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n', encoding='utf-8')
    return report

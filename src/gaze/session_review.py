"""Persist a bounded saved-video session using the shared observation workflow."""
import json
import math
from pathlib import Path

import cv2

from gaze.events import MovementMonitor, MovementSettings
from gaze.history import HistoryTracker
from gaze.seats import SeatAssociator
from gaze.video import process_video
from gaze.review_setup import inspect_video

MAX_FRAMES = 18000
MAX_SECONDS = 300
MAX_OUTPUT_BYTES = 512 * 1024 * 1024


def validate_settings(value):
    if not isinstance(value, dict) or value.get('method') not in ('baseline', 'head'):
        raise ValueError('Choose baseline or head analysis')
    if not isinstance(value.get('mirrored'), bool):
        raise ValueError('Mirrored must be true or false')
    grid = value.get('tileGrid')
    if isinstance(grid, bool) or not isinstance(grid, int) or not 1 <= grid <= 4:
        raise ValueError('Detector tiling must be 1 to 4')
    seats = value.get('seats')
    if not isinstance(seats, list) or not 1 <= len(seats) <= 20:
        raise ValueError('Define 1 to 20 fixed seats')
    if any(not isinstance(s, dict) or not isinstance(s.get('id'), str)
           or not 1 <= len(s['id'].strip()) <= 40 for s in seats):
        raise ValueError('Seat names must contain 1 to 40 characters')
    associator = SeatAssociator({'schema_version': 1, 'seats': seats})
    movement = value.get('movement')
    if not isinstance(movement, dict):
        raise ValueError('Movement settings are required')
    ranges = {'min_duration': 300, 'repetition_window': 300, 'repeat_min_duration': 300, 'max_gap': 5}
    for key, upper in ranges.items():
        number = movement.get(key)
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) or not 0 < number <= upper:
            raise ValueError(f'{key} must be positive and at most {upper} seconds')
    count = movement.get('repetition_count')
    if isinstance(count, bool) or not isinstance(count, int) or not 2 <= count <= 100:
        raise ValueError('Repetition count must be an integer from 2 to 100')
    if movement['repeat_min_duration'] > movement['repetition_window']:
        raise ValueError('Minimum dwell must fit within the repetition window')
    normalized = MovementSettings(**{key: movement[key] for key in (*ranges, 'repetition_count')})
    return {'method': value['method'], 'mirrored': value['mirrored'], 'tileGrid': grid,
            'seats': associator.to_dict()['seats'], 'movement': normalized.to_dict()}


def process_session(input_path, output_dir, settings, pipeline):
    settings = validate_settings(settings)
    source, output = Path(input_path).resolve(), Path(output_dir).resolve()
    if output.exists() or output == source:
        raise ValueError('Choose a new session output directory')
    timing_check, _ = inspect_video(source, max_frames=MAX_FRAMES, max_seconds=MAX_SECONDS)
    capture = cv2.VideoCapture(str(source))
    try:
        if not capture.isOpened():
            raise ValueError('Cannot decode saved video')
        fps = capture.get(cv2.CAP_PROP_FPS)
        frames = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        width, height = capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if not math.isfinite(fps) or fps <= 0:
            raise ValueError('Saved video needs a valid constant frame rate')
        if frames > MAX_FRAMES or frames / fps > MAX_SECONDS:
            raise ValueError('Review supports clips up to 5 minutes and 18,000 frames')
        if min(width, height) <= 0 or max(width, height) > 1920 or width * height > 1920 * 1080:
            raise ValueError('Review supports at most 1920 x 1080 source pixels')
    finally:
        capture.release()
    if bool(pipeline.metadata.get('mirrored_input', False)) != settings['mirrored']:
        raise ValueError('Pipeline mirroring must match session settings')
    config = {'schema_version': 1, 'seats': settings['seats']}
    associator = SeatAssociator(config)
    gap = settings['movement']['max_gap']
    history = HistoryTracker(associator.seat_ids, gap)
    monitor = MovementMonitor(associator.seat_ids, MovementSettings(**settings['movement']))

    def output_size():
        return sum(p.stat().st_size for p in output.iterdir() if p.is_file()) if output.exists() else 0

    class BoundedPipeline:
        metadata = pipeline.metadata
        index = 0
        def process(self, image):
            h, w = image.shape[:2]
            if self.index >= MAX_FRAMES or (self.index + 1) / fps > MAX_SECONDS + 1e-7:
                raise ValueError('Decoded clip exceeds the review duration/frame limit')
            if max(w, h) > 1920 or w * h > 1920 * 1080:
                raise ValueError('Decoded frame exceeds the review resolution limit')
            if self.index % 30 == 0 and output_size() > MAX_OUTPUT_BYTES:
                raise ValueError('Session outputs exceed the 512 MB limit; use a shorter clip')
            self.index += 1
            return pipeline.process(image)

    summary = process_video(source, output, BoundedPipeline(), seat_associator=associator,
                            history_tracker=history, seat_config=config, movement_monitor=monitor,
                            run_label='website saved-seat review')
    if summary['decoded_fewer_than_advertised']:
        raise ValueError('The clip ended before its advertised frame count; convert or repair it before review')
    compact = []
    with (output / 'observations.jsonl').open(encoding='utf-8') as records:
        for line in records:
            row = json.loads(line)
            seats = {}
            for identifier, assignment in row['seat_association']['seats'].items():
                observation = assignment['observation']
                reason = assignment['reason'] or (observation or {}).get('unavailable_reason')
                seats[identifier] = {'direction': observation['direction'] if observation else 'unknown',
                                     'reason': reason, 'estimation_source': (observation or {}).get('estimation_source')}
            compact.append({'frame_index': row['frame_index'], 'time': row['source_timestamp_seconds'],
                            'detections': [{key: d[key] for key in ('bbox', 'direction', 'unavailable_reason')}
                                           for d in row['result']['detections']],
                            'seats': seats, 'review_flags': row['review_flags']})
    histories = {}
    for identifier, entries in history.entries.items():
        segments = []
        prior_key = None
        for entry in entries:
            key = (entry.direction, entry.reason, entry.segment_id, entry.estimation_source)
            if not segments or key != prior_key:
                segments.append({'start': entry.timestamp_seconds, 'end': entry.timestamp_seconds,
                                 'direction': entry.direction, 'valid': entry.valid, 'reason': entry.reason})
            else:
                segments[-1]['end'] = entry.timestamp_seconds
            prior_key = key
        histories[identifier] = segments
    review = {'schema_version': 1, 'source': summary['source'], 'source_sha256': summary['input_sha256'], 'timing_check': timing_check,
              'settings': settings, 'pipeline': pipeline.metadata, 'timing': summary['timing'],
              'direction_counts': summary['direction_counts'], 'frames': compact,
              'events': monitor.to_dict()['events'], 'histories': histories,
              'limitations': ['Decoded presentation timestamp cadence checked against source FPS with millisecond quantization tolerance; unavailable or inconsistent timing is rejected.',
                              'Fixed seats are regions, not identities. Head directions are camera-relative, not desk calibrated.',
                              'Movement events support instructor review; event accuracy and classroom applicability remain unvalidated.']}
    serialized = json.dumps(review, allow_nan=False)
    if len(serialized.encode()) > 64 * 1024 * 1024 or output_size() + len(serialized.encode()) > MAX_OUTPUT_BYTES:
        raise ValueError('Session record/output limit exceeded; use a shorter clip')
    (output / 'settings.json').write_text(json.dumps(settings, indent=2) + '\n', encoding='utf-8')
    (output / 'review.json').write_text(serialized + '\n', encoding='utf-8')
    return review

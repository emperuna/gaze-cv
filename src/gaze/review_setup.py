"""Video timing inspection and optional fixed-seat suggestions, never identities."""
import math
from pathlib import Path

import cv2
import numpy as np


def check_timestamps(timestamps_ms, fps):
    if not math.isfinite(fps) or not 0 < fps <= 240 or len(timestamps_ms) < 2:
        raise ValueError('Video timing could not be checked. Use a clip of at least two frames with a supported frame rate (up to 240 FPS).')
    period = 1000. / fps
    tolerance = max(1.1, min(2., period * .1))
    first = timestamps_ms[0]
    maximum = 0.
    previous = None
    for index, timestamp in enumerate(timestamps_ms):
        if not math.isfinite(timestamp) or timestamp < 0 or (previous is not None and timestamp <= previous):
            raise ValueError('Video timestamps are unavailable or irregular. Convert a copy to constant-frame-rate MP4 or WebM and upload it again.')
        deviation = abs((timestamp - first) - index * period)
        maximum = max(maximum, deviation)
        if deviation > tolerance:
            raise ValueError('This clip has variable or inconsistent frame timing. Convert a copy to constant-frame-rate MP4 or WebM and upload it again.')
        previous = timestamp
    return {'verified': True, 'fps': fps, 'frames': len(timestamps_ms),
            'max_deviation_ms': maximum, 'tolerance_ms': tolerance,
            'method': 'Decoded OpenCV presentation timestamps compared with frame_index / source_fps; millisecond quantization tolerated.'}


def inspect_video(path, *, max_frames=18000, max_seconds=300):
    capture = cv2.VideoCapture(str(Path(path)))
    try:
        if not capture.isOpened():
            raise ValueError('Cannot decode saved video')
        fps = capture.get(cv2.CAP_PROP_FPS)
        advertised = capture.get(cv2.CAP_PROP_FRAME_COUNT)
        if not math.isfinite(fps) or not 0 < fps <= 240:
            raise ValueError('Video frame rate is unavailable or unsupported (maximum 240 FPS).')
        if not math.isfinite(advertised) or advertised > max_frames or advertised / fps > max_seconds:
            raise ValueError('Review supports clips up to 5 minutes and 18,000 frames')
        width, height = capture.get(cv2.CAP_PROP_FRAME_WIDTH), capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
        if min(width, height) <= 0 or max(width, height) > 1920 or width * height > 1920 * 1080:
            raise ValueError('Review supports at most 1920 x 1080 source pixels')
        indices = sorted({round(i * (advertised - 1) / 4) for i in range(5)}) if advertised >= 2 else [0, 1, 2, 3, 4]
        timestamps, samples, actual_indices = [], [], []
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            index = len(timestamps)
            if index >= max_frames or (index + 1) / fps > max_seconds + 1e-7:
                raise ValueError('Decoded clip exceeds the review duration/frame limit')
            if frame.shape[:2] != (int(height), int(width)):
                raise ValueError('Video frame dimensions changed within the source')
            timestamps.append(capture.get(cv2.CAP_PROP_POS_MSEC))
            if index in indices:
                samples.append(frame)
                actual_indices.append(index)
        if advertised > 0 and len(timestamps) < advertised:
            raise ValueError('The clip ended before its advertised frame count. Repair or convert a copy before review.')
        timing = check_timestamps(timestamps, fps)
        timing.update({'width': int(width), 'height': int(height), 'sample_indices': actual_indices,
                       'decoder': capture.getBackendName()})
        return timing, samples
    finally:
        capture.release()


def suggest_seats(samples, detector):
    """Cluster heads across sampled frames; all returned regions require review.

    A cluster accepts at most one detection per frame. Stable nearby heads stay
    distinct; one-frame appearances are excluded. This is a setup aid, not person
    tracking, seat accuracy, or proof that all occupied seats were detected.
    """
    clusters = []
    for frame_index, image in enumerate(samples):
        height, width = image.shape[:2]
        used = set()
        for observation in sorted(detector.process(image).detections, key=lambda item: item.bbox[0]):
            x, y, w, h = observation.bbox
            if not all(math.isfinite(v) for v in (x, y, w, h)) or w <= 0 or h <= 0:
                continue
            box = [max(0., x / width), max(0., y / height), min(1., (x + w) / width), min(1., (y + h) / height)]
            if box[2] - box[0] < .01 or box[3] - box[1] < .01:
                continue
            center = np.array([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])
            matches = []
            for index, cluster in enumerate(clusters):
                if index in used:
                    continue
                median = np.median(cluster['boxes'], axis=0)
                prior = np.array([(median[0] + median[2]) / 2, (median[1] + median[3]) / 2])
                distance = float(np.linalg.norm(center - prior))
                if distance <= .08:
                    matches.append((distance, index))
            if matches:
                chosen = min(matches)[1]
                clusters[chosen]['boxes'].append(box)
                clusters[chosen]['frames'].add(frame_index)
            else:
                chosen = len(clusters)
                clusters.append({'boxes': [box], 'frames': {frame_index}})
            used.add(chosen)
    candidates = [cluster for cluster in clusters if len(cluster['frames']) >= min(2, len(samples))]
    candidates.sort(key=lambda item: -len(item['frames']))
    regions = []

    def overlaps(a, b):
        return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])

    for cluster in candidates:
        raw = [float(v) for v in np.median(cluster['boxes'], axis=0)]
        if any(overlaps(raw, other['raw']) for other in regions):
            continue
        w, h = raw[2] - raw[0], raw[3] - raw[1]
        expanded = [max(0., raw[0] - w * .4), max(0., raw[1] - h * .4),
                    min(1., raw[2] + w * .4), min(1., raw[3] + h * .4)]
        region = expanded
        for other in regions:
            if overlaps(region, other['roi']):
                region = raw
                other['roi'] = other['raw']
        regions.append({'raw': raw, 'roi': region})
        if len(regions) >= 20:
            break
    regions = [item['roi'] for item in regions]
    regions.sort(key=lambda box: ((box[0] + box[2]) / 2, box[1]))
    note = ('Review every box and add missed seats manually. Suggestions use repeated head detections, not identities.'
            if regions else 'No stable head regions were found. Add seats manually by drawing around each fixed head area.')
    return {'seats': [{'id': f'seat-{index + 1}', 'roi': roi} for index, roi in enumerate(regions)],
            'sampled_frames': len(samples), 'note': note}

"""Review a saved video with the live camera engine, sampling by each frame's own time."""
import base64
from dataclasses import dataclass
import math

import cv2

MAX_SECONDS = 10_800
MAX_SIZE = (1280, 720)
SETUP_LAST_SECOND = 4


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    duration_seconds: float


def open_video(path, capture=cv2.VideoCapture):
    """Describe a video, or raise a one-sentence ValueError a teacher can act on.

    `capture` is the VideoCapture factory; tests inject a fake one."""
    cap = capture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError('This file could not be opened as a video. Choose an MP4, MOV, WEBM or M4V file.')
        width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps, frames = cap.get(cv2.CAP_PROP_FPS), cap.get(cv2.CAP_PROP_FRAME_COUNT)
    finally:
        cap.release()
    if width <= 0 or height <= 0 or not math.isfinite(fps) or fps <= 0 or not math.isfinite(frames) or frames <= 0:
        raise ValueError('This video could not be read. Try exporting it again as an MP4 file.')
    duration = frames / fps
    if duration > MAX_SECONDS:
        raise ValueError('This video is longer than 3 hours. Choose a shorter recording.')
    return VideoInfo(width, height, fps, duration)


def _fit(image):
    height, width = image.shape[:2]
    scale = min(MAX_SIZE[0] / width, MAX_SIZE[1] / height, 1.)
    if scale == 1.:
        return image
    return cv2.resize(image, (max(1, round(width * scale)), max(1, round(height * scale))),
                      interpolation=cv2.INTER_AREA)


def sample_frames(path, every=0.1, start=0.0, capture=cv2.VideoCapture):
    """Yield (video_seconds, frame) about every `every` seconds, from `start`.

    Times come from each frame's own timestamp, so variable-frame-rate phone videos sample evenly."""
    cap = capture(str(path))
    try:
        if not cap.isOpened():
            raise ValueError('This file could not be opened as a video. Choose an MP4, MOV, WEBM or M4V file.')
        if start > 0:
            cap.set(cv2.CAP_PROP_POS_MSEC, start * 1000)
        due, last = start, -1.
        while cap.grab():
            seconds = cap.get(cv2.CAP_PROP_POS_MSEC) / 1000
            # Tolerate float jitter so 0.1 s steps do not skip a frame landing at 0.0999.
            if seconds < due - 1e-3 or seconds <= last:
                continue
            ok, image = cap.retrieve()
            if not ok or image is None:
                continue
            last = seconds
            due = max(due + every, seconds + every / 2)
            yield seconds, _fit(image)
    finally:
        cap.release()


def suggest(path, processor, capture=cv2.VideoCapture):
    """Suggest seats from frames at 0 to 4 seconds; includes a preview of the first frame."""
    info = open_video(path, capture)
    preview = None
    for seconds, image in sample_frames(path, every=1.0, capture=capture):
        if seconds > SETUP_LAST_SECOND + .5:
            break
        if preview is None:
            preview = base64.b64encode(cv2.imencode('.jpg', image)[1]).decode('ascii')
        processor.analyse(seconds, image, set(), setup=True)
    if preview is None:
        raise ValueError('This video has no readable frames. Try exporting it again as an MP4 file.')
    suggestion = processor.suggest()
    return {'seats': suggestion['seats'], 'sampled_frames': suggestion['sampled_frames'],
            'note': suggestion['note'], 'preview_jpeg': preview, 'duration_seconds': info.duration_seconds,
            'width': info.width, 'height': info.height}


def review(path, processor, emit, capture=cv2.VideoCapture):
    """Emit one {t, seats, events, duration} per sampled frame, then {done, duration}."""
    duration = open_video(path, capture).duration_seconds
    for seconds, image in sample_frames(path, capture=capture):
        result = processor.analyse(seconds, image, set())
        emit({'t': seconds, 'seats': result.get('seats', {}), 'events': result.get('events', []),
              'duration': duration})
    emit({'done': True, 'duration': duration})

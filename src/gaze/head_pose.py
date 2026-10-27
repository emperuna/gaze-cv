"""Experimental seat-relative head orientation, without facial landmarks.

Model output is yaw/pitch/roll degrees. Positive model yaw faces image-left;
positive model pitch points up. Image coordinates are x-right, y-down. The
rotation maps local head axes to camera axes; its third column is forward.
Reconstruct upstream Rz(roll) Ry(yaw) Rx(pitch), then conjugate by
S=diag(-1,1,1) to map the model's horizontal convention to image coordinates.
"""
from dataclasses import asdict, dataclass
import math

import cv2
import numpy as np


@dataclass(frozen=True)
class HeadSettings:
    min_detection_score: float = .5
    min_head_pixels: int = 32
    min_blur_variance: float = 10.
    max_clipped_fraction: float = .15
    yaw: float = 25.
    pitch: float = 25.
    max_yaw: float = 100.
    max_pitch: float = 70.

    def __post_init__(self):
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
               for v in asdict(self).values()):
            raise ValueError('Head settings must be finite numbers')
        if (not 0 < self.min_detection_score <= 1 or
                not isinstance(self.min_head_pixels, int) or self.min_head_pixels < 2 or
                self.min_blur_variance < 0 or not 0 <= self.max_clipped_fraction < 1 or
                not 0 < self.yaw < self.max_yaw <= 180 or not 0 < self.pitch < self.max_pitch < 90):
            raise ValueError('Invalid head quality or direction settings')

    def to_dict(self):
        return asdict(self)


def validate_rotation(rotation):
    rotation = np.asarray(rotation, dtype=np.float64)
    if (rotation.shape != (3, 3) or not np.isfinite(rotation).all() or
            not np.allclose(rotation.T @ rotation, np.eye(3), atol=1e-4) or
            not np.isclose(np.linalg.det(rotation), 1., atol=1e-4)):
        raise ValueError('Expected a finite proper 3x3 rotation matrix')
    return rotation


def model_rotation(angles):
    angles = np.asarray(angles, dtype=np.float64)
    if angles.shape != (3,) or not np.isfinite(angles).all() or np.any(np.abs(angles) > 180):
        raise ValueError('Model must return three finite angles in [-180,180]')
    yaw, pitch, roll = np.radians(angles)
    cy, sy = math.cos(-yaw), math.sin(-yaw)
    cp, sp = math.cos(pitch), math.sin(pitch)
    cr, sr = math.cos(-roll), math.sin(-roll)
    rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    return rz @ ry @ rx


def relative_direction(rotation, neutral, settings=None):
    settings = settings or HeadSettings()
    relative = validate_rotation(neutral).T @ validate_rotation(rotation)
    x, y, z = relative[:, 2]
    yaw = math.degrees(math.atan2(x, z))
    pitch = math.degrees(math.atan2(y, math.hypot(x, z)))
    scores = {'seat_yaw_degrees': yaw, 'seat_down_degrees': pitch}
    if abs(yaw) > settings.max_yaw or abs(pitch) > settings.max_pitch:
        return 'unknown', scores, 'head_pose_outside_supported_range'
    side = 'left' if yaw > settings.yaw else 'right' if yaw < -settings.yaw else None
    if pitch < -settings.pitch:
        return 'unknown', scores, 'upward_pose_outside_four_classes'
    if pitch > settings.pitch:
        return ('unknown', scores, 'mixed_down_and_sideways') if side else ('down', scores, None)
    return side or 'forward', scores, None


def head_quality(image, bbox, score, settings=None):
    """Quality heuristics only, not calibrated confidence in predicted pose."""
    settings = settings or HeadSettings()
    if not math.isfinite(score) or not settings.min_detection_score <= score <= 1:
        return 'head_detection_score'
    if len(bbox) != 4 or not all(math.isfinite(v) for v in bbox):
        return 'invalid_head_bbox'
    x, y, width, height = bbox
    if min(width, height) < settings.min_head_pixels:
        return 'head_too_small'
    h, w = image.shape[:2]
    x0, y0, x1, y1 = max(0, int(x)), max(0, int(y)), min(w, int(x+width)), min(h, int(y+height))
    if x1 <= x0 or y1 <= y0 or 1 - (x1-x0)*(y1-y0)/(width*height) > settings.max_clipped_fraction:
        return 'head_clipped'
    gray = cv2.cvtColor(image[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY)
    if cv2.Laplacian(gray, cv2.CV_64F).var() < settings.min_blur_variance:
        return 'head_blurry'
    return None

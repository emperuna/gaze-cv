"""Experimental eye/nose/chin geometry; unitless scores, never pose angles.

Left/right describe the subject. On unmirrored images subject-left is image-right.
"""
from dataclasses import asdict, dataclass
import math

@dataclass(frozen=True)
class Thresholds:
    yaw: float = 0.18
    down: float = 0.40
    min_eye_span: float = 0.015
    def __post_init__(self):
        if not all(math.isfinite(value) for value in asdict(self).values()):
            raise ValueError("Thresholds must be finite.")
        if self.yaw <= 0 or not 0 < self.down < 1 or not 0 < self.min_eye_span < 1:
            raise ValueError("Require yaw > 0, 0 < down < 1, and 0 < min_eye_span < 1.")
    def to_dict(self):
        return asdict(self)

def classify_direction(landmarks, thresholds=None, mirrored=False, aspect_ratio=1.0):
    """Return direction, scores, unavailable_reason; mixed poses stay unknown.

Eye axis removes in-plane roll. Aspect ratio corrects normalized x/y to
common units. This baseline does not distinguish upward poses reliably.
"""
    thresholds = thresholds or Thresholds()
    required = ("left_eye", "right_eye", "nose", "chin")
    if any(key not in landmarks for key in required):
        return "unknown", {}, "missing_landmarks"
    try:
        points = {key: (float(landmarks[key][0]) * aspect_ratio, float(landmarks[key][1])) for key in required}
    except (TypeError, ValueError, IndexError):
        return "unknown", {}, "invalid_landmarks"
    if not math.isfinite(aspect_ratio) or aspect_ratio <= 0 or any(not math.isfinite(v) for p in points.values() for v in p):
        return "unknown", {}, "invalid_landmarks"
    a, b = sorted([points["left_eye"], points["right_eye"]])
    dx, dy = b[0] - a[0], b[1] - a[1]
    span = math.hypot(dx, dy)
    if span / aspect_ratio < thresholds.min_eye_span:
        return "unknown", {}, "eye_span_too_small"
    ux, uy = dx / span, dy / span
    vx, vy = -uy, ux
    midpoint = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    nose = (points["nose"][0] - midpoint[0], points["nose"][1] - midpoint[1])
    chin = (points["chin"][0] - midpoint[0], points["chin"][1] - midpoint[1])
    chin_vertical = chin[0] * vx + chin[1] * vy
    if chin_vertical <= span * 0.2:
        return "unknown", {}, "degenerate_face_geometry"
    horizontal = (nose[0] * ux + nose[1] * uy) / span
    yaw = -horizontal if mirrored else horizontal
    down = (nose[0] * vx + nose[1] * vy) / chin_vertical
    scores = {"horizontal_offset": yaw, "nose_down_ratio": down, "eye_span": span / aspect_ratio}
    if not -0.2 <= down <= 1.2:
        return "unknown", scores, "implausible_face_geometry"
    side = "left" if yaw > thresholds.yaw else "right" if yaw < -thresholds.yaw else None
    if down > thresholds.down:
        if side:
            return "unknown", scores, "mixed_down_and_sideways"
        return "down", scores, None
    return side or "forward", scores, None

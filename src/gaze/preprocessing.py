"""Shared image preparation; input is uint8 BGR, model input contiguous RGB."""
from dataclasses import dataclass
from pathlib import Path
import cv2
import numpy as np

@dataclass(frozen=True)
class PreparedImage:
    rgb: np.ndarray
    original_width: int
    original_height: int
    def to_dict(self):
        return {"input_color": "BGR", "model_color": "RGB", "dtype": "uint8",
                "original_size": [self.original_width, self.original_height],
                "prepared_size": [int(self.rgb.shape[1]), int(self.rgb.shape[0])],
                "resize": "aspect-preserving shrink only; INTER_AREA",
                "normalization": "none; MediaPipe performs internal model normalization"}

def validate_image(image):
    if not isinstance(image, np.ndarray) or image.dtype != np.uint8:
        raise ValueError("Expected a uint8 BGR image.")
    if image.ndim != 3 or image.shape[2] != 3 or min(image.shape[:2]) < 2:
        raise ValueError("Expected a nonempty H x W x 3 BGR image, at least 2 pixels per side.")

def prepare_image(image_bgr, max_width=1280):
    """Shrink without cropping/mirroring/stretching, then convert BGR to RGB."""
    validate_image(image_bgr)
    if not isinstance(max_width, int) or max_width < 2:
        raise ValueError("max_width must be an integer of at least 2.")
    height, width = image_bgr.shape[:2]
    prepared = image_bgr
    if width > max_width:
        prepared = cv2.resize(image_bgr, (max_width, max(2, round(height * max_width / width))), interpolation=cv2.INTER_AREA)
    return PreparedImage(np.ascontiguousarray(cv2.cvtColor(prepared, cv2.COLOR_BGR2RGB)), width, height)

def read_image(path):
    """Decode through bytes so Windows Unicode paths work."""
    path = Path(path)
    if not path.is_file():
        raise ValueError(f"Image does not exist: {path}")
    encoded = np.frombuffer(path.read_bytes(), dtype=np.uint8)
    if encoded.size == 0:
        raise ValueError(f"Cannot decode empty image: {path}")
    try:
        image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    except cv2.error as error:
        raise ValueError(f"Cannot decode image: {path}") from error
    if image is None:
        raise ValueError(f"Cannot decode image: {path}")
    validate_image(image)
    return image

def write_image(path, image):
    validate_image(image)
    path = Path(path)
    extension = path.suffix.lower()
    if extension not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError("Output image must use .png, .jpg, .jpeg, or .webp.")
    ok, encoded = cv2.imencode(extension, image)
    if not ok:
        raise ValueError(f"Could not encode output image: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded.tobytes())

def save_preprocessing_evidence(image_bgr, output, max_width=1280):
    """Save real before/after panels; RGB converted back only for display."""
    prepared = prepare_image(image_bgr, max_width)
    after = cv2.cvtColor(prepared.rgb, cv2.COLOR_RGB2BGR)
    panels = []
    for image, label in [(image_bgr, "Before: decoded BGR"), (after, "After: resized RGB (shown as BGR)")]:
        h, w = image.shape[:2]
        shown = cv2.resize(image, (480, max(2, round(h * 480 / w))), interpolation=cv2.INTER_AREA)
        canvas = np.full((shown.shape[0] + 58, 480, 3), 245, dtype=np.uint8)
        canvas[58:] = shown
        cv2.putText(canvas, label, (8, 22), cv2.FONT_HERSHEY_SIMPLEX, .43, (20, 20, 20), 1, cv2.LINE_AA)
        cv2.putText(canvas, f"Actual pixels: {w} x {h}; uint8", (8, 44), cv2.FONT_HERSHEY_SIMPLEX, .45, (20, 20, 20), 1, cv2.LINE_AA)
        panels.append(canvas)
    height = max(p.shape[0] for p in panels)
    strip = np.full((height, 960, 3), 245, dtype=np.uint8)
    for index, panel in enumerate(panels):
        strip[:panel.shape[0], index * 480:(index + 1) * 480] = panel
    write_image(output, strip)
    return prepared.to_dict()

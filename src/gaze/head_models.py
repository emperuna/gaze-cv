"""Independent CPU adapters for the reviewed Gold-YOLO head and 6DRepNet360 ONNX files.

Upstream interfaces/provenance: models/README.md. No facial landmarks or person
identity are required. Model loading is lazy so legacy use needs no ONNX runtime.
"""
from dataclasses import dataclass
import hashlib
from pathlib import Path

import cv2
import numpy as np

from gaze.preprocessing import validate_image

MODEL_DIR = Path(__file__).resolve().parents[2] / 'models' / 'downloads'
HEAD_FILE = 'gold_yolo_n_head_post_0277_0.5071_1x3x640x640.onnx'
POSE_FILE = 'sixdrepnet360_1x3x224x224_full.onnx'
HEAD_SHA256 = '37e79ad3cc1eba99feea6884867a29f549d5cbd589b67ceacc8509629505605e'
POSE_SHA256 = '422b69d17bf02e164bd1062f5e970f67f1688cadf7d700800fad5fa12a16fc82'


@dataclass(frozen=True)
class HeadDetection:
    bbox: tuple
    score: float


def detector_input(image):
    validate_image(image)
    rgb = cv2.cvtColor(cv2.resize(image, (640, 640)), cv2.COLOR_BGR2RGB)
    return np.ascontiguousarray(rgb.transpose(2, 0, 1)[None], dtype=np.float32) / 255.


def pose_input(crop):
    validate_image(crop)
    center = cv2.resize(crop, (256, 256))[16:240, 16:240]
    rgb = cv2.cvtColor(center, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.
    rgb = (rgb - np.array([.485, .456, .406], np.float32)) / np.array([.229, .224, .225], np.float32)
    return np.ascontiguousarray(rgb.transpose(2, 0, 1)[None])


def decode_heads(rows, width, height, threshold=.5):
    rows = np.asarray(rows)
    if rows.ndim != 2 or rows.shape[1] != 7 or not np.isfinite(rows).all():
        raise ValueError('Head detector must return finite Nx7 rows')
    heads = []
    for batch, label, x0, y0, x1, y1, score in rows:
        if batch != 0 or label != 0 or not threshold <= score <= 1 or x1 <= x0 or y1 <= y0:
            continue
        # Leave out-of-image coordinates intact for the clipping quality gate.
        bbox = (float(x0*width/640), float(y0*height/640),
                float((x1-x0)*width/640), float((y1-y0)*height/640))
        heads.append(HeadDetection(bbox, float(score)))
    return heads


def model_hashes(directory=MODEL_DIR):
    result = {}
    for name, expected in [(HEAD_FILE, HEAD_SHA256), (POSE_FILE, POSE_SHA256)]:
        path = Path(directory) / name
        if not path.is_file():
            raise ValueError(f'Head model missing: {path}. Run scripts/download_head_models.py')
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f'Head model checksum mismatch: {path}')
        result[name] = actual
    return result


class HeadModels:
    def __init__(self, directory=MODEL_DIR):
        hashes = model_hashes(directory)
        try:
            import onnxruntime as ort
        except ImportError as error:
            raise ValueError('Install requirements-head-pose.txt for optional CPU head-pose inference') from error
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.detector = ort.InferenceSession(str(Path(directory)/HEAD_FILE), options, providers=['CPUExecutionProvider'])
        self.pose = ort.InferenceSession(str(Path(directory)/POSE_FILE), options, providers=['CPUExecutionProvider'])
        if self.detector.get_inputs()[0].shape != [1, 3, 640, 640] or self.pose.get_inputs()[0].shape != [1, 3, 224, 224]:
            raise ValueError('Unexpected head model input shapes')
        self.metadata = {'backend': 'ONNX Runtime CPU', 'onnxruntime_version': ort.__version__,
                         'model_sha256': hashes, 'direction_basis': 'per-seat neutral rotation',
                         'model_sources': {
                             'head': 'https://github.com/PINTO0309/PINTO_model_zoo/tree/main/421_Gold-YOLO-Head',
                             'pose': 'https://github.com/PINTO0309/PINTO_model_zoo/tree/main/423_6DRepNet360'},
                         'upstream_terms': {'head': 'GPL-3.0 directory notice', 'pose': 'MIT directory notice'},
                         'validation': 'experimental; no classroom/occlusion accuracy claim'}

    def detect(self, image, threshold=.5):
        rows = self.detector.run(None, {self.detector.get_inputs()[0].name: detector_input(image)})[0]
        return decode_heads(rows, image.shape[1], image.shape[0], threshold)

    def angles(self, image, bbox):
        x, y, width, height = bbox
        h, w = image.shape[:2]
        # Match upstream 1.2x head expansion, 256 resize, 224 center crop.
        cx, cy = x+width/2, y+height/2
        x0, x1 = max(0, int(cx-width*.6)), min(w, int(cx+width*.6))
        y0, y1 = max(0, int(cy-height*.6)), min(h, int(cy+height*.6))
        value = self.pose.run(None, {self.pose.get_inputs()[0].name: pose_input(image[y0:y1, x0:x1])})[0]
        if value.shape != (1, 3) or not np.isfinite(value).all():
            raise ValueError('Head pose model returned invalid angles')
        return value[0].astype(float)

    def close(self):
        self.detector = self.pose = None

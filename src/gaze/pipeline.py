"""Shared image baseline used by image, video, and evaluation commands."""
from dataclasses import asdict, dataclass
from time import perf_counter
import numpy as np
from gaze.baseline import Thresholds, classify_direction
from gaze.landmarks import LandmarkFace, MediaPipeDetector
from gaze.preprocessing import prepare_image
from gaze.pose import PoseThresholds, estimate_direction

@dataclass(frozen=True)
class FaceObservation:
    bbox: tuple
    direction: str
    landmarks: dict
    scores: dict
    unavailable_reason: str | None = None
    estimation_source: str = 'facial_landmarks'
    def to_dict(self):
        return asdict(self)

@dataclass(frozen=True)
class ImageResult:
    width: int
    height: int
    detections: list
    processing_ms: float
    preprocessing: dict
    def to_dict(self):
        return asdict(self)

class ImagePipeline:
    def __init__(self, model_path=None, max_faces=10, thresholds=None, max_width=1280, mirrored=False, detector=None, tile_grid=1, method="baseline", pose_thresholds=None):
        if not isinstance(max_width, int) or max_width < 2:
            raise ValueError("max_width must be an integer of at least 2.")
        if method not in {"baseline", "pose"}:
            raise ValueError("method must be baseline or pose.")
        self.method = method
        self.pose_thresholds = pose_thresholds or PoseThresholds()
        self.thresholds = thresholds or Thresholds()
        self.max_width, self.mirrored = max_width, mirrored
        self.detector = detector if detector is not None else MediaPipeDetector(model_path, max_faces, tile_grid)
        self.metadata = {
            "method": "eye-nose-chin geometry baseline; no pose-angle solver" if method == "baseline" else "six-point nominal-camera solvePnP",
            "threshold_status": "default down=.40 selected on Pointing04 validation; yaw=.18 experimental; overrides user-supplied; no test data used for default selection", "thresholds": self.thresholds.to_dict(),
            "max_width": max_width, "mirrored_input": mirrored,
            "mirror_handling": "unmirror RGB before detection, then map observations to source pixels" if mirrored else "input unmirrored",
            "direction_convention": "subject-relative left/right; down/side mixed -> unknown",
            "bbox_convention": "original-image pixels (x,y,width,height)",
            "landmark_convention": "full-image normalized x,y; x rightward,y downward",
            "detector": getattr(self.detector, "metadata", {"backend": "injected"})}
        if method == "pose":
            self.metadata.update({"threshold_status":"fixed experimental angle thresholds; no camera/subject calibration",
                                  "thresholds":self.pose_thresholds.to_dict(),
                                  "camera":"nominal focal=max(width,height), center=image center, zero distortion; angles approximate",
                                  "canonical_model_source":"Google MediaPipe canonical face mesh, Apache-2.0, a908d668c730da128dfa8d9f6bd25d519d006692"})
    def process(self, image_bgr):
        started = perf_counter()
        prepared = prepare_image(image_bgr, self.max_width)
        observations = []
        detector_rgb = np.ascontiguousarray(prepared.rgb[:, ::-1]) if self.mirrored else prepared.rgb
        for face in self.detector.detect(detector_rgb):
            if self.mirrored:
                x, y, width, height = face.bbox
                face = LandmarkFace((1-x-width, y, width, height),
                                    {name:(1-point[0], point[1]) for name,point in face.landmarks.items()})
            if self.method == "pose":
                direction, scores, reason = estimate_direction(face.landmarks, prepared.original_width, prepared.original_height, self.pose_thresholds, self.mirrored)
            else:
                direction, scores, reason = classify_direction(face.landmarks, self.thresholds, self.mirrored, prepared.original_width / prepared.original_height)
            x, y, width, height = face.bbox
            bbox = (round(x * prepared.original_width), round(y * prepared.original_height), round(width * prepared.original_width), round(height * prepared.original_height))
            observations.append(FaceObservation(bbox, direction, face.landmarks, scores, reason))
        return ImageResult(prepared.original_width, prepared.original_height, observations, (perf_counter()-started)*1000, prepared.to_dict())
    def close(self):
        close = getattr(self.detector, "close", None)
        if close:
            close()
    def __enter__(self):
        return self
    def __exit__(self, exc_type, exc_value, traceback):
        self.close()

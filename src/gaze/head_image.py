"""Automatic camera-relative head directions, without seat calibration."""
from time import perf_counter
import numpy as np

from gaze.head_models import HeadModels
from gaze.head_pose import HeadSettings, head_quality, model_rotation, relative_direction
from gaze.pipeline import FaceObservation, ImageResult
from gaze.preprocessing import validate_image


class HeadImagePipeline:
    def __init__(self, *, models=None, model_dir=None, mirrored=False, settings=None):
        self.models = models if models is not None else HeadModels(**({'directory': model_dir} if model_dir else {}))
        self.settings = settings or HeadSettings()
        self.mirrored = mirrored
        self.metadata = {
            'method': 'Gold-YOLO head detection + 6DRepNet360 camera-relative rotation',
            'estimation_source': 'head_pose_fallback', 'mirrored_input': mirrored,
            'detector': {**self.models.metadata, 'direction_basis': 'camera axes; no desk calibration'},
            'head_settings': self.settings.to_dict(),
            'count_semantics': 'detected heads, including unknown direction',
            'direction_convention': 'subject-relative left/right about camera-facing neutral; down/side mixed and upward -> unknown',
            'bbox_convention': 'original-image pixels (x,y,width,height)',
            'limitation': 'Head orientation estimate, not eye gaze or direction relative to a desk'}

    def process(self, image):
        started = perf_counter()
        validate_image(image)
        canonical = np.ascontiguousarray(image[:, ::-1]) if self.mirrored else image
        observations = []
        for head in self.models.detect(canonical, self.settings.min_detection_score):
            reason = head_quality(canonical, head.bbox, head.score, self.settings)
            scores = {'head_detection_score': head.score}
            direction = 'unknown'
            if reason is None:
                try:
                    angles = self.models.angles(canonical, head.bbox)
                    rotation = model_rotation(angles)
                except ValueError:
                    reason = 'invalid_head_pose_output'
                else:
                    direction, relative, reason = relative_direction(rotation, np.eye(3), self.settings)
                    scores.update({'model_angles_degrees': np.asarray(angles).tolist(),
                                   'camera_yaw_degrees': relative['seat_yaw_degrees'],
                                   'camera_down_degrees': relative['seat_down_degrees']})
            x, y, width, height = head.bbox
            bbox = (image.shape[1]-x-width, y, width, height) if self.mirrored else head.bbox
            observations.append(FaceObservation(bbox, direction, {}, scores, reason, 'head_pose_fallback'))
        h, w = image.shape[:2]
        return ImageResult(w, h, observations, (perf_counter()-started)*1000, {
            'input_color': 'BGR', 'detector': 'whole image; resize 640 square; RGB float32 /255 NCHW',
            'pose': '1.2x head crop; resize 256 square; center crop 224; RGB ImageNet normalization',
            'mirror_handling': 'unmirror before inference; map boxes to source pixels'})

    def close(self):
        self.models.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

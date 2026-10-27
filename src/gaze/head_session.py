"""Fixed-seat head regions, explicit neutral calibration, and source-bound inference."""
from dataclasses import asdict
import hashlib
import json
from time import perf_counter

import numpy as np

from gaze.head_models import HeadModels
from gaze.head_pose import HeadSettings, head_quality, model_rotation, relative_direction, validate_rotation
from gaze.pipeline import FaceObservation, ImageResult
from gaze.preprocessing import validate_image
from gaze.seats import SeatAssociator

ROTATION_CONVENTION = 'image_axes_v1: S @ Rz(model_roll) Ry(model_yaw) Rx(model_pitch) @ S; S=diag(-1,1,1); neutral.T @ observed'


def seat_config_hash(config):
    canonical = SeatAssociator(config).to_dict()
    return hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _digest(value):
    return isinstance(value, str) and len(value) == 64 and all(c in '0123456789abcdef' for c in value)


def build_calibration(config, source_hash, models, references, mirrored=False, settings=None):
    seats = SeatAssociator(config)
    if not _digest(source_hash) or not models or not all(_digest(v) for v in models.values()):
        raise ValueError('Calibration requires SHA256 source and model hashes')
    if set(references) != set(seats.seat_ids):
        raise ValueError('Provide manually verified neutral references for every seat')
    neutral = {}
    for seat, samples in references.items():
        if not samples:
            raise ValueError('Neutral reference list must not be empty')
        frames, rotations, records = set(), [], []
        for frame, angles in samples:
            if type(frame) is not int or frame < 0 or frame in frames:
                raise ValueError('Neutral reference frame indices must be unique nonnegative integers')
            frames.add(frame)
            rotation = model_rotation(angles)
            # A single reference is allowed, but multiple references must agree.
            if rotations:
                distance = np.degrees(np.arccos(np.clip((np.trace(rotations[0].T @ rotation)-1)/2, -1, 1)))
                if distance > 15:
                    raise ValueError('Neutral references disagree by more than 15 degrees')
            rotations.append(rotation)
            records.append({'frame_index': frame, 'model_angles_degrees': np.asarray(angles).tolist()})
        u, _, vt = np.linalg.svd(np.mean(rotations, axis=0))
        average = u @ np.diag([1, 1, np.linalg.det(u @ vt)]) @ vt
        neutral[seat] = {'rotation': average.tolist(), 'references': records}
    return {'schema_version': 1, 'source_sha256': source_hash, 'seat_config_sha256': seat_config_hash(config),
            'model_sha256': dict(models), 'mirrored_input': bool(mirrored), 'seats': neutral,
            'quality_settings': (settings or HeadSettings()).to_dict(),
            'rotation_convention': ROTATION_CONVENTION,
            'reference_note': 'User-selected visibly forward reference frames; not automatically inferred ground truth'}


def validate_calibration(calibration, config, source_hash, models, mirrored=False):
    try:
        if (type(calibration['schema_version']) is not int or calibration['schema_version'] != 1 or not _digest(source_hash) or
                calibration['source_sha256'] != source_hash or
                calibration['seat_config_sha256'] != seat_config_hash(config) or
                calibration['model_sha256'] != models or
                type(calibration['mirrored_input']) is not bool or calibration['mirrored_input'] != mirrored or
                calibration['rotation_convention'] != ROTATION_CONVENTION):
            raise ValueError('Calibration source, models, regions or mirroring do not match')
        seats = SeatAssociator(config)
        if set(calibration['seats']) != set(seats.seat_ids):
            raise ValueError('Calibration must cover every configured seat')
        HeadSettings(**calibration['quality_settings'])
        references = {}
        for seat, value in calibration['seats'].items():
            validate_rotation(value['rotation'])
            if not value['references']:
                raise ValueError('Calibration is missing neutral reference evidence')
            references[seat] = [(r['frame_index'], r['model_angles_degrees']) for r in value['references']]
        rebuilt = build_calibration(config, source_hash, models, references, mirrored,
                                    HeadSettings(**calibration['quality_settings']))
        for seat, value in calibration['seats'].items():
            if not np.allclose(value['rotation'], rebuilt['seats'][seat]['rotation'], atol=1e-6):
                raise ValueError('Calibration neutral rotation does not match its reference evidence')
    except (KeyError, TypeError, AttributeError) as error:
        raise ValueError('Malformed head calibration') from error


def measure_seat_heads(image, config, models, settings, mirrored=False):
    """Measure only detected heads inside configured regions; never assume occupancy."""
    validate_image(image)
    canonical = np.ascontiguousarray(image[:, ::-1]) if mirrored else image
    h, w = image.shape[:2]
    observations = []
    for seat in SeatAssociator(config).seats:
        left, top, right, bottom = seat.roi
        x0, y0, x1, y1 = int(left*w), int(top*h), int(right*w), int(bottom*h)
        if min(x1-x0, y1-y0) < 2:
            continue
        crop = canonical[y0:y1, x0:x1]
        heads = models.detect(crop, settings.min_detection_score)
        heads = [head for head in heads if 0 <= head.bbox[0]+head.bbox[2]/2 < x1-x0
                 and 0 <= head.bbox[1]+head.bbox[3]/2 < y1-y0]
        for head in heads:
            x, y, width, height = head.bbox
            scores = {'head_detection_score': head.score, 'seat_id': seat.id,
                      'quality_status': 'experimental heuristics; no calibrated pose confidence'}
            reason = 'ambiguous' if len(heads) != 1 else head_quality(crop, head.bbox, head.score, settings)
            if reason is None:
                try:
                    angles = models.angles(crop, head.bbox)
                    # Validate output before it reaches JSON or temporal rules.
                    model_rotation(angles)
                except ValueError:
                    reason = 'invalid_head_pose_output'
                else:
                    scores['model_angles_degrees'] = np.asarray(angles).tolist()
            bbox = (x+x0, y+y0, width, height)
            if mirrored:
                bbox = (w-bbox[0]-width, bbox[1], width, height)
            observations.append(FaceObservation(bbox, 'unknown', {}, scores, reason, 'head_pose_fallback'))
    return observations


class HeadPipeline:
    def __init__(self, config, calibration, *, models=None, model_dir=None, mirrored=False):
        self.models = models if models is not None else HeadModels(**({'directory': model_dir} if model_dir else {}))
        try:
            if not isinstance(calibration, dict):
                raise ValueError('Malformed head calibration')
            validate_calibration(calibration, config, calibration.get('source_sha256'),
                                 self.models.metadata['model_sha256'], mirrored)
        except Exception:
            self.models.close()
            raise
        self.config, self.calibration, self.mirrored = config, calibration, mirrored
        self.settings = HeadSettings(**calibration['quality_settings'])
        self.metadata = {'method': 'experimental fixed-seat full-rotation head pose',
                         'estimation_source': 'head_pose_fallback', 'mirrored_input': mirrored,
                         'detector': self.models.metadata, 'head_settings': asdict(self.settings),
                         'required_input_sha256': calibration['source_sha256'],
                         'calibration': calibration, 'count_semantics': 'detected heads, not detected faces',
                         'direction_convention': 'subject-relative in calibrated neutral head axes; mixed/upward -> unknown'}

    def process(self, image):
        started = perf_counter()
        observations = measure_seat_heads(image, self.config, self.models, self.settings, self.mirrored)
        for index, observation in enumerate(observations):
            if observation.unavailable_reason is not None:
                continue
            neutral = self.calibration['seats'][observation.scores['seat_id']]['rotation']
            direction, scores, reason = relative_direction(model_rotation(observation.scores['model_angles_degrees']), neutral, self.settings)
            observation.scores.update(scores)
            # Observations are frozen; replace the record rather than mutating it.
            observations[index] = FaceObservation(observation.bbox, direction, {}, observation.scores, reason, 'head_pose_fallback')
        h, w = image.shape[:2]
        return ImageResult(w, h, observations, (perf_counter()-started)*1000,
                           {'input_color': 'BGR', 'head_regions': 'normalized unmirrored source; detector resize 640 square',
                            'pose_input': '1.2x head crop; 256 resize; center 224 RGB ImageNet normalization'})

    def close(self):
        self.models.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

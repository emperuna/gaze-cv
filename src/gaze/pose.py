"""Nominal six-point PnP comparison; uncalibrated angles are approximate.

Coordinates copied from Google's canonical model (Apache-2.0), fixed source:
https://raw.githubusercontent.com/google-ai-edge/mediapipe/a908d668c730da128dfa8d9f6bd25d519d006692/mediapipe/modules/face_geometry/data/canonical_face_model.obj
Canonical y/z axes are flipped into an image-aligned, forward-facing frame.
No individual face shape, focal length, or lens distortion is calibrated.
"""
from dataclasses import asdict, dataclass
import math
import cv2
import numpy as np

POINT_NAMES=("nose","chin","left_eye","right_eye","mouth_right","mouth_left")
OBJECT_POINTS=np.array([
    (0.0,1.126865,-7.475604),(0.0,9.403378,-4.264492),
    (4.445859,-2.663991,-3.173422),(-4.445859,-2.663991,-3.173422),
    (-2.456206,4.342621,-4.283884),(2.456206,4.342621,-4.283884),
],dtype=np.float64)

@dataclass(frozen=True)
class PoseThresholds:
    yaw: float=20.0
    pitch: float=20.0
    max_reprojection_ratio: float=.12
    def __post_init__(self):
        if any(not math.isfinite(value) or value<=0 for value in asdict(self).values()):
            raise ValueError("Pose thresholds must be finite and positive.")
        if self.yaw>=90 or self.pitch>=90 or self.max_reprojection_ratio>1:
            raise ValueError("Require angles below 90 degrees and reprojection ratio <= 1.")
    def to_dict(self):
        return asdict(self)

def nominal_camera_matrix(width,height):
    focal=float(max(width,height))
    return np.array([[focal,0,width/2],[0,focal,height/2],[0,0,1]],dtype=np.float64)

def estimate_direction(landmarks,width,height,thresholds=None,mirrored=False):
    """Return direction, angle/error scores, and unavailable reason.

    Reprojection error is divided by eye span. Missing, degenerate, behind-
    camera, upward, extreme, and mixed down/side observations remain unknown.
    """
    thresholds=thresholds or PoseThresholds()
    if any(name not in landmarks for name in POINT_NAMES):
        return "unknown",{},"missing_pose_landmarks"
    try:
        image_points=np.array([(float(landmarks[name][0])*width,float(landmarks[name][1])*height) for name in POINT_NAMES],dtype=np.float64)
    except (ValueError,TypeError,IndexError):
        return "unknown",{},"invalid_pose_landmarks"
    if width<2 or height<2 or not np.isfinite(image_points).all():
        return "unknown",{},"invalid_pose_landmarks"
    if mirrored:
        image_points[:,0]=width-image_points[:,0]
    eye_span=float(np.linalg.norm(image_points[2]-image_points[3]))
    if eye_span<max(2,width*.015):
        return "unknown",{},"pose_eye_span_too_small"
    camera=nominal_camera_matrix(width,height)
    distortion=np.zeros((4,1),dtype=np.float64)
    try:
        ok,rvec,tvec=cv2.solvePnP(OBJECT_POINTS,image_points,camera,distortion,flags=cv2.SOLVEPNP_EPNP)
        if not ok:
            return "unknown",{},"pose_solver_failed"
        ok,rvec,tvec=cv2.solvePnP(OBJECT_POINTS,image_points,camera,distortion,rvec,tvec,True,flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok or not np.isfinite(rvec).all() or not np.isfinite(tvec).all():
            return "unknown",{},"pose_solver_failed"
        rotation,_=cv2.Rodrigues(rvec)
        camera_points=(rotation@OBJECT_POINTS.T).T+tvec.reshape(1,3)
        if np.any(camera_points[:,2]<=0):
            return "unknown",{},"pose_behind_camera"
        projected,_=cv2.projectPoints(OBJECT_POINTS,rvec,tvec,camera,distortion)
        error=float(np.sqrt(np.mean(np.sum((projected.reshape(-1,2)-image_points)**2,axis=1))))
        angles=cv2.RQDecomp3x3(rotation)[0]
    except cv2.error:
        return "unknown",{},"pose_solver_failed"
    pitch,yaw,roll=float(angles[0]),-float(angles[1]),float(angles[2])
    scores={"yaw_degrees":yaw,"pitch_degrees":pitch,"roll_degrees":roll,
            "reprojection_rmse_pixels":error,"reprojection_eye_span_ratio":error/eye_span}
    if error/eye_span>thresholds.max_reprojection_ratio:
        return "unknown",scores,"pose_reprojection_error"
    if abs(yaw)>80 or abs(pitch)>80 or abs(roll)>60:
        return "unknown",scores,"pose_outside_supported_range"
    if pitch < -thresholds.pitch:
        return "unknown",scores,"upward_pose_outside_four_classes"
    side="left" if yaw>thresholds.yaw else "right" if yaw < -thresholds.yaw else None
    if pitch>thresholds.pitch:
        return ("unknown",scores,"mixed_down_and_sideways") if side else ("down",scores,None)
    return side or "forward",scores,None

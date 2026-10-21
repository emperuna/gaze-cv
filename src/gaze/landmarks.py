"""CPU MediaPipe Tasks adapter; face indices are frame-local, never identities."""
from dataclasses import dataclass
import hashlib
import math
import os
import numpy as np
from pathlib import Path

DEFAULT_MODEL = Path(__file__).resolve().parents[2] / "models" / "downloads" / "face_landmarker.task"
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
KEYPOINT_INDICES = {"left_eye": 263, "right_eye": 33, "nose": 1, "chin": 152, "mouth_right": 61, "mouth_left": 291}

@dataclass(frozen=True)
class LandmarkFace:
    bbox: tuple
    landmarks: dict

def tile_windows(width, height, tile_grid=1):
    """Full frame or square windows with 50% overlap; every edge is covered."""
    if not isinstance(tile_grid, int) or not 1 <= tile_grid <= 4:
        raise ValueError("tile_grid must be an integer from 1 to 4.")
    if tile_grid == 1:
        return [(0, 0, width, height)]
    side = max(2, math.ceil(max(width, height) / tile_grid))
    def starts(length):
        if length <= side:
            return [0]
        values = list(range(0, length-side+1, max(1, side//2)))
        if values[-1] != length-side:
            values.append(length-side)
        return values
    return [(x, y, min(side,width), min(side,height)) for y in starts(height) for x in starts(width)]


def remap_face(face, window, full_width, full_height):
    x, y, width, height = window
    bx, by, bw, bh = face.bbox
    bbox = ((x+bx*width)/full_width, (y+by*height)/full_height, bw*width/full_width, bh*height/full_height)
    landmarks = {name: ((x+point[0]*width)/full_width, (y+point[1]*height)/full_height) for name,point in face.landmarks.items()}
    return LandmarkFace(bbox, landmarks)


def merge_faces(faces, max_faces=10, iou_threshold=.3):
    """Suppress duplicate tile observations, without associating identities."""
    def intersection_over_union(a,b):
        ax,ay,aw,ah=a.bbox
        bx,by,bw,bh=b.bbox
        overlap=max(0,min(ax+aw,bx+bw)-max(ax,bx))*max(0,min(ay+ah,by+bh)-max(ay,by))
        union=aw*ah+bw*bh-overlap
        return overlap/union if union>0 else 0
    selected=[]
    for face in sorted(faces,key=lambda item:item.bbox[2]*item.bbox[3],reverse=True):
        if not any(intersection_over_union(face,other)>iou_threshold for other in selected):
            selected.append(face)
        if len(selected)>=max_faces:
            break
    return selected


class MediaPipeDetector:
    def __init__(self, model_path=None, max_faces=10, tile_grid=1):
        # Process-local defaults keep optional matplotlib caches in the project.
        # Never change OS/profile settings; explicit caller configuration wins.
        cache_root = Path(__file__).resolve().parents[2] / ".work"
        os.environ.setdefault("MPLCONFIGDIR", str(cache_root / "matplotlib"))
        os.environ.setdefault("XDG_CACHE_HOME", str(cache_root / "cache"))
        import mediapipe as mp
        self.model_path = Path(model_path) if model_path else DEFAULT_MODEL
        if not self.model_path.is_file():
            raise ValueError(f"Face model missing: {self.model_path}. Follow models/README.md to download it.")
        if not isinstance(max_faces, int) or max_faces < 1:
            raise ValueError("max_faces must be a positive integer.")
        tile_windows(2, 2, tile_grid)
        self.tile_grid, self.max_faces = tile_grid, max_faces
        self.mp = mp
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(self.model_path), delegate=mp.tasks.BaseOptions.Delegate.CPU),
            running_mode=mp.tasks.vision.RunningMode.IMAGE, num_faces=max_faces,
            min_face_detection_confidence=0.5, min_face_presence_confidence=0.5,
            output_face_blendshapes=False, output_facial_transformation_matrixes=False)
        self.task = mp.tasks.vision.FaceLandmarker.create_from_options(options)
        self.metadata = {
            "backend": "MediaPipe FaceLandmarker IMAGE CPU", "mediapipe_version": mp.__version__,
            "model_path": str(self.model_path), "model_sha256": hashlib.sha256(self.model_path.read_bytes()).hexdigest(),
            "model_url": MODEL_URL, "max_faces": max_faces, "detection_confidence_threshold": 0.5,
            "face_presence_threshold": 0.5, "landmark_indices": KEYPOINT_INDICES, "tile_grid": tile_grid,
            "tiling": "square max-dimension/grid, 50% overlap, edge aligned; bbox IoU > .3 suppression" if tile_grid > 1 else "full frame",
            "face_order": "frame-local detector order; no association or persistent identity"}
    def _detect_window(self, rgb):
        result = self.task.detect(self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=rgb))
        faces = []
        for mesh in result.face_landmarks:
            xs, ys = [point.x for point in mesh], [point.y for point in mesh]
            x0, y0 = max(0.0, min(xs)), max(0.0, min(ys))
            x1, y1 = min(1.0, max(xs)), min(1.0, max(ys))
            points = {name: (float(mesh[index].x), float(mesh[index].y)) for name, index in KEYPOINT_INDICES.items()}
            faces.append(LandmarkFace((x0, y0, max(0.0, x1-x0), max(0.0, y1-y0)), points))
        return faces
    def detect(self, rgb):
        height, width = rgb.shape[:2]
        faces = []
        for window in tile_windows(width, height, self.tile_grid):
            x,y,w,h = window
            crop = np.ascontiguousarray(rgb[y:y+h,x:x+w])
            faces.extend(remap_face(face,window,width,height) for face in self._detect_window(crop))
        return merge_faces(faces,self.max_faces) if self.tile_grid>1 else faces

    def close(self):
        self.task.close()

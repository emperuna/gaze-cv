# Face model and nominal pose geometry

The optional landmark-free head models are documented under
[experimental head orientation](../docs/evaluation/hidden-faces.md). The existing
MediaPipe asset and baseline remain the default.

The working CPU pipeline uses MediaPipe Tasks FaceLandmarker with its official versioned float16/1 bundle. The bundle combines face detection and landmark estimation. Facial expressions, blendshapes, transformation matrices, and recognition are not used.

## Acquire the model

Run from the repository root after creating the local Python environment:

```powershell
.\.venv\Scripts\python.exe scripts/download_model.py
```

The downloader uses the Python standard library, so model acquisition can also run before package installation. It verifies existing assets, bounds download size to 10 MiB, checks the exact SHA256 before replacing the destination, and keeps temporary download files in the destination directory. Network or integrity failures leave the original destination intact. No binary is committed.

- Source: [Google's official FaceLandmarker model bundle](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task).
- Asset: `face_landmarker/float16/1/face_landmarker.task`.
- Local placement: `models/downloads/face_landmarker.task` (Git ignored).
- SHA256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`.
- Acquisition: public download; no API key or account used.
- Upstream: [MediaPipe repository and Apache-2.0 license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE), [official Python guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/python), and [model details](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
- The Google-hosted model is retrieved for local inference; this repository does not redistribute it or claim a separate project license for upstream assets.

A custom local bundle can be selected with `--model PATH`. Runtime reports record the actual SHA256 and source path so a replaced asset is visible.

## Runtime choices and limits

`requirements.txt` pins the verified packages and transitive dependencies; `pyproject.toml` pins the build backend and three direct runtime packages. The measured environment is Windows, Python 3.12.10, NumPy 2.2.6, OpenCV contrib 4.11.0.86, and MediaPipe 0.10.32. Dependency metadata supports Python 3.10, but only the recorded machine/interpreter has been exercised locally. OpenCV contrib is the single OpenCV distribution installed; avoid adding a second conflicting OpenCV package.

The detector explicitly requests the CPU delegate and IMAGE mode. It detects up to ten faces by default; no temporal smoothing or persistent identity is implied. Detection and face-presence thresholds are 0.5. The raw model does not expose per-face landmark confidence through this adapter, and the geometry scores are not probabilities.

Full-frame detection is the image-evaluation default. Optional `tile_grid=2` uses square windows half the longest image dimension, 50% overlap, and edge alignment; normalized landmark coordinates map back to the original image. Bounding-box IoU suppression above 0.3 removes duplicate tile observations. This improves small-face coverage at additional processing cost and can still miss profiles, tiny faces, or occluded faces. Poster faces can be false positives; inspect real evidence rather than interpreting raw counts as guaranteed student detections.

Mirrored inputs must use `--mirrored`. The pipeline unmirrors RGB before landmark detection, preserving canonical left/right point correspondence, then maps boxes and landmarks back onto the original mirrored source for annotation. Classification still reports subject-relative directions.

The baseline's unitless eye/nose/chin ratios do not estimate angles. The down threshold was changed from 0.60 to 0.40 after inspecting Pointing04 validation predictions; yaw remains an experimental 0.18. This is validation development, not held-out accuracy. Mixed down/side poses remain unknown. The locked test set was not used to select thresholds.

## Nominal main-method comparison

`src/gaze/pose.py` fits six 2D landmarks to six generic 3D face vertices with OpenCV EPNP followed by iterative solvePnP. Those vertices come from the [official canonical face mesh at commit a908d668c730da128dfa8d9f6bd25d519d006692](https://github.com/google-ai-edge/mediapipe/blob/a908d668c730da128dfa8d9f6bd25d519d006692/mediapipe/modules/face_geometry/data/canonical_face_model.obj), under the upstream Apache-2.0 license. The six MediaPipe indices are nose 1, chin 152, subject-left eye 263, subject-right eye 33, subject-right mouth 61, and subject-left mouth 291. Canonical y/z signs are flipped to a forward-facing camera frame.

Camera focal length is assumed to equal the longest image dimension, principal point is the image center, and lens distortion is assumed zero. No camera or individual face calibration has been performed. Returned yaw, pitch, and roll are approximate geometric estimates, not calibrated ground truth. Fixed initial yaw/pitch thresholds are 20 degrees; normalized reprojection error above 0.12 of eye span, behind-camera fits, missing points, extreme poses, upward poses, and mixed down/side poses become unknown. Synthetic projection tests verify signs and solver behavior; real validation results establish the comparison's actual limitations. [OpenCV's pose documentation](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html) explains the projection model and solver assumptions.

For this session all temporary files, package caches, environments, model assets, and generated results are kept under the project on Disk F. Set `TEMP`, `TMP`, `PIP_CACHE_DIR`, `MPLCONFIGDIR`, and `XDG_CACHE_HOME` to the documented project `.work` directories before installing or running commands; do not change system settings or install packages globally.

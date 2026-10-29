# Experimental head orientation and instructor review

This extension adds a saved-video `--method head` mode. Gold-YOLO detects heads
inside manually configured seat head regions; 6DRepNet360 predicts rotation
without requiring facial landmarks. The learned method processes all detected
heads in this mode so camera-relative baseline labels cannot mix with calibrated
seat-relative directions. Baseline and approximate PnP remain the default choices
for existing commands. Live camera input remains optional. The website now has
a separate [direction-only Camera mode](../../frontend/README.md#live-camera)
using the automatic head or baseline pipeline. Calibrated seat-relative camera
processing is not implemented; the calibrated workflow described here still
uses saved video. Physical-camera and classroom checks remain unverified.

“Face unavailable” means the head is still sufficiently visible, for example in
a profile or rear view. It does not mean the head can be fully hidden. This
implementation has synthetic mechanics and posed-image integration evidence;
real rear-view/occlusion classroom accuracy remains unvalidated. Detector false
positives and missed heads are possible.

## Local setup

Follow the [README environment setup](../../README.md) first. On the current Mac,
use the existing project environment and keep caches inside the repository:

```sh
export TEMP="$PWD/.work/tmp" TMP="$PWD/.work/tmp" TMPDIR="$PWD/.work/tmp"
export PIP_CACHE_DIR="$PWD/.work/pip-cache" MPLCONFIGDIR="$PWD/.work/matplotlib"
export XDG_CACHE_HOME="$PWD/.work/cache" UV_CACHE_DIR="$PWD/.work/uv-cache"
uv pip install --python .venv/bin/python -r requirements-head-pose.txt
.venv/bin/python scripts/download_head_models.py
```

For the documented Windows venv, use
`.\.venv\Scripts\python.exe -m pip install -r requirements-head-pose.txt` and
`.\.venv\Scripts\python.exe scripts/download_head_models.py`, retaining the
README's process-local cache variables. No GPU or training stack is required.
Legacy processing does not require the optional ONNX runtime.

## Define head regions and select neutral references

Use the existing seat JSON schema: `schema_version: 1`, unique seat IDs and
nonoverlapping normalized `roi: [left, top, right, bottom]` rectangles in the
unmirrored source. Choose tight head regions, not whole desks. A region must
contain exactly one detected head to produce a usable observation. Zero heads
means missing; multiple heads mean ambiguous. Printed background heads may
cause ambiguity, so inspect the configured regions.

Visually identify reference frames where each student faces their normal desk
direction. Create a references JSON mapping each seat to its frame indices, for
example `{"seat-1": [30, 45], "seat-2": [90, 105]}`. These are illustrative
indices, not labels for the office proxy. Each configured seat needs at least
one verified reference. Multiple reference predictions must agree within 15°.
The command measures selected references; it does not decide they are forward.

```sh
.venv/bin/python scripts/calibrate_heads.py --input data/raw/my-session.mp4 --seats data/annotations/my-head-regions.json --references data/annotations/my-forward-frames.json --output outputs/runs/my-head-calibration.json
.venv/bin/python scripts/process_video.py --input data/raw/my-session.mp4 --output-dir outputs/runs/my-head-session --method head --seats data/annotations/my-head-regions.json --calibration outputs/runs/my-head-calibration.json --events
```

The `my-*` paths above must be supplied for an authorized video; no classroom
video has been acquired by this feature. Use a new output directory each run.
Add `--mirrored` to both commands only for already-mirrored source pixels.

Calibration retains neutral rotation matrices, reference indices and raw angles,
video hash, seat-region hash, model hashes, mirroring, rotation convention, and
quality settings. Changed sources, models, regions, or mirroring are rejected.
Reference matrices are reconstructed and checked on load. Recalibrate after
camera/layout changes; a camera-facing head is not automatically desk-forward.

## Quality and direction semantics

Initial settings are experimental, not classroom-tuned:

| Setting | Initial value |
| --- | --- |
| Minimum head detector score | 0.50 |
| Minimum head width and height in original pixels | 32 |
| Minimum grayscale Laplacian variance | 10 |
| Maximum clipped fraction of the detected head box | 0.15 |
| Side/down direction thresholds | 25° / 25° relative to neutral |
| Maximum supported absolute yaw/down angle | 100° / 70° |

Settings are retained in calibration and exported session metadata. Numeric
settings can be adjusted explicitly in calibration JSON for development runs;
do not tune on the locked test split. Tiny, blurry, clipped, ambiguous, missing,
invalid, upward-only, mixed-side/down, or unsupported observations remain unknown.
The detector score is not calibrated confidence in the pose estimate.

The ONNX graph returns yaw/pitch/roll. Reconstruction uses the graph's
`Rz(roll) Ry(yaw) Rx(pitch)` convention, conjugated by `diag(-1,1,1)` to map image
axes. Direction comes from the forward axis of `neutral.T @ observed`, preserving
rotation wrapping. A direct audit of the actual graph's intermediate matrix
confirmed the reconstruction on 20 model outputs (maximum error about 1.43e-7).

## Review flags and records

With `--events`, sustained/repeated left or right observations receive
`review_required: true`, `review_label: "For instructor review"`, a descriptive
movement reason, and estimation source. Downward events are still recorded with
`review_required: false`; ordinary writing does not itself trigger this sideways
review flag. Defaults remain two seconds sustained, three entries within ten
seconds, and 0.25-second minimum episode dwell.

The saved video shows flags only after the threshold crossing. Sustained flags
clear on direction changes or unknown data. Repeated notifications last at most
two source seconds and clear sooner on direction/source changes or missing data.
Unknowns, excessive time gaps, or estimator changes reset continuity. No pose
confidence, gaze target, misconduct score, or disciplinary decision is produced.

`observations.jsonl` now includes `review_flags`; observations/histories retain
`estimation_source`. History, event, and summary schema versions are 2. Old count
field names such as `face_count` remain for compatibility: summary
`observation_kind: "heads"` distinguishes head-mode counts. Counts and FPS are
not comparable to the old face detector without noting the method and workload.

## Assets and provenance

| Model | Source | Upstream terms |
| --- | --- | --- |
| Gold-YOLO-N head detector, 640×640 postprocessed ONNX | [Model and data notes](https://github.com/PINTO0309/PINTO_model_zoo/tree/main/421_Gold-YOLO-Head) | Directory provides GPL-3.0; do not represent it as MIT. |
| 6DRepNet360 full-rotation ONNX, 224×224 | [Original implementation and models](https://github.com/thohemp/6DRepNet360), [ONNX conversion](https://github.com/PINTO0309/PINTO_model_zoo/tree/main/423_6DRepNet360) | Upstream MIT notice. |

Assets are downloaded locally, not committed or redistributed. Adapters are
independently written. Acquisition checks selected model bytes before replacing
files; it does not execute upstream scripts or extract other archive members.
Head archive reads are bounded to 80 MiB and pose archive reads to 150 MiB.
The head archive contains many variants, but the selected model appears within
the first approximately 59 MB. Size/hash changes require a source review.

- Head file: `gold_yolo_n_head_post_0277_0.5071_1x3x640x640.onnx`
  (22,637,005 bytes), SHA256
  `37e79ad3cc1eba99feea6884867a29f549d5cbd589b67ceacc8509629505605e`.
- Pose file: `sixdrepnet360_1x3x224x224_full.onnx`
  (94,022,523 bytes), SHA256
  `422b69d17bf02e164bd1062f5e970f67f1688cadf7d700800fad5fa12a16fc82`.
- Measured optional runtime: ONNX Runtime 1.23.2, CPUExecutionProvider, two
  intra-operation threads; Mac arm64, Python 3.12.15. Windows execution of this
  new mode has not been performed.

## Evidence boundary

The local integration diagnostic repeats four permitted Pointing04 validation
stills for three seconds each, then includes one second of empty input: 130
frames at 10 FPS. It has abrupt cuts and is not physical movement ground truth.
Forward reference frames 0, 5, and 10 come from the first nominal-forward image.
The actual models produce forward, right, and down observations; the compressed
left-profile segment is missed at the default detector threshold. The empty
segment has no head observations. One rightward sustained record receives a
review flag; one downward sustained record remains unflagged. Outputs and input
provenance are ignored under `outputs/runs/`.

This verifies acquisition, CPU inference, calibration, video encoding, source
timestamps, histories, flags and JSON together. It does not establish real
occlusion performance, classroom event precision/recall, writing false-alert
rates, target accuracy, or representative multi-seat throughput. Those still
require authorized independently labeled classroom footage and held-out tests.

# Hidden-face orientation and review flags implementation plan

**Goal:** Add an opt-in, fixed-seat head-pose mode and descriptive instructor-review flags.
**Spec:** [Approved design](hidden-face-review-design.md).
**Architecture:** CPU ONNX head detection confirms presence inside configured regions;
6DRepNet360 estimates head rotation. A source/model-bound calibration maps neutral
seat orientation to forward. Legacy image methods remain the default. Video
histories and event exports retain observation provenance.
**Execution:** Native implementation in this session, as authorized by “looks good,
continue.” Work on `feat/hidden-face-review`; preserve prior documentation edits.
Local commits were subsequently authorized by the user after implementation.
Pushes, external claims, and board updates remain unauthorized.

## Constraints and review focus

- Hidden face means enough head pixels remain visible; no inference through full occlusion.
- Unknown, missing, ambiguous, and changed-estimator observations break continuity.
- Empty regions must never be presumed occupied; detection confidence is not pose confidence.
- Camera-relative labels must not mix with seat-relative head-pose histories.
- Calibration must reject changed video, models, mirrored setting, or seat regions.
- Left/right signs and rotation wrapping need independent numeric tests.
- No new mandatory dependencies for existing baseline users; local model binaries stay ignored.
- Review flags describe sideways movement only; downward writing remains unflagged.

## Task 1: Verified model acquisition and head inference

Files: `src/gaze/head_models.py`, `src/gaze/head_pose.py`,
`scripts/download_head_models.py`, `requirements-head-pose.txt`, `tests/test_head_pose.py`.

- [x] Write failing tests for quality rejection, rotation conventions, head detector
  output decoding, model I/O preprocessing, and bounded/checksummed acquisition.
- [x] Confirm RED with project unittest runner.
- [x] Implement independently written CPU adapters, pinned assets and archive
  member extraction (no upstream executable code); preserve model provenance.
- [x] Verify GREEN, then actual acquired model inference on permitted images and empty input.

## Task 2: Calibrated fixed-seat pipeline

Files: `src/gaze/head_session.py`, `scripts/calibrate_heads.py`,
`scripts/process_video.py`, `src/gaze/pipeline.py`, `src/gaze/history.py`,
`tests/test_head_session.py`.

Interfaces: `HeadPipeline.process(BGR)->ImageResult`, metadata/context-manager
contract matching the existing pipeline. Per-seat fixed head region, verified
reference frame indices, source/model/configuration hashes, neutral rotation matrix.

- [x] Write failing tests for missing/stale calibration, empty/crowded ROIs,
  unmirroring, calibration reference consistency, provenance and continuity.
- [x] Implement calibration command and opt-in `--method head` video path.
- [x] Verify GREEN and validate independent history exports.

## Task 3: Instructor-review events and overlays

Files: `src/gaze/events.py`, `src/gaze/review.py`, `src/gaze/video.py`,
`tests/test_review.py`, `tests/test_video.py`, `tests/test_events.py`.

- [x] Write failing tests for sideways event flags, unflagged downward events,
  no pre-threshold overlays, sustained clearing, finite repeated notification,
  gap resets, and saved per-frame review state.
- [x] Implement event metadata, explicit source tracking and video annotations.
- [x] Run focused checks then full application suite.

## Task 4: Integration evidence and documentation

Files: `README.md`, `models/README.md`, `scripts/README.md`,
`docs/evaluation/hidden-faces.md`; generated results under ignored `outputs/runs/`.

- [x] Run actual image/head detector and pose inference; inspect sample outputs.
- [x] Exercise saved video, calibration, histories, events, output decoding and hashes.
- [x] Record honest model/occlusion limitations and reproducible commands; keep
  development thresholds separate from final accuracy claims.
- [x] Run application and automation suites, consistency/local links and whitespace.
- [x] Request an independent whole-change review; resolve material findings with regression tests.

## Execution record

- Baseline: 96 application tests pass on Mac Python 3.12.15 before implementation.
- Plan uses the already approved fixed-region approach; no further scope approval needed.
- Live GitHub task/Project state unavailable; this user-requested extension has no
  existing stable task ID. Do not claim or close existing acceptance tasks.
- Task 1 verified: adapters and bounded acquisition tests passed; actual models
  loaded and inferred on CPU, hashes verified. The available 640-square detector
  variant was selected after the original 480-wide variant exceeded the bounded
  archive probe. Selected detector bytes are unchanged upstream assets.
- Task 2 verified: calibration command, source/model/region/mirror binding,
  empty/ambiguous handling, provenance and continuity tests passed.
- Task 3 verified: source-time overlay/export checks passed, with 130 decoded
  output frames and a review flag only on frames 80-89 in the diagnostic.
- Task 4 verified: 123 application tests, 16 automation tests, dependency
  compatibility, syntax, document links and whitespace checks passed. An
  independent reviewer identified three material defects; regression tests
  reproduced all three before fixes. The corrected angle convention was also
  compared directly with the actual ONNX intermediate matrix on 20 outputs.
- No implementation ruling expands the approved scope. Rear/occlusion classroom
  accuracy remains unvalidated; no numerical accuracy or full-scope gate is claimed.

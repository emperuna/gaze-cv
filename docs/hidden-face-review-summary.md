# Added head orientation mode and instructor review flags

User-authorized extension on branch `feat/hidden-face-review`, 27 October 2026.
Local commits were subsequently authorized by the user; no push was requested.
The earlier change making live camera input optional is recorded separately
from the head-orientation implementation.

## What was added

- An experimental saved-video `--method head` mode. A head detector confirms
  visible heads inside fixed seat head regions; a separate full-rotation model
  estimates orientation without requiring facial landmarks.
- A calibration command that uses manually verified forward reference frames
  per seat. Source, model, seat-region, mirroring, reference consistency, and
  rotation convention checks prevent accidental reuse of incompatible calibration.
- Explicit unknown handling for missing, ambiguous, small, blurry, clipped,
  invalid, upward, mixed, and unsupported observations. Missing heads are never
  inferred merely because a seat region exists.
- **For instructor review** flags for sustained or repeated left/right head
  movements. Flags appear in the saved video after threshold crossing and in
  JSON exports. Downward writing is not automatically flagged.
- Estimation provenance in observations, histories, and events. Estimator
  changes, unknown observations, and excessive gaps break temporal continuity.
- CPU-only optional ONNX dependencies and bounded, checksum-verified local
  acquisition of selected model files. Legacy image/video methods remain available.

## How to run

Follow [the setup and calibration guide](evaluation/hidden-faces.md). Install
`requirements-head-pose.txt`, run `scripts/download_head_models.py`, prepare
head-region and forward-reference JSON for an authorized saved video, run
`scripts/calibrate_heads.py`, then use `scripts/process_video.py --method head
--seats ... --calibration ... --events`.

The current Mac's local example is
`outputs/runs/head-review-final/annotated.avi`; observations, seat histories,
events, and settings are saved alongside it. The input repeats permitted posed
validation images, with provenance in
`outputs/runs/head-review-diagnostic-input/provenance.json`.

## Verification and limits

- Application checks: 123 tests passed after implementation and review fixes.
- Automation checks: all 16 tests passed. Repository consistency, edited/new
  document links, Python syntax, whitespace, and installed dependency compatibility
  checks passed. No downloaded models are needed by the unit-test suites.
- Actual CPU head detection and pose inference ran on permitted posed images
  and a 130-frame saved-video diagnostic. The diagnostic includes a final empty
  segment. Its compressed left-profile segment was missed at the default score
  threshold; forward, right and down were observed. A right sustained event was
  flagged, a down sustained event was recorded without a flag, and empty frames
  had no head observations.
- The model's actual intermediate rotation matrix was compared against our
  angle reconstruction on 20 outputs: maximum absolute error about 1.43e-7.
- Independent review found coupled-angle conversion, calibration-reference
  integrity, and invalid per-head output handling defects. All three received
  failing regression tests and fixes before the passing full-suite run.

This is an implemented experimental mode, not validated classroom coverage.
Fully obscured heads cannot provide direction evidence. Rear views, masks,
heavy occlusion, real writing false alerts, and representative multi-seat
throughput need separate labeled footage and evaluation. Head orientation does
not establish gaze toward another paper or misconduct. Final held-out test
data was not used. No GitHub task or checkpoint has been marked complete.

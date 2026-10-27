# Head orientation fallback and instructor review flags

Status: fixed-region approach approved by the user on 27 October 2026;
implementation and checks are summarized in [the implementation summary](hidden-face-review-summary.md).
No classroom accuracy is claimed. The input-local setup on
the current Mac is authorized for this session. Existing documentation edits
making live camera input optional are separate and must be preserved.

## Requested behavior

Estimate forward, left, right, or down when facial landmarks are unavailable
but enough of the head remains visible. Display sustained or repeated sideways
movement as **For instructor review** and retain the reason in session exports.
A direction estimate cannot establish eye gaze, another paper being viewed,
intent, or misconduct. Fully obscured heads remain unknown.

Saved CFR video is the initial integration target; live camera input remains
optional. No website, identity recognition, training framework, or cloud service
is introduced.

## Approaches and selected choice

1. **Fixed seat head regions (recommended first version):** constrain head
   detection and pose inference to configured head regions. Fits the existing
   fixed-seat setup and limits background detections. Requires manual regions
   and a neutral orientation per seat; movement outside a region becomes unknown.
2. **Automatic head detection:** locate heads across the frame, then associate
   accepted observations with fixed seats. Supports more movement, but requires
   broader detection evaluation, duplicate suppression, and crowded-seat checks.

Both approaches need an actual head-presence check. A configured rectangle is
not evidence of occupancy. Body orientation must not substitute for head pose.
The user approved the fixed-region first version. Automatic whole-frame head
detection remains outside this implementation.

## Model feasibility

Candidate: the full-rotation 6DRepNet360 model, trained on 300W-LP plus Panoptic,
which estimates orientation from head crops rather than explicit facial
landmarks. The official repository provides weights and MIT-licensed code:

- https://github.com/thohemp/6DRepNet360
- https://github.com/thohemp/6DRepNet360/blob/master/LICENSE.MD

An ONNX conversion and upstream-license notice are available at:

- https://github.com/PINTO0309/PINTO_model_zoo/tree/main/423_6DRepNet360

These sources establish a model candidate, not successful performance on
partially occluded classroom heads. Before integration, inspect the exact
graph, preprocessing, output convention, asset terms, download size, and local
CPU compatibility. Select and verify a compatible head detector separately.
Prefer ONNX CPU inference over introducing a training stack. Record model
sources and SHA-256 hashes; use bounded downloads and no upstream shell scripts.
Do not claim reproducible acquisition until the actual assets have been checked.

## Observation flow

1. Preserve existing facial-landmark processing for ordinary sessions. In an
   explicitly enabled seat-relative head-pose session, use the learned rotation
   method for both visible-face and turned-away heads. Existing camera-relative
   baseline labels must not enter the same temporal stream as calibrated
   seat-relative labels. Facial observations can remain supplemental diagnostics.
2. When the fallback is explicitly enabled, locate visible heads using the
   chosen detection approach. Never infer a head merely from a seat rectangle.
3. Estimate only uniquely associated detected heads. Preserve ambiguous seats
   and unsupported mixed poses as unknown; do not erase those reasons just
   because another model returns a number.
4. Predict a rotation from the current head crop. Retain raw model output,
   detection score, accepted/rejected status, and rejection reason.
5. Compare rotation with an explicit per-seat neutral orientation. Use rotation
   matrices rather than naive Euler subtraction around the +/-180-degree seam.
   Verify subject-relative signs, mirroring, and camera-to-seat conventions.
6. Emit one observation per head/seat, with source `head_pose_fallback` in the
   new mode and `facial_landmarks` in legacy sessions. Never count the same head
   twice. Reject absent,
   ambiguous, tiny, clipped, invalid, or otherwise unsupported inputs as unknown.
7. Keep provenance in histories and events. An estimator change resets event
   continuity unless cross-method consistency is explicitly validated. Unknown
   time never contributes to duration or repetition.

Model angles are not probabilities. A pose network that always returns an angle
does not provide calibrated confidence or prove that the crop contains a head.
Initial acceptance gates must be recorded as experimental and checked against
independent examples. Missing calibration must produce an understandable error
or unknown observation, never silently mean facing the camera equals forward.

Neutral references must come from manually selected, visibly verified forward
frames for each occupied seat. Retain reference frame indices and rotation
matrices with source hash, seat-region configuration hash, and model hash.
Reject references from different sources/configurations/models; moving the
camera or changing the layout requires new calibration. Reject inconsistent
neutral reference samples rather than averaging incompatible orientations.

Before implementation acceptance, define and retain numeric minimum head size,
detector-score, clipping, blur, and supported-angle gates in the session config.
Select gates on development examples and report false acceptance on empty and
occluded crops. These gates are quality heuristics, not calibrated pose confidence.
The initial supported envelope is a visible head outline with facial landmarks
unavailable (for example a profile/rear view); substantial object occlusion is
unvalidated and must not be advertised as supported without separate evidence.

## Review behavior

Use existing source-time duration and repetition settings. Defaults remain
experimental: two seconds sustained; three separate episodes within ten
seconds; minimum episode dwell 0.25 seconds. Gaps and unknown observations reset
accumulation as they do today.

- Sustained/repeated left or right events carry `review_required: true`,
  `review_label: For instructor review`, and a descriptive movement reason.
- Downward movement may still be recorded, but does not receive the sideways
  review flag by default; ordinary writing must remain distinguishable.
- Brief sideways observations alone do not receive the event review flag.
- Flagged events retain seat ID, source times, direction, settings, estimation
  source, and model provenance. No risk or misconduct score is generated.
- Annotated saved video shows the flag when the event becomes observable,
  alongside seat and direction. Do not draw a flag before its threshold crossing.
  Sustained flags clear when the observation changes or becomes unknown.
  Repetition notifications use a documented finite display interval.
- Exported events remain independently readable and marked as algorithm outputs
  requiring instructor review, with real event accuracy unvalidated.

## Code boundaries

Keep model adapters, rotation conversion, fusion, review labeling, and rendering
under `src/gaze/`; scripts only coordinate acquisition/configuration/processing.
Extend observation/history metadata additively with explicit schema versioning
where required. Keep the baseline and PnP validation paths unchanged by default.
Do not activate fallback inference in the locked image test set.

## Verification and acceptance

Model-free tests must cover absent-head rejection, ambiguous seats, duplicate
fusion, calibration requirements, angle wrapping, mirroring, mixed poses,
provenance, method changes, time gaps, sideways review thresholds, downward
writing, annotation timing, and independent export contents.

Run the full application suite and repository consistency checks with project
cache/TEMP settings. Separately run actual acquired models on permitted visible,
profile/rear, partly occluded, and empty-head-region examples. Preserve errors;
record hardware, settings, latency, coverage, and source hashes. Masking a face
synthetically is a diagnostic, not real hidden-face validation. The office proxy
is an integration check, not classroom accuracy evidence.

Implementation acceptance requires a working end-to-end fallback invocation and
visible/exported review flags, not just an adapter tested using fake outputs.
Classroom accuracy and event precision/recall remain separate acceptance work
until suitable independently labeled footage is available. No GitHub claim,
commit, push, or checkpoint completion is authorized by this design.

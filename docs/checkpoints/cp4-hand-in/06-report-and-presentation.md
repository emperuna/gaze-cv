# 6. Technical report and presentation draft

**Ocular / GAZE — CP4 draft**  
Prepared: 12 November 2026  
Base source revision: `d60038d3f256f7d2bcc60e6c769018f8c47c2d3c`

**Status:** Written introduction, data, method and experiments sections plus 12 Markdown draft slides; team review remains pending.

## Introduction

Instructors supervising examinations may need to revisit when visible head movements occurred and how long they remained observable. Brief turns and looking down during ordinary writing can have similar visual patterns, so a movement alone cannot establish misconduct. Ocular, previously presented as GAZE, is a local computer vision review aid that organizes these observations while preserving the instructor’s role in interpretation. [S01] [S02]

The project aims to detect visible faces or heads, classify forward/left/right/down orientations, associate observations with fixed seat positions, maintain source-time histories, and export sustained or repeated movement records. Its main demonstration uses saved video from one fixed camera. The optional camera mode provides direction observations without seat histories or recordings. The work excludes identity recognition, eye-gaze or intent estimation and automatic disciplinary decisions. [S01] [S02]

The current checkpoint focuses on integration of processing, faculty setup and review. The interface now connects fixed-seat setup, timestamped outputs, movement records, downloads and saved-session reopening. Technical checks support the integration claims, while real classroom effectiveness remains a separate question. The new CP4 held-out and laptop measurements are reported in the experiments section and item 3. [S03] [S04] [S12]

## Data

The initial direction dataset uses the author-hosted Pointing04 database with its recorded attribution condition. The repository data card documents 15 subjects and nominal pose targets in 384 by 288 color images. The selected manifest has 240 validation images from subjects 1 to 10 and 120 held-out test images from subjects 11 to 15, with 60 and 30 examples per direction respectively. Twenty committed examples come from validation. Source and subject separation prevent reuse of a person or recording across these splits. No local model training is performed. [S07]

CP3 used a separate fixed stress set from three Pexels recordings by cottonbro studio, Nicola Barts and RDNE Stock project. The set contains 15 original frames and 48 deterministic blur, dimming, occlusion and size variants, for 63 images. Its forward/left/right/down counts are 16/15/17/15. Labels were assigned before inference, with a human cross-check still pending. The small number of people and correlated transformations limit generalization and statistical independence. [S08]

The public-domain FourPeople office-meeting clip supports multi-person integration and historical speed diagnostics. It is a proxy, not classroom event ground truth. The 24-frame integration smoke clip and synthetic event fixtures are explicitly separate from evaluation sets. Neither should enter held-out accuracy denominators. For CP4, the existing Pointing04 held-out selection was frozen and scored with nominal source labels. Independently checked representative video is still required for seat/event correctness claims. [S03] [S04] [S10] [S11]

## Method

The baseline uses MediaPipe facial landmarks with shared preprocessing and eye–nose–chin geometry to classify direction. The main automatic method combines Gold-YOLO head detection with 6DRepNet360 rotation estimates using CPU ONNX Runtime. It can estimate sufficiently visible profile or rear views without facial landmarks, but cannot recover information from full occlusion. Quality checks retain unusable, mixed or unsupported observations as unknown. The approximate six-point PnP comparison remains available through the documented Python paths. [S02] [S14] [S18]

Automatic head labels use camera-facing neutral axes with subject-relative left/right. The web seat-review path attaches those observations to fixed image positions; assigning a seat does not calibrate the head direction to a desk. A separate configured head-processing mode uses manually selected forward references and source/model/seat-bound neutral calibration. These direction bases must remain distinct in interpretation and evaluation. [S04] [S12] [S18]

Each configured region accepts one reliable observation. Missing or multiple competing detections produce missing or ambiguous states. Histories use source timestamps, retain explicit unknown entries and reset continuity across gaps. Sustained/repetition rules use duration, repetition count/window, minimum episode dwell and maximum gap settings. JSON records retain the source hash, method and settings so the instructor can trace each output. [S13]

The Next.js interface calls local Python commands and displays annotated outputs. Saved-review playback synchronizes source time with boxes, seat labels, histories and descriptive movement records. Selecting an event seeks to its source timestamp; completed sessions reopen without rerunning inference. Shared processor reservations and cancellation bound overlapping work. The camera extension keeps frames in memory and releases capture/processing resources on Stop and lifecycle failure. [S02] [S04] [S17]

## Experiments

The recorded CP3 experiment froze model/settings and input fingerprints before scoring identical prepared pixels with both methods. Accuracy counts unknowns and missed detections as incorrect; macro F1 averages the four direction classes; coverage reports the fraction with usable direction predictions. The baseline achieved 29/63 correct, macro F1 0.4875 and 52.38 percent coverage. The head method achieved 13/63 correct, macro F1 0.3071 and 38.10 percent coverage. The results do not show aggregate improvement. [S05] [S06] [S16]

CP4 integration experiments recorded real-model smoke processing, event-gap fixtures, malformed inputs, cancellation, downloads, synchronized seeking and session reopening. Their purpose is to verify the implemented workflow, not estimate real-world event precision or held-out direction accuracy. The CP4 frozen held-out run scored baseline 99/120 (82.50%, macro F1 0.8519) and head 92/120 (76.67%, macro F1 0.7807), with 94.17% coverage for both. Three integrated four-seat runs on the ASUS Ryzen 5 7520U demo laptop yielded median 3.44 baseline and 0.95 head FPS. The 10 FPS target was not met. [S03] [S04] [S10]

The new src/evaluate.py entry point records a frozen protocol before scoring the unchanged 120-image test selection. Both methods use the same labeled inputs with all unknowns retained in the denominator. Full-session video timing uses a 120-frame, four-seat, 1280 by 720 office proxy and includes preflight through final exports, excluding model initialization and browser/network time. Balanced battery conditions and the working-session background load are recorded. CP3 used different stress inputs and hardware, so the cross-checkpoint differences are descriptive rather than improvement estimates. No thresholds or direction algorithms were changed from the CP4 test errors. [Full results and protocol](03-evaluation-and-speed.md). [S03]

## Presentation draft: 12 slides

These are slide contents and speaker cues in Markdown. The companion [12-slide editable PowerPoint](ocular-cp4-draft-presentation.pptx) contains the same core findings. Both are drafts for team review.

### Slide 1 — Ocular: Checkpoint 4

- A classroom head-movement review aid using one fixed camera.
- Ocular is the interface brand; the repository and Python package retain GAZE.
- Checkpoint focus: integrated processing, review workflow and evidence.
- Prepared 12 November 2026; measurements and remaining acceptance are identified.

Speaker cue: Explain that movement observations support instructor review and cannot establish misconduct. [S01] [S03]

### Slide 2 — Problem, users and scope

- Instructors need to locate and inspect visible movements in saved examination footage.
- Outputs describe forward, left, right, down and unknown states.
- Fixed seat regions identify positions, not student identities.
- Ordinary writing and brief turns require contextual human interpretation.

Speaker cue: State the exclusions: identity recognition, eye-gaze estimation, intent inference and disciplinary decisions. [S01] [S13]

### Slide 3 — Data and evaluation separation

- Pointing04: 240 validation images, subjects 1–10; 120 locked test images, subjects 11–15.
- CP3 stress set: 15 original frames plus 48 deterministic variants, from three Pexels recordings.
- CP3 labels are agent-assigned, with human cross-check pending.
- Smoke clips and synthetic event fixtures test integration; they are separate from accuracy evaluation.

Speaker cue: Explain source permissions, subject separation and the limited independence of transformed samples. The CP3 set is already inspected and is not a fresh held-out set. [S07] [S08] [S10]

### Slide 4 — Integrated application

- Next.js provides Image, Saved video and optional Camera modes.
- Local Python commands use reusable modules under `src/gaze`.
- Saved-video review connects seat setup, observations, histories and movement records.
- Completed sessions retain source/settings provenance and reopen without inference.

Speaker cue: Trace one input through processing, annotation, records and review. Camera mode is direction-only. [S02] [S04] [S17]

### Slide 5 — Baseline and main method

- Baseline: MediaPipe facial landmarks and geometric direction rules.
- Main automatic method: Gold-YOLO detection plus 6DRepNet360 rotation estimates.
- Automatic labels use a camera-facing direction basis.
- Assigning a seat does not calibrate direction to a desk; calibrated CLI processing is separate.

Speaker cue: Describe missing, blurry and unsupported observations as explicit unknowns. No model reliably recovers fully occluded information. [S14] [S18]

### Slide 6 — Interface demonstration sequence

1. Upload an authorized saved video and choose the processing method.
2. Inspect suggested seats; add, rename, redraw or remove regions.
3. Confirm seats and process; show Stop and the active movement rules.
4. Review boxes, labels, histories and movement records against source time.
5. Seek to an event, download records and reopen the saved session.

Speaker cue: Use an actual application demonstration. A historical annotated image is not a screenshot of the current interface. [S04] [S12] [S17]

### Slide 7 — Recorded CP3 results

| Method | Correct | Accuracy | Macro F1 | Coverage |
| --- | --- | --- | --- | --- |
| Baseline | 29/63 | 46.03% | 0.4875 | 52.38% |
| Main head method | 13/63 | 20.63% | 0.3071 | 38.10% |

- Historical Apple M5 MacBook Air CPU image timing: 7.66 ms/image baseline; 83.48 ms/image main.
- These image rates are not integrated saved-video FPS.
- The main method did not improve aggregate stress-set accuracy.

Speaker cue: Explain that unknown and missed cases remain in the denominator. State the timing exclusions and dataset limits. [S05] [S06]

### Slide 8 — New CP4 evaluation and laptop speed

- Frozen 120-image test: baseline 82.50%, F1 0.8519; head 76.67%, F1 0.7807.
- Both methods had 94.17% coverage; unknowns remained in denominators.
- `src/evaluate.py` produced the report with unchanged source/model settings.
- Four-seat full-session median: 3.44 baseline FPS, 0.95 head FPS on the actual demo laptop.
- The 10 FPS target was not met. Use saved-video processing and review.

Speaker cue: CP3 and CP4 use different datasets and hardware. Explain the arithmetic differences without presenting them as algorithm improvement. See item 3 for exact scopes and evidence. [S03] [S15] [S16]

### Slide 9 — Technical test coverage

- 16 fresh cases recorded on 12 November 2026, including more than three hard/edge cases.
- The older 20-case October record remains separate historical evidence.
- Real-model smoke processing, seat edits, source-time seeking and exports.
- Edge cases: missing observations, multiple detections, invalid regions and corrupt media.
- Timing boundaries, cancellation, access rejection, reopening and empty suggestions.

Speaker cue: Passing mechanics tests do not establish real classroom direction accuracy or event precision/recall. Item 5 contains the full case table. [S04] [S10]

### Slide 10 — Observed failures

- CP3 main method: 39 unavailable predictions — 21 no detections, 13 blur gates, five unsupported pose ranges.
- CP4 main-method down recall was 12/30 (40%); 14 down examples were predicted forward.
- Some masked classroom crops were usable but incorrectly predicted forward.
- Baseline failed strong profiles more often; main method failed more overall stress samples.
- FourPeople suggestions included five regions for four participants, requiring correction.

Speaker cue: Explain observations from outputs without treating condition labels as controlled causal proof. [S06] [S09] [S04]

### Slide 11 — Operational limits

- Fixed camera, fixed seats and sufficiently visible heads.
- Saved review requires compatible constant-cadence MP4/WebM.
- Bounds: 64 MB upload, five minutes, 18,000 frames, 1920 × 1080 pixels and 20 seats.
- No direct CCTV streaming, identity recognition or reliable intent inference.
- Seat consistency, real event accuracy and writing false-alert rates remain unvalidated.

Speaker cue: Distinguish positions, observations and descriptive movement records from allegations. [S01] [S03] [S04] [S13]

### Slide 12 — Remaining work before submission

- Review the measured held-out scores, laptop speed and qualified CP3 comparison.
- Run representative three-seat footage and independent member setup checks.
- Review the effort-weighted completion calculation and the written report/slides.
- Verify the 198-second captioned backup recording plays independently.
- Review the final hand-in revision before any authorized commit/tag/publication.

Speaker cue: The package includes measured results and an actual captioned browser demonstration. The tag identifies the hand-in snapshot; team review and course-portal submission remain separate actions. [S03]

## Items still required before a complete submission

Deliverable 3 now contains actual held-out metrics and demo-laptop measurements. Four-seat browser mechanics have been exercised on a permitted office proxy. Independent classroom validation, team review of effort weights/completion and another member’s reproduction remain unverified. [S03]

Deliverable 7 is the actual [captioned browser recording](ocular-cp4-demo.webm), approximately 198 seconds before final encoding checks. The final package index records publication/tag status. A tag does not certify 80% accepted effort or instructor acceptance. [S03]

## Evidence provenance

Historical measurements retain their original dates and hardware. New CP4 measurements are dated 12 November 2026 and linked to machine-readable evidence and frozen implementation hashes. The base revision predates the CP4 changes; the hand-in tag identifies the final package. Academic acceptance and live Project status are not claimed.

[S01]: ../../../PRD.md "Product requirements and supported behavior"
[S02]: ../../../ARCHITECTURE.md "Current application architecture and processing paths"
[S03]: ../../../docs/checkpoints/cp4-checklist.md "Phase 4 requirements and outstanding evidence"
[S04]: ../../../docs/superpowers/specs/2026-10-29-saved-review-verification.md "Saved review verification and faculty setup refinement"
[S05]: ../../../docs/checkpoints/cp3-hand-in/README.md "CP3 hand in index and hardware description"
[S06]: ../../../outputs/evidence/cp3-core/comparison.json "CP3 complete metrics and measurement provenance"
[S07]: ../../../docs/evaluation/data-card.md "Pointing04 source permissions and split data card"
[S08]: ../../../docs/checkpoints/cp3-hand-in/data-card.md "CP3 source permissions labels and stress set data card"
[S09]: ../../../outputs/evidence/cp3-core/README.md "CP3 failure groups and selected output gallery"
[S10]: ../../../docs/checkpoints/cp4-test-cases.md "Recorded CP4 test cases"
[S11]: ../../../docs/evaluation/video.md "Historical video throughput and movement rule diagnostics"
[S12]: ../../../docs/checkpoints/cp4-before-after.md "Saved video review before and after"
[S13]: ../../../docs/evaluation/seats.md "Fixed seat and observation gap semantics"
[S14]: ../../../scripts/run.py "Automatic image and video processing entry point"
[S15]: ../../../scripts/evaluate.py "Current validation only evaluation entry point"
[S16]: ../../../src/gaze/evaluation.py "Metric definitions and missed observation accounting"
[S17]: ../../../frontend/README.md "Current website setup and usage"
[S18]: ../../../docs/evaluation/hidden-faces.md "Experimental calibrated head model details"


Current machine-readable evidence: [held-out results](../../../outputs/evidence/cp4/held-out-results.json), [frozen protocol](../../../outputs/evidence/cp4/frozen-protocol.json), [baseline speed](../../../outputs/evidence/cp4/benchmark-baseline.json), [head speed](../../../outputs/evidence/cp4/benchmark-head.json), [browser checks](../../../outputs/evidence/cp4/browser-verification.json).

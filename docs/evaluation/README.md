# Evaluation plan

Status: CP2 planning only, aligned with Milestone 2 - Checkpoint Guide.pdf (pages 1-3). No acquired dataset, frozen manifests, executable evaluator, or measured results are supplied here. See [the roadmap](../../ROADMAP.md#cp2-baseline-and-initial-progress) and [task backlog](../../TASK.md).

## Data and splits

Complete the one-page data card described in [data/README.md](../../data/README.md). Store traceable split manifests under data/annotations/ when prepared. Record dataset version, file/sample identifiers, subject and recording/source groups, labels, split membership, and the reproducible selection procedure. Keep each subject and recording/source within one split and audit intersections. Choose proportions from available data and coverage; the guide's 70/15/15 example is not mandatory.

Use validation data for threshold tuning, CP2 baseline measurements, and the CP3 comparison. Reserve the locked test split for final evaluation after settings freeze. A teacher-selected test-image demonstration is permitted at class review; do not tune from its output. Add a separate training split only if training is introduced. Fit learned preprocessing on training data only, and keep augmentation training-only. Do not present unlabeled smoke-test images as direction ground truth.

## Preprocessing and prediction

Implement only justified preparation steps as reusable functions under src/gaze. Record input size, colour order, resizing/aspect-ratio handling, coordinate mapping, and any normalisation or filtering. Prediction and evaluation must use the same functions; training must too if introduced. Commit permitted before/after strips for each applied step under outputs/evidence/ and explain what changed. The guide lists possible techniques, not a requirement to implement all of them.

The CP2 image prototype must accept an input image and output location in one documented command, save readable face/direction annotations, and show unavailable observations explicitly. Document the actual command only after it exists; --help and screenshots do not establish processing behavior.

## CP2 validation measurements

Record the exact commit, environment, input manifest, label mapping, preprocessing, baseline rules/thresholds, and invocation. Report validation accuracy and macro-F1, plus the confusion matrix, per-class sample counts, eligible observations, usable predictions, missing/failed observations, and coverage. Define each metric denominator and treatment of missing observations before scoring; report conditional scores transparently rather than hiding failed detections. Include representative errors and enough output to reproduce the reported numbers.

Image scoring depends on the image prototype and prepared validation data, not on video integration. Both methods must use identical validation inputs and failure accounting for the CP3 comparison. Final held-out results belong to the later evaluation after settings freeze. The 80% accuracy goal is a final project target, not an achieved result or a minimum score in the CP2 guide.

## GAZE video and FPS evidence

Under cp2-multi-face, use an authorized saved clip with at least three simultaneously visible faces. Record clip selection and permitted use, source timestamps, missed observations, laptop/CPU, OS, dependency versions, resolution, face count, number of frames, elapsed processing time, and which stages timing includes. State warm-up and repeated-run procedures before measuring; save the command and results. Report FPS separately from image accuracy. The 10 FPS goal is a final project target. Seat identity and temporal-event accuracy are not established by this demonstration.

Detailed seat consistency and event matching rules will be specified when their labeled footage and implementation exist. Keep unsupported metrics explicitly unvalidated.

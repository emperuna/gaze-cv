# CP3 in-class explanation guide

The teacher supplies three unfamiliar images or clips. Put them in a media folder and run the automatic command in the submission index. Use a fresh output directory; open `run.json` and the annotated output for each input. A nonzero failure count must be explained, not hidden. Calibrated seat mode needs manual regions/references and is a separate demonstration.

## What each member should be able to explain

1. Follow one input through decoding, model-specific preprocessing, detection, direction estimation, quality/unknown handling and output. Open the corresponding functions in `src/gaze/`, not only command-line wrappers.
2. Contrast baseline geometry with learned head pose: the baseline needs reliable eye/nose/chin landmarks, while the main method predicts a head rotation from a detected crop. A detected head does not guarantee a reliable direction.
3. Explain RGB conversion, tensor layout, normalization, crop expansion and why changing them without validation can invalidate a pretrained model's output.
4. Explain subject-relative left/right, camera-relative forward and why desk-forward requires neutral calibration. Mirrored inputs must be unmirrored for inference and boxes mapped back for display.
5. Explain the reconstructed rotation's forward axis, 25° thresholds, mixed/upward rejection and why these are not calibrated gaze measurements.
6. Read a confusion-matrix row as a reference class and a column as a prediction. Unknowns are failures in accuracy; coverage is separately reported. Conditional accuracy cannot replace full-denominator accuracy.
7. Explain why reused validation data, adjacent frames, synthetic variants and unreviewed ordinal labels limit the strength of the result.

## A recorded failure to rehearse

The original downward portraits are visually labeled down, but the head model estimates roughly 20–22° downward tilt. The fixed decision threshold is 25°, so the program emits forward. This can reflect label-boundary uncertainty, pose-estimation error or an unsuitable threshold; the available labels do not distinguish these conclusively. Show the raw angles and decision code. Do not lower the threshold using this test result. Obtain reviewed development labels first, then measure a proposed change on a new held-out set.

For a missed detection, show that no crop reaches the pose model. For a blur rejection, show that a head can be detected while the quality gate leaves direction unknown. Do not claim pose inference ran successfully merely because the detector produced a box.

## Honest result and scope

The learned method handles the six strong unmodified side profiles better in this small set, but its overall accuracy is below the baseline. Both statements must be shown together. Classification on prepared crops does not validate full classroom localization or review-event accuracy. Head orientation does not establish eye gaze or misconduct.

Each member must rehearse their own contribution and answer a mechanics question. This document prepares that exercise; it does not establish anyone's readiness or replace the live class check.

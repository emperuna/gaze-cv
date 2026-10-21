# Fixed seats and source-time histories

`src/gaze/seats.py` assigns independent detections to configured image positions; `src/gaze/history.py` records directions at those positions over source time. Seat IDs are positions, not personal identities. There is no face recognition, cross-session identification, or recovery of a person's identity after they change seats.

## Configuration and assignment

The configuration has `schema_version: 1` and a nonempty `seats` list. Each seat has a unique `id` and normalized `roi: [left, top, right, bottom]` relative to the unmirrored source image. Values must be finite and within zero to one, rectangles must have positive area, and positive-area overlaps are rejected. Touching borders are allowed. Left/top borders are included, right/bottom borders are excluded except at the outer image edge. A shared border belongs to the rectangle beginning there.

An observation's bounding-box center is converted from original-image pixels to normalized coordinates. Exactly one detection in an ROI assigns that observation to the seat. No detections produces a missing seat. Two or more detections in one ROI produce an ambiguous seat and leave every competing detection unassigned; neither list order nor a confidence tie-break silently chooses a person. Outside-region, outside-image, and invalid-box detections remain explicitly unassigned. The association output preserves frame-local detection indices for review, and indices may change between frames.

The coarse [FourPeople seat configuration](../../data/annotations/fourpeople-seats.json) was defined from visual inspection of the [source review sheet](../../outputs/evidence/video-source-review.jpg), independently of model outputs. It includes four fixed head regions and visible-seat lists at source frames 0, 120, 240, 360, 480, and 599. Each of these six inspected frames has four real foreground participants. The source also contains printed faces on posters, so high background poster areas are deliberately excluded from head ROIs. These references are sparse manual visibility annotations; they are not exhaustive bounding boxes, direction labels, or temporal-event labels. Authoritative source provenance remains in [the video notes](video.md).

## History semantics

`HistoryTracker(seat_ids, max_gap_seconds=.25)` receives the association and source timestamp for each processed frame. It appends one entry per configured seat, including unknown entries when a seat is missing or ambiguous, or its direction is unusable. Each entry records source seconds, direction, validity, reason, frame-local detection index where available, continuity segment ID, and the span of the currently observed same-direction segment.

A segment continues only across adjacent valid observations of the same direction within the configured source-time gap. Missing, ambiguous, invalid, changed-direction, and larger time-gap observations end continuity. Reappearance starts a new segment, even if its direction equals the earlier one. Duration is the last observed source timestamp minus the first observed timestamp in that segment; it never includes unknown time or extends through an unobserved next frame. Equal, decreasing, negative, or nonfinite timestamps are rejected before history is changed. The maximum-gap setting is an explicit experimental continuity parameter, not a calibrated movement alert threshold.

History JSON preserves every entry and the gap setting. It describes observations and continuity spans, with no claim that any duration constitutes misconduct or a validated movement event. A vanished face cannot accumulate a sustained movement, and ambiguity cannot silently transfer one person's history to another observation. Physically changing seats remains an operating limitation: position histories stay with seats rather than following people.

## Verification and limits

Run the model-free checks with:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_seats.py -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p test_history.py -v
```

Fourteen checks cover detector-order changes, crowded regions, border ownership, invalid/overlapping configurations, unassigned detections, JSON serialization, direction changes, disappearance/reappearance, unknown and ambiguous observations, timestamp order, and maximum source-time gaps. Synthetic observation tests establish deterministic mechanics, not real-world accuracy. Actual video association results must be reviewed against independent visible-seat references before claiming measured seat coverage or consistency. Sparse office footage cannot establish representative classroom tracking, person identity continuity, or event accuracy.

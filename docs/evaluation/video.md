# Saved-video baseline evidence

The CP2 video path reads saved constant-frame-rate (CFR) video, annotates independent face observations, and writes source-time JSONL plus a throughput summary. By default it does not assign seats or accumulate movement events. Optional fixed-region seat histories and movement-event exports are available below; no mode identifies people or infers misconduct.

## Permitted source and scope

The [Xiph test-media page](https://media.xiph.org/video/derf/) explicitly lists **FourPeople** as public domain. The [lossy WebM download](https://media.xiph.org/video/derf/webm/FourPeople_1280x720_60.webm) is about 8.6 MB. Source and permission were inspected on 22 October 2026. Keep the downloaded clip under ignored `data/raw/video/`; this repository supplies a pinned acquisition command instead of committing it.

- Acquired SHA-256: `1e4a5df7e67ae985370321cc2c91b8595f7e3433ad8ee1e84da7a26ff5254deb`.
- Decoded resolution/rate: 1280 x 720, 60 frames/second. Xiph describes 600 frames; OpenCV decodes 601 frames from this exact WebM. Report the actual decoded count without silently dropping a frame.
- Scene: four seated adults in an office meeting, one fixed camera, real continuous footage. It is a useful multi-person proxy; it is not classroom examination footage.
- Source frames 0, 120, 240, 360, 480, and 599 were visually reviewed. Four real foreground participants are visible in each; background advertising posters also contain small printed faces. See the [source review sheet](../../outputs/evidence/video-source-review.jpg).
- The fixed expected-face count of four is a manually inspected reference, not exhaustive per-frame bounding-box ground truth. Count deficits are diagnostic only: extra detections can hide misses, and counts alone do not establish matched recall. No head-direction ground truth is supplied for this clip.
- This footage establishes neither classroom generalization nor seat identity, temporal-event accuracy, or direction accuracy. Those require separate representative labeled material.

## Reproduction and timing procedure

After following the root README environment/model setup, run from the repository root in PowerShell:

```powershell
.\.venv\Scripts\python.exe scripts/prepare_video.py
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/video-tiled-run-1 --expected-faces 4 --tile-grid 2 --warmup-frames 5 --run-label fourpeople-run-1 --evidence-frame outputs/evidence/video-baseline.jpg
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/video-tiled-run-2 --expected-faces 4 --tile-grid 2 --warmup-frames 5 --run-label fourpeople-run-2
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/video-tiled-run-3 --expected-faces 4 --tile-grid 2 --warmup-frames 5 --run-label fourpeople-run-3
```

Use a new output directory for each run; the command refuses to overwrite results. If the evidence image already exists, omit that option or choose a new evidence path. Use the generic overlapping detector tile grid of two shown above, with all other settings at their documented defaults. This detects smaller faces at additional inference cost; duplicate boxes are merged by the detector. Run the complete clip three times with identical settings, excluding the first five processed frames of each run from throughput. Record all three results, not just the best. CPU use by other programs and warm caches can affect timing.

Each run saves `annotated.avi` (MJPG, original dimensions and source rate), `observations.jsonl`, and `summary.json`. The summary records dependency/model versions and hash, direction thresholds, source dimensions/FPS, face-count histogram, unknown observations, count deficits, hardware, timing scope, and processed-frame counts. Frame indices and timestamps begin at zero; timestamp equals `frame_index / source_fps` and never wall-clock processing time. For this source the last decoded frame has timestamp 10.0 seconds; the nominal 601-frame sample duration is 601/60 seconds.

End-to-end FPS measures the sum of per-frame decode, preprocessing, detector inference, baseline classification, annotation, video encoding, and buffered JSON writes after warmup. It excludes model initialization, warmup frames, final stream flush, input hashing, and summary writing. Inference-only FPS is separately labeled. The code supports CFR input only; transcode variable-rate sources to a documented CFR copy before use. No camera or external service is used during processing.

The final target of 10 FPS refers to the agreed laptop. A desktop proxy result does not establish laptop performance. Image validation accuracy and macro-F1 are reported separately in the evaluation report.

## Verification

`tests/test_video.py` generates geometric MJPG footage for timestamp order, processing-delay independence, warmup/limit behavior, unknown observations, count-deficit accounting, output decoding, overwrite refusal, and missing/undecodable input checks. These fake-detector tests establish video mechanics; they do not establish face detection or direction quality. Actual detector evidence and measured results are recorded below after the real runs.

## Optional integrated seat and movement review

The following command uses manually prepared fixed head regions from the same source. It saves `seat_history.json` and `events.json`, annotates region IDs on the video, and adds per-frame associations to `observations.jsonl`. Event maximum gap must not exceed the history maximum gap; inconsistent settings are rejected. Missing, ambiguous, and unusable observations become unknown; histories and event durations do not bridge them. These IDs identify positions, never people.

```powershell
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/video-seated-events --tile-grid 2 --expected-faces 4 --seats data/annotations/fourpeople-seats.json --events --min-duration 2 --repetition-count 3 --repetition-window 10 --repeat-min-duration .25 --max-observation-gap-seconds .25 --max-event-gap .25 --run-label fourpeople-seated-events
```

The example seat configuration includes its source checksum and refuses reuse on different input without an intentional configuration update. History and event files record source timestamps; event records include all movement settings, seat configuration, input hash and method metadata. `--method pose` selects the separate geometric pose method; the default remains the baseline. Fixed ROIs require manual adjustment for a different camera or layout. The six source reference frames do not establish exhaustive seat consistency, direction, or movement-event accuracy. Recorded events remain algorithm outputs requiring human review; their real-world precision/recall and false alerts during writing are unvalidated.

## Measured proxy results

Measured on Windows 10 build 19045, Python 3.12.10, AMD Ryzen 5 5600X desktop (6 cores, 12 logical CPUs), MediaPipe 0.10.32, OpenCV-contrib 4.11.0.86, NumPy 2.2.6, CPU delegate. The face model SHA-256 is `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. All three baseline runs used the same source/model, tile grid 2, max faces 10, max width 1280, yaw threshold .18, down threshold .40, and unmirrored input. Development activity was not controlled as an isolated benchmark.

| Run | Frames measured after warmup | Processing seconds | End-to-end FPS | Inference-only FPS |
| --- | --- | --- | --- | --- |
| 1 | 596 | 53.307 | 11.18 | 12.76 |
| 2 | 596 | 54.427 | 10.95 | 12.43 |
| 3 | 596 | 57.260 | 10.41 | 11.80 |

Median end-to-end throughput: **10.95 FPS on this desktop**, including the stated stages. This does not establish the laptop target. Every run decoded all 601 frames, with source timestamps 0.000 to 10.000 seconds, even though wall-clock processing took much longer.

All three runs produced the same histogram: 1 detected face in 1 frame, 2 faces in 53 frames, 3 faces in 180 frames, and 4 faces in 367 frames. At least three faces were detected together in 547/601 frames. Across each run, there were 2,115 detected face observations, including 44 unknown-direction observations, and 289 deficits against the fixed reference count of four (2,404 frame-person opportunities). These count deficits are not matched recall and do not account for possible compensating extras.

The [actual first-frame annotation](../../outputs/evidence/video-baseline.jpg) shows four real foreground faces, with no printed poster faces selected. The [six-frame detection review](../../outputs/evidence/video-detection-review.jpg) visually matches all four foreground faces at frames 0, 120, 240, 360 and 480. Frame 599 matches two foreground faces and misses two; no extras were observed in these six frames. This is 22 matches and 2 misses among 24 visible foreground examples on the selected frames only. It is a sparse audit, not an exhaustive detection evaluation or direction-accuracy result. Face numbering is frame-local and changes between frames.

An initial untiled full-frame run detected no faces in this clip. Generic overlapping tiling resolves the small-face scale limitation sufficiently for the demonstration, at additional inference cost. The failed diagnostic is retained locally in `outputs/runs/video-run-1/`; it is not used as successful performance evidence.

The [machine-readable benchmark record](../../outputs/evidence/video-benchmark.json) contains all three summaries, exact settings and limitations. Measurements currently refer to the uncommitted development working tree; rerun the accepted implementation commit for final submission provenance.

## Initial integrated diagnostic before repeated-entry dwell

The full 601-frame fixed-seat baseline run completed, producing four histories with 601 source-time entries each (2,404 total): seat-1 had 35 unknown observations, seat-2 had 44, seat-3 had 74, and seat-4 had 180. The 333 unknown entries reconcile to 289 missing-face count deficits plus 44 detected observations with unknown direction. Every history starts at 0.000 and ends at 10.000 source seconds. The [integrated first-frame annotation](../../outputs/evidence/video-seated-events.jpg) shows the four configured positions; the [integrated result record](../../outputs/evidence/video-seated-events.json) includes per-seat counts, gap examples, settings and event outputs.

The run emitted 12 repeated-movement records and no sustained-movement records. Some repeated records span only fractions of a second: baseline label jitter can repeatedly enter a direction and produce unwanted records. These are algorithm outputs, **not verified physical movement events**. Event precision/recall, false alerts during writing, and calibrated temporal smoothing remain unvalidated. At that diagnostic stage, the sustained-duration threshold did not impose a minimum dwell on repeated entries; the correction below adds one. The complete integrated run measured 11.03 FPS on the same desktop under the stated timing scope; it is separate from the three-run CP2 baseline benchmark.

A final ten-frame CLI check also verified that current independent history/event exports carry input hash, method metadata, seat configuration and run label. Generated-video integration tests verify missing observations break both history continuity and event accumulation. This does not replace a consented classroom recording, exhaustive temporal labels, or member reproduction and defense.

## Final repeated-entry dwell and gap correction

The current monitor requires each direction episode to be continuously observed for `--repeat-min-duration .25` seconds before it counts toward repetition. Unknown observations and excessive source-time gaps clear the candidate. The history and event gap defaults are both .25 seconds; an event gap larger than the history gap is rejected so an event cannot bridge a discontinuity that already resets the history.

A second complete 601-frame inference run with the new .25-second repeated-entry dwell emitted **one** repeated-movement record (seat-2, left, source time .767 to 4.017 seconds) and no sustained records, compared with 12 records in the preserved no-dwell diagnostic. Face observations and unknown counts were unchanged. This run measured 10.81 FPS on the same desktop. Fewer records demonstrate the configured filter behavior; without temporal ground truth they do not establish event accuracy or verify that the remaining record describes a physical movement.

The complete second run used event gap .5 and history gap .25 before the final consistency guard was added. Every saved source-time observation was then replayed through the final consistent .25/.25 gap settings, yielding the identical event record. A separate ten-frame invocation of the current CLI verified the final settings and independent exports. The [dwell and final-gap evidence](../../outputs/evidence/video-seated-events-dwell.json) records the full inference output and deterministic replay separately rather than claiming the full inference run used settings it did not use. The raw local replay is `outputs/runs/video-seated-events-dwell/events-final-gap-replay.json`.

Nine video tests now cover timing and output mechanics, real seat/history/event integration with a missing observation, source-bound seat configuration, and rejection of inconsistent gap limits. Event mechanics also have their own focused tests. Classroom generalization, movement-event precision/recall, writing false-alert rates, laptop performance, and member reproduction remain separate unvalidated requirements.

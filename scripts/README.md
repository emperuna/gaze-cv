# Command entry points

Run from the repository root using the project interpreter after [README setup](../README.md). Reusable behavior belongs under src/gaze. All commands have --help; help output alone is not execution evidence.

| Command | Behavior |
| --- | --- |
| download_model.py | Retrieve the versioned CPU FaceLandmarker asset with bounded size and a fixed SHA256. |
| prepare_data.py | Acquire the pinned Pointing04 archive, safely extract original JPEGs, and regenerate subject-separated manifests and the small permitted subset. --offline verifies a local archive. |
| make_contact_sheet.py | Render a source-labeled validation contact sheet with attribution; never overwrite the manifest or source samples. |
| spike.py | Process five permitted validation images and save annotated results plus metadata. |
| predict.py | One image to annotated output and JSON; baseline or approximate pose method. |
| evaluate.py | Score validation images only, with missing observations, metric denominators, manifest/model/code provenance, and a JSON report. Existing reports require --overwrite; input paths remain protected. |
| prepare_video.py | Retrieve and verify the public-domain FourPeople proxy clip. |
| process_video.py | Annotate saved CFR video, preserve source timestamps, and export observations/FPS; optional fixed seats, histories, and movement rules. |
| download_head_models.py | Acquire only the selected, SHA256-verified CPU head-detector and full-rotation pose ONNX files from bounded upstream archive streams. |
| calibrate_heads.py | Build source/model/seat-bound neutral rotations from manually selected forward reference frames for `process_video.py --method head`. |

The head mode requires optional dependencies in `requirements-head-pose.txt`.
See [the head-mode guide](../docs/evaluation/hidden-faces.md) before calibration;
empty regions are not evidence of a head, and real classroom occlusion accuracy
has not been established.

Use a new video output directory for each run. Keep full data, model binaries, generated runs, and caches in their ignored local F: paths during this session. Do not use the locked test split for tuning. See [video evidence](../docs/evaluation/video.md) for exact timing scope and [checkpoint report](../docs/checkpoints/cp2-progress.md) for actual results and incomplete verification.

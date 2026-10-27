# GAZE

GAZE is a local computer vision prototype for reviewing visible head movements. It processes images and saved video, labels head direction, and can associate observations with fixed seat regions. Head movement does not establish cheating; outputs support instructor review.

## Current state

Working CPU prototype merged into `main` through [PR #44](https://github.com/emperuna/gaze-cv/pull/44), with data acquisition, an image baseline, an approximate head-pose comparison, annotated video, fixed-seat association, histories, and source-time movement rules. The technical CP2 hand-in files are linked below; instructor acceptance and personal class checks remain unverified. The held-out test split remains locked. The current machine is a desktop; laptop performance and another human member's reproduction remain unverified.

- [Product requirements](PRD.md), [project architecture](ARCHITECTURE.md), [roadmap](ROADMAP.md), and [task backlog](TASK.md).
- [Contributor setup](CONTRIBUTING.md) and [agent instructions](AGENTS.md).
- [Data card](docs/evaluation/data-card.md), [evaluation procedure](docs/evaluation/README.md), [video evidence](docs/evaluation/video.md), and [seat/history scope](docs/evaluation/seats.md).
- [Checkpoint evidence](docs/checkpoints/README.md) and [CP2 implementation report](docs/checkpoints/cp2-progress.md).
- [GitHub kanban](https://github.com/users/emperuna/projects/3/views/2) and [PR automation](docs/automation.md).

## CP2 hand-in

Start with the [seven-item submission index](docs/checkpoints/cp2-hand-in/README.md), [two-page progress report](docs/checkpoints/cp2-hand-in/progress-report.pdf), and [one-page data card](docs/checkpoints/cp2-hand-in/data-card.pdf). Tag **cp2-50** identifies the hand-in snapshot; the remaining human/laptop and class checks are listed in the report.

## Windows setup on F:

Run from this repository on F:. The following settings apply only to this PowerShell process and child programs; they do not change Windows configuration. They keep local environments, temporary downloads, and library caches in this project. No administrator shell, global Python install, driver change, or camera permission is required.

```powershell
$taskRoot = (Get-Location).Path
New-Item -ItemType Directory -Force .work/tmp, .work/pip-cache, .work/matplotlib, .work/cache | Out-Null
$env:TEMP = Join-Path $taskRoot '.work/tmp'
$env:TMP = $env:TEMP
$env:PIP_CACHE_DIR = Join-Path $taskRoot '.work/pip-cache'
$env:MPLCONFIGDIR = Join-Path $taskRoot '.work/matplotlib'
$env:XDG_CACHE_HOME = Join-Path $taskRoot '.work/cache'
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/download_model.py
```

The verified environment uses Python 3.12.10, with dependency versions pinned in requirements.txt and build requirements pinned in pyproject.toml. Python 3.10-3.12 compatibility is intended; versions beyond the verified runtime are not established by this run. Model download is bounded, checksum verified, and local; see [model provenance](models/README.md). No training or GPU is required.

## Run an image

Twenty permitted Pointing04 validation examples are included. For a concrete input path, list them with `Get-ChildItem data/samples -Recurse -Filter *.jpg`, then run:

```powershell
.\.venv\Scripts\python.exe scripts/predict.py --input data/samples/pointing04/person01145+0-15.jpg --output outputs/runs/example.png
```

Use an actual filename from the list if it differs. The command saves an annotated image and adjacent JSON with settings and observations. Labels are subject-relative forward/left/right/down; unknown observations are explicit. Use `--mirrored` only for input pixels that are already mirrored. Use `--method pose` for the approximate six-point PnP comparison. Pose angles use nominal camera intrinsics and a generic face model; they are not calibrated measurements.

## Reproduce data and image validation

```powershell
.\.venv\Scripts\python.exe scripts/prepare_data.py
.\.venv\Scripts\python.exe scripts/make_contact_sheet.py --output outputs/runs/contact-sheet.jpg
.\.venv\Scripts\python.exe scripts/spike.py --output-dir outputs/runs/spike
.\.venv\Scripts\python.exe scripts/evaluate.py --manifest data/annotations/pointing04.json --output outputs/runs/baseline-validation.json
.\.venv\Scripts\python.exe scripts/evaluate.py --manifest data/annotations/pointing04.json --method pose --output outputs/runs/pose-validation.json
```

Acquisition uses the author's permitted source and pins its archive hash. Full data remains in ignored data/raw/. The manifest contains 240 validation images from ten subjects and 120 locked test images from five different subjects. Ground truth comes from source pose annotations, not model predictions. The evaluator intentionally accepts only validation scoring. It counts missing/unknown predictions against overall accuracy and reports coverage separately.

The initial geometric baseline scored 69.17% validation accuracy. A down-direction ratio selected using this validation set raised it to 86.67%, macro-F1 0.8798, coverage 97.5%. The approximate pose method scored 67.50%, macro-F1 0.6734. These are development measurements on a deliberately limited posed subset; the baseline benefited from validation tuning, and none establishes the final held-out 80% target. See the checkpoint report for full limitations and exact artifacts.

## Process saved video

```powershell
.\.venv\Scripts\python.exe scripts/prepare_video.py
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/video-example --tile-grid 2 --expected-faces 4
```

This public-domain office-meeting clip is a multi-person proxy, not classroom validation. Generic overlapping detector tiles are needed for its smaller faces. Each run writes annotated video, timestamped observations, settings, hardware, and throughput. Choose a new output directory for each run. Source time comes from frame index and source FPS; the current input contract is constant-frame-rate saved video.

For configured fixed-seat histories and optional movement records, use:

```powershell
.\.venv\Scripts\python.exe scripts/process_video.py --input data/raw/video/FourPeople_1280x720_60.webm --output-dir outputs/runs/seat-example --tile-grid 2 --expected-faces 4 --seats data/annotations/fourpeople-seats.json --events
```

Seat IDs identify regions, not people. Missing and ambiguous observations become gaps; they cannot accumulate continuous duration. Movement records describe sustained/repeated head movements only. Real event accuracy, ordinary-writing false alerts, and classroom generalization remain unvalidated. Live-camera input is an optional extension, not required for project completion. Integrated event review remains required work; saved video is the required input workflow.

## Experimental head orientation without facial landmarks

Saved video also supports an opt-in `--method head` mode with a separate head
detector, full-rotation pose model, fixed head regions, and per-seat neutral
calibration. It can estimate direction when facial landmarks are unavailable
but enough of the head remains visible. It cannot see through full occlusion.
See [setup, calibration, usage, and limitations](docs/evaluation/hidden-faces.md).

With `--events`, sustained/repeated sideways events now carry **For instructor
review** in the annotated video and JSON. Downward events remain recorded
without that sideways flag. These are movement observations, not gaze or
misconduct determinations.

## Verification

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe .github/automation.py check
.\.venv\Scripts\python.exe -m unittest discover -s .github/tests -v
git diff --check
```

Application unit tests use synthetic/local temporary inputs without downloading models or datasets. Actual model/data runs are separate recorded integration evidence. GitHub CI passed for PR #44 with pinned dependency installation and both application and repository tests. Current Issue decisions and remaining work are recorded in the [post-merge acceptance audit](docs/checkpoints/task-reconciliation.md). Passing checks does not imply classroom performance or academic completion.

## Organization and collaboration

Reusable processing lives in src/gaze/: data preparation, preprocessing, landmarks, baseline, pose, visualization, pipeline, evaluation, video, seats, histories, and movement rules. Scripts coordinate those modules. [scripts/README.md](scripts/README.md) lists the commands. Configs remain small; current seat configuration is documented alongside its source annotations.

Full datasets, model binaries, generated runs, project-local caches, and verification environments are ignored. Small permitted samples, manifests, source attribution, reviewed screenshots, and selected measurement summaries provide reproducible evidence. No code license has been selected; data/model permissions are recorded separately.

Any collaborator may claim unassigned work; original focus areas are advisory. Each member must still contribute and explain their own code. Keep atomic Conventional Commits, review PRs, and preserve linear history. The implementation is not automatically committed, pushed, merged, or tagged by running the application.

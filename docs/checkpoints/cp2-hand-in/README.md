# CP2 team hand-in

**GAZE - CSST 106 - 22 October 2026**

Team: Marc Justin Alberto, Jose III Aquino, Jeremy Garin. Deadline supplied for this hand-in: Thursday 22 October, 11:30 PM.

Submit the repository link together with tag **cp2-50**. That tag pins the complete hand-in snapshot; it does not certify instructor acceptance or the remaining member/laptop checks.

## Seven required items

| Requirement | Included evidence |
| --- | --- |
| 1. Rebuildable development environment | [Pinned requirements](../../../requirements.txt), [README setup and image command](../../../README.md#windows-setup-on-f), [actual fresh-clone verification](../../../outputs/evidence/spike-fresh-clone/README.md). |
| 2. Acquired, organized and prepared data | [One-page data card PDF](data-card.pdf), [detailed source/permission and selection record](../../evaluation/data-card.md), [fixed split manifest](../../../data/annotations/pointing04.json), [twenty permitted examples](../../../data/annotations/samples.json), and [acquisition script](../../../scripts/prepare_data.py). Training: not applicable (0 images); validation: 240; reserved test: 120. |
| 3. Initial preprocessing in source code | [Shared preprocessing](../../../src/gaze/preprocessing.py), used by prediction and evaluation, with [before/after examples](../../../outputs/evidence/preprocessing.png). |
| 4. Baseline and one validation result | [Geometric baseline](../../../src/gaze/baseline.py), [saved validation result](../../../outputs/evidence/cp2-validation.json): 208/240 correct, 86.67% accuracy, macro-F1 0.8798. Validation-selected settings; six unknowns count against accuracy. |
| 5. Working one-command prototype | [Image prediction command](../../../scripts/predict.py), demonstrated by the [saved annotated image](../../../outputs/evidence/image-baseline.png). See the executable command below. |
| 6. At least six screenshots or sample outputs | Six linked outputs below: five fresh-clone image results and a multi-person video frame. The separate gallery screenshot and preprocessing strip are additional evidence. |
| 7. One- to two-page progress report | [Two-page report PDF](progress-report.pdf): completed/pending work, timeline, 50.0% estimate, blockers and revised plan. [Task-level effort worksheet](effort-worksheet.csv) makes 69/138 points auditable. |

The geometric classifier is not trained, and the landmark detector is pretrained. The data card therefore explicitly records training as not applicable rather than allocating an unused training split. The original split-by-subject validation/test protocol is retained; final test results remain reserved.

## How to run from the hand-in tag (Windows CPU)


Use a new folder on F: and Python 3.12 (the verified patch version is 3.12.10). Git and network access are needed for installation and the documented model download. The twenty demonstration images are already in the repository.

    git clone --branch cp2-50 https://github.com/emperuna/gaze-cv.git F:\GAZE-CP2-HandIn
    Set-Location F:\GAZE-CP2-HandIn
    New-Item -ItemType Directory -Force .work/tmp, .work/pip-cache, .work/matplotlib, .work/cache | Out-Null
    $taskRoot = (Get-Location).Path
    $env:TEMP = Join-Path $taskRoot '.work/tmp'
    $env:TMP = $env:TEMP
    $env:PIP_CACHE_DIR = Join-Path $taskRoot '.work/pip-cache'
    $env:MPLCONFIGDIR = Join-Path $taskRoot '.work/matplotlib'
    $env:XDG_CACHE_HOME = Join-Path $taskRoot '.work/cache'
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
    .\.venv\Scripts\python.exe scripts/download_model.py

**One input-to-output command:**

    .\.venv\Scripts\python.exe scripts/predict.py --input data/samples/pointing04/person01145+0-15.jpg --output outputs/runs/cp2-image.png

This saves an annotated image and an adjacent JSON observation/settings record. No notebook, training run, camera, or GPU is required. Run the documented data acquisition before reproducing the full 240-image validation set. Fresh-clone execution proves reproducibility on the recorded desktop; another member's intended-laptop check remains #41.

## Six sample outputs

1. [Image 1: forward example](../../../outputs/evidence/spike-fresh-clone/01-person01145+0-15.png).
2. [Image 2: left example](../../../outputs/evidence/spike-fresh-clone/02-person01142+0-60.png).
3. [Image 3: sideways example, incorrect forward prediction retained](../../../outputs/evidence/spike-fresh-clone/03-person01148+0+30.png).
4. [Image 4: downward example, unknown prediction retained](../../../outputs/evidence/spike-fresh-clone/04-person01106-60-15.png).
5. [Image 5: second subject, forward example](../../../outputs/evidence/spike-fresh-clone/05-person02145+0-15.png).
6. [Saved-video frame with four annotated faces](../../../outputs/evidence/video-baseline.jpg).

Additional views: [fresh-clone output screenshot](../../../outputs/evidence/spike-fresh-clone/five-image-spike-screenshot.png), [preprocessing examples](../../../outputs/evidence/preprocessing.png), and [twenty-image labeled contact sheet](../../../outputs/evidence/contact-sheet.jpg).

Pointing04 photographs are used with source attribution. FourPeople is Xiph's public-domain office proxy. The video labels are predictions, and the clip does not establish classroom/event accuracy.

Machine-readable inventory: [package manifest](package-manifest.json), including page counts, dataset counts, six output hashes and the measured validation result.

## Progress accounting and remaining checks

The unchanged retrospective effort model totals 138 points over the complete roadmap. Eighteen acceptance-verified work tasks earn 69 points: **50.0%**. Two administrative tasks have zero delivery weight. Unfinished work receives zero, including partly implemented features and the wider hand-in/class-review task. The estimate is not logged time, course marks or instructor acceptance.

Another member's laptop run, confirmed personal contributions/code explanations, the final earlier proposal evidence, representative classroom interval labels, live input, integrated event review, final performance and held-out evaluation remain pending. Preparing and tagging these technical hand-in files does not close those gates.

The editable long report remains outside the repository; this folder contains the short submission copy. The actual LMS/form submission is performed by the team using the repository link and tag.

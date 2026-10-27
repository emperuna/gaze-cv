# CP3 core implementation and testing

Status: local technical package prepared; main-method improvement, human label review and the in-class checks are not established. This index does not establish instructor acceptance or publication.
Task: `cp3-hand-in` ([Issue #23](https://github.com/emperuna/gaze-cv/issues/23)). Live assignment and Project status have not been verified in this session.

The user supplied the complete Phase 3 instructions and 15-point rubric on 27 October 2026. Hand-in is Thursday 29 October, 11:30 PM; the in-class check is Friday 30 October. No deadline timezone was specified in those instructions.

## Required evidence

| Requirement | Evidence required before hand-in | Current gap |
| --- | --- | --- |
| Integrated primary method | [Automatic head pipeline](../../../src/gaze/head_image.py), pinned Gold-YOLO + 6DRepNet360 models; see [model provenance](../../../models/README.md). | Integrated and measured, but lower aggregate accuracy than baseline. |
| One-command pipeline | [Runner](../../../scripts/run.py) handles an image, media folder or saved clip; [test log](test-log.md) records two images plus one clip and verified outputs. | Teacher's three unseen inputs remain an in-class check. Calibrated seat mode remains separate. |
| Fixed held-out testing | [63-image manifest](../../../data/annotations/cp3.json), [data card](data-card.md), [original protocol](frozen-protocol.json), [reproduction protocol](frozen-protocol-reproduction.json) and [test log](test-log.md). | Only three subjects; synthetic/correlated cases and visual labels limit inference. Human label cross-check pending. Final split untouched. |
| Preliminary results | [Evaluator](../../../scripts/evaluate_cp3.py), [measurements](../../../outputs/evidence/cp3-core/comparison.json), [four-page PDF](results.pdf). | One recorded timing workload, not general real-time classroom FPS. |
| Error analysis | [12-example gallery and full error groups](../../../outputs/evidence/cp3-core/README.md), [confusion matrices](../../../outputs/evidence/cp3-core/confusion-matrices.png). | Groups indicate observed conditions, not proven causes. |
| Improvement plan | Results PDF page 4 ties three changes to blur/light, direction boundaries, and occlusion/size. | Expected effects are proposed targets, not achieved improvements. |
| Submission | [Results PDF](results.pdf), this index and reproducible source/evidence; local hand-in tag `cp3-core` identifies the technical package. | Owner publication, LMS submission and instructor acceptance remain separate. |

The older roadmap and task snapshot describe a validation comparison and additional seat-consistency work. For this submission, the newly supplied instructions require a previously unused set. Historical task completion remains historical; it does not satisfy this new comparison. Seat consistency remains a separate unresolved project requirement.

After the owner publishes the branch and local tag, hand in the repository link at `https://github.com/emperuna/gaze-cv/tree/cp3-core` together with `results.pdf`. The tag identifies this preliminary package; it does not certify excellent-tier accuracy, human review or instructor acceptance. No remote publication or course-site submission was performed by this implementation session.

## Marking and live check

| Criterion | Maximum | Excellent evidence |
| --- | ---: | --- |
| End-to-end pipeline | 4 | All three teacher-provided inputs run from one command with clear outputs and no manual intermediate stages. |
| Primary algorithm | 4 | Correct integrated main method, sensible preprocessing/post-processing, and measured improvement over baseline. |
| Testing and preliminary results | 3 | Representative held-out hard cases, appropriate metrics, comparison and speed reproduced by repository code. |
| Error analysis and plan | 2 | At least 10 failures grouped with counts, correctly interpreted confusion matrix and three cause-specific fixes. |
| Implementation understanding | 2 | Explain a live failure using the method's mechanics; each member answers questions about their contribution. |

A model that fails to improve must be reported honestly with an explanation; integration alone does not earn the excellent primary-method rating. Local rehearsal cannot establish the teacher's unseen-input demonstration or each member's understanding.

## Results

| Method | Correct | Accuracy | Macro-F1 | Coverage | ms/image | images/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Geometric baseline | 29/63 | 46.03% | 0.4875 | 52.38% | 7.66 | 130.54 |
| Learned head model | 13/63 | 20.63% | 0.3071 | 38.10% | 83.48 | 11.98 |

Measured on an Apple M5 MacBook Air with CPU inference. Both methods score 8/15 on the unmodified inputs; the main method scores 6/6 on strong unmodified portrait profiles versus baseline 1/6, but does worse on the aggregate stress set. No threshold was changed using these test results. See the JSON for exact timing scope, versions and unrounded values.

## Reproduce on the hand-in source

Use Python 3.12 and the project-local environment. From the repository root on macOS:

```sh
mkdir -p .work/tmp .work/cache .work/pip-cache .work/matplotlib
export TEMP="$PWD/.work/tmp" TMP="$PWD/.work/tmp" TMPDIR="$PWD/.work/tmp"
export PIP_CACHE_DIR="$PWD/.work/pip-cache" MPLCONFIGDIR="$PWD/.work/matplotlib" XDG_CACHE_HOME="$PWD/.work/cache"
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt -r requirements-head-pose.txt
.venv/bin/python scripts/download_model.py
.venv/bin/python scripts/download_head_models.py
mkdir -p data/raw/cp3
curl -L --fail --output data/raw/cp3/5474326.mp4 https://videos.pexels.com/video-files/5474326/5474326-hd_2048_1080_25fps.mp4
curl -L --fail --output data/raw/cp3/7924513.mp4 https://videos.pexels.com/video-files/7924513/7924513-hd_1080_1920_24fps.mp4
curl -L --fail --output data/raw/cp3/8363848.mp4 https://videos.pexels.com/video-files/8363848/8363848-hd_1920_1080_30fps.mp4
.venv/bin/python scripts/prepare_cp3.py
.venv/bin/python scripts/evaluate_cp3.py --manifest data/annotations/cp3.json --freeze docs/checkpoints/cp3-hand-in/frozen-protocol-reproduction.json --output outputs/runs/cp3-comparison.json
.venv/bin/python scripts/build_cp3_report.py --results outputs/runs/cp3-comparison.json --manifest data/annotations/cp3.json --output outputs/runs/cp3-results.pdf --evidence-dir outputs/runs/cp3-report-evidence
```

On Windows use the F: environment/cache setup in the root README, `.venv\Scripts\python.exe` and `curl.exe`. That platform has not been reverified for the new models in this session. The source-copy reproduction used the existing pinned Mac environment and verified model cache; it is not a human fresh-install result. A different decoder/runtime can change prepared pixels or predictions; checksum/configuration mismatches stop evaluation rather than silently scoring changed inputs. Do not regenerate a freeze merely to bypass a mismatch.

The preparation command accepts an existing versioned manifest and verifies reconstruction without rewriting it. It refuses an existing prepared-data directory. Choose new output paths for repeat evaluations/report builds. The two immutable protocols record a preparation-only bug fix; model settings, input labels and pixels remained unchanged. Preserve both runs in the test log.

**One command for the teacher's inputs, after setup:**

```sh
.venv/bin/python scripts/run.py --input teacher-inputs --output-dir outputs/runs/teacher-demo --method head
```

Place the three supported images/clips directly in that folder. Outputs are sorted into separate directories with PNG/AVI annotations, JSON labels/counts and a batch `run.json`. Exit 0 means all inputs processed; 1 means a per-input failure was logged; 2 means setup/argument processing failed. Counts are observations, not unique people. Folder scanning is nonrecursive. Constant-frame-rate saved video is supported; webcam remains optional and unimplemented.

## Four-page results PDF

1. Task, baseline and main method, direction conventions, pipeline and exact run command.
2. Dataset separation, permissions, hard-case coverage, evaluation protocol, comparison table and laptop timing conditions.
3. Ten or more numbered failures grouped by cause, counts and confusion matrix interpretation.
4. Three cause-linked improvements, limitations, reproduction commands, evidence paths and team explanation preparation.

Web UI and live camera input are not needed for this checkpoint. Camera-relative head direction is not eye gaze or evidence of misconduct; calibrated seat-relative review remains a distinct mode.

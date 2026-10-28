# CP3 team hand-in

**GAZE - CSST 106 - 29 October 2026**

Team: Marc Justin Alberto, Jose III Aquino, Jeremy Garin. Deadline supplied for this hand-in: Thursday 29 October, 11:30 PM; class check: Friday 30 October. The supplied instructions do not specify a deadline timezone.

Submit the repository link together with tag **cp3-core** and the [four-page results PDF](results.pdf). The tag pins the hand-in snapshot; it does not certify instructor acceptance, human label review or the remaining in-class checks. Publish the final hand-in tag before submitting its links.

## Six required items

| Requirement | Included evidence |
| --- | --- |
| 1. Integrated primary algorithm or model | [Automatic head pipeline](../../../src/gaze/head_image.py): Gold-YOLO head detection and 6DRepNet360 pose estimation, with [model provenance](../../../models/README.md). The main method is integrated and measured, but its aggregate accuracy is lower than baseline. |
| 2. Working one-command pipeline | [Runner](../../../scripts/run.py) accepts an image, media folder or saved clip and saves annotated PNG/AVI outputs, JSON direction labels/counts and a batch record. The [test log](test-log.md) records two images plus one clip and verified outputs. See the command below. |
| 3. Initial testing on a fixed, previously unused set | [63-image manifest](../../../data/annotations/cp3.json), [data card](data-card.md), [original protocol](frozen-protocol.json), [reproduction protocol](frozen-protocol-reproduction.json) and [test log](test-log.md). Includes low light, blur, profile angles, occlusion, clutter and reduced-size cases. These inputs were not used for local training or tuning; human label cross-check remains pending. |
| 4. Preliminary comparison and laptop speed | [Evaluator](../../../scripts/evaluate_cp3.py), [saved measurements](../../../outputs/evidence/cp3-core/comparison.json), comparison table below and results PDF page 2. Both methods use the same 63 inputs; laptop timing is one image workload, not whole-video real-time FPS. |
| 5. Error analysis | [Twelve actual failures grouped by condition](../../../outputs/evidence/cp3-core/README.md), [full gallery records](../../../outputs/evidence/cp3-core/gallery.json), [confusion matrices](../../../outputs/evidence/cp3-core/confusion-matrices.png) and results PDF pages 2–3. Groups describe observed conditions, not proven causes. |
| 6. Three-change improvement plan | Results PDF page 4 links three proposed changes to blur/light, direction boundaries and occlusion/size, with expected measurable effects. These are proposed targets, not achieved improvements. |

The fixed set contains 63 images from 15 base frames and three target subjects/recordings. Adjacent frames and synthetic variants are correlated; they are not 63 independent subjects. Labels describe visible head direction, not measured gaze. Upstream pretraining overlap cannot be fully audited. The final Pointing04 test split remains untouched.

## How to run from the hand-in source (macOS CPU)


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

## Preliminary measured results


| Method | Correct | Accuracy | Macro-F1 | Coverage | ms/image | images/s |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Geometric baseline | 29/63 | 46.03% | 0.4875 | 52.38% | 7.66 | 130.54 |
| Learned head model | 13/63 | 20.63% | 0.3071 | 38.10% | 83.48 | 11.98 |

Measured on an Apple M5 MacBook Air with CPU inference. Both methods score 8/15 on the unmodified inputs; the main method scores 6/6 on strong unmodified portrait profiles versus baseline 1/6, but does worse on the aggregate stress set. No threshold was changed using these test results. See the JSON for exact timing scope, versions and unrounded values.

## Twelve failure sample outputs

The [grouped gallery](../../../outputs/evidence/cp3-core/README.md) links all twelve numbered failure images, with reference directions, predictions and recorded reasons. It covers blur, clean poses, low light, masks/classroom clutter, occlusion and small heads. Counts include every failed image, not only the examples selected for display.

Additional view: [baseline and main confusion matrices](../../../outputs/evidence/cp3-core/confusion-matrices.png). The failure gallery is also included on results PDF page 3.

Sources are cottonbro studio, Nicola Barts and RDNE Stock project via Pexels; the [data card](data-card.md) records permissions and source links. These are head-direction predictions, not misconduct labels.

Machine-readable inventory: [package manifest](package-manifest.json), including page count, dataset counts, evidence hashes and measured results.

## Remaining checks and submission

Human label cross-check, the teacher's three unseen inputs and each member's personal explanation remain unverified. Three subjects, correlated frames and synthetic stress conditions limit generalization. Seat consistency is a separate unresolved project requirement. Camera input is optional and unimplemented; calibrated seat mode remains separate from these automatic-mode results.

The Phase 3 instructions supplied on 27 October require a fixed set never used for training or tuning. This supersedes the older roadmap's validation-only comparison for this hand-in; historical validation results do not establish this new comparison.

Task: `cp3-hand-in` ([Issue #23](https://github.com/emperuna/gaze-cv/issues/23)). Live assignment and Project status have not been verified for this documentation update. This file does not establish LMS submission or instructor acceptance; the team performs the actual hand-in.

Submit the repository at `https://github.com/emperuna/gaze-cv/tree/cp3-core` together with `results.pdf`, after the final tag is published.

## Marking and live check


| Criterion | Maximum | Excellent evidence |
| --- | ---: | --- |
| End-to-end pipeline | 4 | All three teacher-provided inputs run from one command with clear outputs and no manual intermediate stages. |
| Primary algorithm | 4 | Correct integrated main method, sensible preprocessing/post-processing, and measured improvement over baseline. |
| Testing and preliminary results | 3 | Representative held-out hard cases, appropriate metrics, comparison and speed reproduced by repository code. |
| Error analysis and plan | 2 | At least 10 failures grouped with counts, correctly interpreted confusion matrix and three cause-specific fixes. |
| Implementation understanding | 2 | Explain a live failure using the method's mechanics; each member answers questions about their contribution. |

A model that fails to improve must be reported honestly with an explanation; integration alone does not earn the excellent primary-method rating. Local rehearsal cannot establish the teacher's unseen-input demonstration or each member's understanding.

## Four-page results PDF


1. Task, baseline and main method, direction conventions, pipeline and exact run command.
2. Dataset separation, permissions, hard-case coverage, evaluation protocol, comparison table and laptop timing conditions.
3. Ten or more numbered failures grouped by cause, counts and confusion matrix interpretation.
4. Three cause-linked improvements, limitations, reproduction commands, evidence paths and team explanation preparation.

Web UI and live camera input are not needed for this checkpoint. Camera-relative head direction is not eye gaze or evidence of misconduct; calibrated seat-relative review remains a distinct mode.

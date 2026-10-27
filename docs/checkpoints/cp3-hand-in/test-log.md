# CP3 test log — 27 October 2026

Task: `cp3-hand-in`, Issue #23. Live Issue/Project assignment not verified and not changed. Branch: `feat/hidden-face-review`, starting revision `67366d1`. CP3 work was uncommitted during measurements; the JSON records this and pins implementation file hashes. Publication, LMS submission, teacher demonstration and human label review are not claimed.

## Protocol and data chronology

1. Read the complete teacher instructions/rubric and recorded the requirements and approved implementation plan. Existing Pointing04 validation results and inspected classroom trials were excluded from new held-out claims. Final 120 Pointing04 test images remained unprocessed.
2. BIWI official page/archive returned 403; UPNA access could not be verified. Selected three accessible Pexels sources with free-use/modification terms. Recorded authors, URLs and source SHA256 before relying on them. Other candidate clips were excluded before inference; see the data card.
3. Visually inspected source contact sheets, selected 15 base frames and assigned ordinal direction labels without either model's predictions. Created 48 declared synthetic variants and three natural masked classroom crops. `prepare_cp3.py` wrote 63 image checksums and the versioned manifest. This is agent annotation; no second human label review is claimed.
4. At **07:58:00 UTC**, recorded `frozen-protocol.json`. Model initialization only; no samples from the new sources had been passed to either model. Fixed model hashes, thresholds, code and manifest fingerprint before scoring.
5. At **07:58:19 UTC**, completed the first evaluation: [initial-comparison.json](../../../outputs/evidence/cp3-core/initial-comparison.json). Baseline 29/63 correct, main 13/63. No input labels, selected samples, thresholds or model weights were changed afterward.
6. Independent code review found that preparation refused to reconstruct images when a versioned manifest already existed. A failing reconstruction test reproduced the problem. Fixed the preparation-only behavior: reconstruct into a new directory, verify all generated hashes/metadata against the existing manifest, preserve the manifest, and reject changed pixels. This does not modify inference or the test set.
7. At **08:02:54 UTC**, recorded a second immutable [protocol](frozen-protocol-reproduction.json) for the preparation fix and added report-selection helper. The original protocol remains. Baseline and head-model configurations are unchanged.
8. At **08:04:16 UTC**, completed [comparison.json](../../../outputs/evidence/cp3-core/comparison.json), used by the PDF. Every predicted direction and metric matches the first run. Timing varies by run; the PDF reports this run's image workload, not a warmup-excluded or full-video FPS claim.
9. At **08:05:12 UTC**, completed isolated source-copy evaluation. All 63 prepared image checksums reconstructed exactly against the versioned manifest; both methods' complete metrics and predicted direction lists matched the two earlier runs. The source copy reused the existing pinned environment and verified model cache; this is **not** a fresh dependency install, Git clone, independent machine or another human's reproduction.

## Commands and verification

All cache/temp settings were process-local under project `.work/`, using `.venv/bin/python`. MediaPipe CPU model initialization failed inside the sandbox because its macOS OpenGL context could not be created; model-integration runs used approved project-scoped execution outside the sandbox. No global package, driver or system setting was changed.

```sh
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python scripts/prepare_cp3.py
.venv/bin/python scripts/freeze_cp3.py --manifest data/annotations/cp3.json --output docs/checkpoints/cp3-hand-in/frozen-protocol.json
.venv/bin/python scripts/evaluate_cp3.py --manifest data/annotations/cp3.json --freeze docs/checkpoints/cp3-hand-in/frozen-protocol.json --output outputs/evidence/cp3-core/initial-comparison.json
.venv/bin/python scripts/freeze_cp3.py --manifest data/annotations/cp3.json --output docs/checkpoints/cp3-hand-in/frozen-protocol-reproduction.json
.venv/bin/python scripts/evaluate_cp3.py --manifest data/annotations/cp3.json --freeze docs/checkpoints/cp3-hand-in/frozen-protocol-reproduction.json --output outputs/evidence/cp3-core/comparison.json
.venv/bin/python scripts/build_cp3_report.py --results outputs/evidence/cp3-core/comparison.json --manifest data/annotations/cp3.json --output docs/checkpoints/cp3-hand-in/results.pdf --evidence-dir outputs/evidence/cp3-core
```

The first evaluation initially wrote `comparison.json`; it was renamed `initial-comparison.json` to preserve it when recording the reproducibility run. The commands above show the retained destinations. Existing outputs/protocols must not be overwritten. For a fresh checkout, use the reproduction commands in the index; **reuse** the versioned protocol rather than creating new settings.

Application baseline: 123 tests passed before changes. Current application suite: 138 passed, including injected-model rotation/mirroring/unknown tests, actual image/video dispatch, missing-observation denominators, checksums/leakage declarations, portable model-path comparison, dataset reconstruction and deterministic failure selection. Tests requiring true models are covered by separate recorded integration runs, not inferred from injected adapters.

Report generation initially failed when converting a relative gallery path to a repository-relative path. The actual build command reproduced that failure; normalizing output paths fixed it. The same command then produced the report and 12 distinct recorded failures. All four PDF pages were rendered for visual inspection, with page count checked from generated PDF page objects.

Final verification: 138 application tests and 16 repository automation tests passed. `.github/automation.py check` passed Python syntax, local document links, conflict-marker and task-dependency checks. `git diff --check` passed. The complete local technical package is intended for the authorized `cp3-core` hand-in tag; no push or course-site submission is implied.

## Three-input one-command rehearsal

Prepared two source images (head-turn frame 0 and downward frame 95) plus a 30-frame CFR classroom clip at 1280×720. Ran:

```sh
.venv/bin/python scripts/run.py --input outputs/runs/cp3-rehearsal-inputs --output-dir outputs/runs/cp3-rehearsal-head --method head
```

Result: 3 successful inputs, 0 failures; no seat calibration or manual intermediate stage. Decoded both saved annotated PNGs and every frame of the 30-frame annotated AVI. Per-input JSONs and batch counts were inspected. These are newly acquired local rehearsal sources, not the teacher's still-unseen inputs. Raw/annotated clip files remain ignored local artifacts.

## Remaining limits

- Main method is worse overall (20.63% versus 46.03% accuracy); the excellent algorithm-improvement tier is not established. The original-profile subgroup benefit does not override that result.
- Labels are visually assigned ordinal directions, with uncertain boundaries and only three subjects. Human review and a larger independent dataset remain necessary.
- No threshold optimization was performed on this set. Proposed changes must use separate development data, then another held-out set.
- Windows execution of the new ONNX path and a fully fresh dependency install remain unverified in this session.
- Git provenance in `evaluate_cp3.py` assumes invocation from the repository root, as documented. Reviewer noted that launching from another repository can record incorrect Git provenance; this minor finding is deferred. Actual recorded runs used the intended repository root.
- Two further minor portability findings are deferred: the report generator is written for this fixed CP3 experiment and includes its original Apple M5 host/profile-subgroup description; using arbitrary alternative result files can misattribute those facts. Preparation serializes image paths with platform-native separators, so Windows reconstruction may fail the versioned forward-slash manifest comparison. The documented Mac package/reproduction is unaffected; Windows remains unverified.
- No teacher-input demonstration, member understanding score, instructor acceptance or LMS submission is established by these local results.

# CP2 implementation and progress evidence

Status: Implementation merged through [PR #44](https://github.com/emperuna/gaze-cv/pull/44) on 22 October 2026 (Asia/Shanghai). Validation artifacts retain their original measured source revision/hashes; rebased merge commit IDs do not change those source bytes. The [post-merge acceptance audit](task-reconciliation.md) records current task decisions. The [technical CP2 hand-in package](cp2-hand-in/README.md) is prepared for the authorized cp2-50 tag. LMS submission, instructor acceptance, member/laptop checks and final held-out results remain unverified.

## Delivered technical scope

Permitted source acquisition, traceable head-direction labels, subject-separated manifests, shared preprocessing, CPU face landmarks, the geometric baseline, annotated image prediction, the five-image spike, a twenty-sample contact sheet, validation scoring, and timestamped saved-video processing now run. Additional core work implements an approximate pose comparison, fixed-seat association, observation histories, and sustained/repeated movement-rule records. Unit tests cover missing observations, ambiguity, source time, label conventions, geometry, I/O protection, and metric denominators.

| Requirement | Evidence | Remaining limit |
| --- | --- | --- |
| Prepared data and locked splits | [Data card](../evaluation/data-card.md), [manifest](../../data/annotations/pointing04.json), [twenty examples](../../data/annotations/samples.json), [contact sheet](../../outputs/evidence/contact-sheet.jpg) | Deliberately moderate posed subset; BIWI not acquired; not classroom validation. |
| Shared preprocessing | src/gaze/preprocessing.py, actual image/video/evaluation pipeline, [before/after evidence](../../outputs/evidence/preprocessing.png) | BGR-to-RGB conversion preserves displayed colors; shrink only when configured width requires it. |
| Runnable image baseline | scripts/predict.py, [example output](../../outputs/evidence/image-baseline.png), [five-image evidence](../../outputs/evidence/spike/report.json) | Missing/unknown observations remain explicit; no seat identity implied. |
| Validation measurements | [Initial baseline](../../outputs/evidence/cp2-validation-initial.json), [selected baseline](../../outputs/evidence/cp2-validation.json), [approximate pose](../../outputs/evidence/cp3-pose-validation.json) | Validation influenced baseline threshold selection; final test scoring remains locked. |
| Multi-face saved video and FPS | [Video procedure/results](../evaluation/video.md), [benchmark](../../outputs/evidence/video-benchmark.json), [reviewed overlays](../../outputs/evidence/video-detection-review.jpg) | Office proxy and desktop CPU; no target-laptop or classroom result. |
| Fixed-seat histories and rules | [Seat reference/scope](../evaluation/seats.md), synthetic/integration tests and ignored full run exports | Rules are behavior-tested; real movement-event precision/recall and writing false alerts remain unvalidated. |
| Clean environment reproduction | [Reproduction record](reproduction.md), [actual fresh-clone spike](../../outputs/evidence/spike-fresh-clone/README.md) | The agent desktop fresh-clone five-image check passed for #8. Another human member on the intended laptop remains #41. |

## Verification commands

Follow README to configure project-local F: caches and the environment. The initial baseline setting can be regenerated with `scripts/evaluate.py --manifest data/annotations/pointing04.json --down-threshold 0.60 --output outputs/runs/initial-validation.json`; the selected default uses 0.40, and the comparison uses `--method pose`. Use new output files or an explicit report-only --overwrite. All three final measurement reports were rerun against the same validation manifest and finalized implementation hashes.

## Image results and error analysis

Both methods use the same 240 validation images, sixty per class, ten subjects, identical label mapping and failure accounting. No test-image inference or tuning was performed. Ground-truth labels come from nominal source pose annotations, not predictions.

| Approach | Accuracy (all eligible) | Macro-F1 | Usable coverage |
| --- | --- | --- | --- |
| Initial geometry, down ratio 0.60 | 69.17% | 0.6339 | 99.17% |
| Geometry after validation selection, down ratio 0.40 | 86.67% | 0.8798 | 97.50% |
| Approximate six-point PnP, nominal camera | 67.50% | 0.6734 | 98.75% |

The initial geometry setting missed most downward poses. Inspection of validation score distributions motivated one down-threshold adjustment from 0.60 to 0.40; yaw remained 0.18. Preserve the initial result and disclose this selection. The selected baseline has 208 correct predictions, 26 wrong direction predictions, and six unavailable/unknown observations; all six count against overall accuracy. Its down recall is 46/60. The pose approach uses a generic face shape and nominal focal length with fixed prior 20-degree angle thresholds; it currently performs worse, particularly on down. It is an implemented comparison, not evidence of improvement. Neither score meets or fails the final held-out target until a later frozen test evaluation is authorized.

## Video evidence

The source is Xiph's explicitly public-domain FourPeople meeting clip. The exact downloaded file decodes 601 frames at 1280 x 720, 60 FPS. A full-frame-only detector initially found no faces; generic overlapping tiles were therefore added and their coordinate mapping/deduplication tested. Three tiled baseline runs show at least three face observations on 547/601 frames. A sparse independent visual audit at six fixed source frames found 22 foreground matches out of 24 visible people, two misses, and no observed extras. This sparse audit is not full-clip matched recall.

Three sequential CPU runs measured 10.41, 10.95, and 11.18 end-to-end FPS (median 10.95) after five warmup frames, with the exact timing exclusions in the benchmark. Hardware is an AMD Ryzen 5 5600X desktop with twelve logical CPUs. Desktop throughput does not establish the proposed 10 FPS laptop target. Full generated videos/observations/history/events remain under ignored outputs/runs/; selected summaries and images are versionable.

## Core requirement coverage

| PRD requirement | Working implementation | Acceptance boundary |
| --- | --- | --- |
| FR01 input | Saved CFR video | Live camera remains later work. |
| FR02 multiple faces | Tiled detection and reviewed proxy examples | Misses remain; sparse review is not full detection recall. |
| FR03 directions | Geometry and approximate PnP; common validation metrics | Final held-out result unmeasured; pose calibration unresolved. |
| FR04 fixed seats | Configured nonoverlapping regions, ambiguity preserved | Position association, not identity tracking; limited office references. |
| FR05 histories | Source-time per-seat entries and explicit gap/continuity segments | Representative classroom sequences still needed. |
| FR06 movement rules | Sustained/repeated records, minimum repeat dwell, unknown/gap resets | Synthetic behavior tests and proxy outputs; real event accuracy unvalidated. |
| FR07 settings | CLI direction/rule/gap settings retained in outputs | Experimental defaults; no smoothing currently used. |
| FR08 review view | Saved annotated video, seat labels, timestamps, JSON review records | No polished interactive review interface or live preview yet. |
| FR09 export | Independently readable observations, histories, events, settings/source hashes | Requires team review of schema and expected review workflow. |
| FR10 unavailable data | Explicit missing/ambiguous/unknown states; no duration through gaps | Classroom occlusion coverage not established. |
| FR11 comparison | Same 240-image validation inputs and failure denominators | Baseline tuned on validation; final frozen test scoring remains later. |

The independent clean source-folder check installed its own pinned environment, downloaded model/data again, ran both image methods and contact-sheet generation, and passed all 70 application tests. After review fixes, both the original environment and the refreshed independent environment passed all 96 application tests. The independent refresh also passed dependency integrity, both image methods, and contact-sheet generation; see the [review verification record](../../outputs/evidence/review-verification.json). The original environment passed sixteen repository automation tests, dependency checks, local-link/task consistency, and whitespace checks. No OS setting, global package, driver, or non-F local project file was changed after the user imposed the F-only rule.

The final repeat filter requires at least 0.25 seconds of continuously observed direction before counting an episode. The initial no-dwell proxy run produced twelve jitter-prone repeated records; the final filter produced one. The final history/event gap limits were verified by replaying every saved observation and a current CLI run; see [the exact provenance](../../outputs/evidence/video-seated-events-dwell.json). Neither record count establishes event precision or recall.

## Entire-system progress and remaining gates

There is now working code for the image/video observation path, baseline and main-method comparison, fixed-seat association, histories, rule settings, and exported review records. This is substantial implementation progress beyond a CP2 scaffold. Do not convert the checkpoint label or count of files into an unsupported overall completion percentage.

An official effort-weighted percentage still needs reviewed weights across the complete proposal scope and acceptance-verified task evidence; [the report formula](README.md#effort-weighted-completion) applies. No percentage is fabricated to reach 50%. The current code still needs team acceptance, contribution review, target-laptop execution, representative labeled classroom/temporal footage, and later final held-out scoring. Live-camera input and a polished interactive review interface remain later capabilities. Proposed course deadlines remain unchanged until the instructor confirms revised arrangements.

The three agents' implementation work is assistance for the current human collaborator, not commits or code ownership by Marc or Jose. Each human member must contribute and explain their own work. Another agent's clean-folder run does not satisfy another student's participation or defense.

## Hand-in readiness

- Verify and review the current source, permitted sample/evidence publication, and task acceptance criteria.
- Have another human member follow the setup and explain code they wrote; record the target laptop/camera/course arrangements.
- Review source/video limitations and any missing CP1 proposal/contribution evidence.
- Agree on full-scope effort weights and report evidence-backed completion, blockers, and revised target dates.
- Review the published branch and pull request; validation evidence is bound to the reviewed source revision and hashes.
- Tag the actual hand-in as cp2-50 only when submission is authorized; do not move existing tags or fabricate completion.

## Team tracking snapshot

After acceptance reconciliation and the fresh-clone #8 verification, 20 tasks are Done (18 accepted technical tasks plus the two existing administrative completions), 5 are Ready, 13 remain Backlog, and 2 hand-in tasks remain Blocked. No Review task remains solely because PR #44 was not linked with closing keywords. See [per-Issue reasons and remaining requirements](task-reconciliation.md). The fresh-clone spike is verified with its screenshot and logs; human/laptop verification remains actionable Ready work; team/hand-in gates remain incomplete. Existing member attribution is preserved and unfinished shared claims are released. No checkpoint tag or overall percentage is inferred.

## Implementation review fixes

The review added regression coverage for corrupt/empty and Unicode-path images, protected spike outputs against every manifest input including locked test records, corrected evaluation source provenance when the dataset root is elsewhere, and rejected malformed/aliased manifest records. Movement rules now tolerate floating-point noise at exact duration/gap boundaries. Odd video dimensions are padded explicitly rather than silently cropped; downloads are bounded and output creation rejects collisions. Versioned text and generated JSON use LF for stable cross-platform hashes. Three real validation runs were refreshed against the reviewed source; their predictions and accuracy are unchanged. Historical video benchmarks retain their original provenance and require a target-laptop rerun for final acceptance.

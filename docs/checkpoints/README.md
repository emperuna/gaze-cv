# Checkpoint evidence

For each hand-in, record the checkpoint, submission commit, member contributions, reproduction steps, evidence links, measurements, and remaining limitations. Follow the [root roadmap](../../ROADMAP.md) and tag only the actual hand-in commit. No checkpoint completion is claimed by this documentation.

## CP4 preparation

Use the [seven-item progress checklist](cp4-checklist.md),
[technical test cases](cp4-test-cases.md), and [before/after table](cp4-before-after.md).
The [faculty setup comparison](faculty-setup-before-after.md) covers the later
simplification, automatic suggestions and timing inspection.
The [saved-review verification record](../superpowers/specs/2026-10-29-saved-review-verification.md)
records integration evidence separately from remaining held-out evaluation,
representative laptop performance, report/slides, backup recording and team acceptance.

## CP2 evidence record

When implementation evidence exists, prepare a CP2 report in this folder. Keep the report consistent with the repository and live Issue/Project state. Milestone 2 - Checkpoint Guide.pdf (pages 1-3) is the source for the course gates; GAZE adds the three-face video and FPS commitment.

Record the following:

| Evidence | Required contents |
| --- | --- |
| Environment and reproduction | Exact commit, verifier, date, Python/OS/laptop CPU, pinned runtime versions, model version and retrieval instructions, fresh-clone setup, actual prediction command, output, and result. |
| Prepared data | One-page data card, source-separated validation/test manifests, overlap/count checks, label review, and test-lock policy. |
| Preprocessing | Shared functions used by prediction/evaluation, settings, and committed permitted before/after strips for each applied step. |
| Image prototype | One image input produces an annotated saved output; record unknown and invalid-input behavior. |
| Baseline validation | Accuracy, macro-F1, confusion matrix, coverage/failures, exact manifest, thresholds, metric definitions, command, and reproducible results. |
| GAZE video evidence | Authorized clip, three simultaneous faces, missed observations, source timestamps, and FPS with hardware, resolution, face count, and timing scope. |
| Contribution and progress | Proposal tasks mapped to stable task IDs, actual contributors, status, evidence paths/commits, planned effort weights, blockers, remaining work, and revised target dates. |
| Class review | Each member opens and explains code they wrote; the team rehearses validation reproduction and a teacher-selected test-image run without tuning from its output. |
| Submission | All roadmap gates reviewed, limitations stated, and the actual hand-in commit identified for cp2-50. Tagging and pushing require separate authorization. |

## Effort-weighted completion

Agree on relative effort weights before calculating the report. Show the complete planned project scope, including later checkpoints, and map it to proposal tasks without double-counting subtasks or administrative work. Record any scope/weight revision and its reason; do not change weights merely to reach 50%.

Use `completion (%) = 100 * sum(weights of evidence-verified completed tasks) / sum(weights of all planned tasks in the stated scope)`. In-progress tasks do not count as completed under this calculation. A CP2-only calculation may be shown separately, clearly labeled; it does not replace overall project progress. Report no percentage until weights and completion evidence have been reviewed.

The 50% checkpoint label, a tag, closed planning Issues, and CI success alone do not establish application progress. If evidence is missing, report it as missing and state the blocker and next target date. Existing course dates remain visible until the instructor confirms revised arrangements.

## Current implementation records

- [CP3 technical package](cp3-hand-in/README.md): automatic learned-head pipeline, fixed-set preliminary comparison, four-page report, failure gallery and reproduction instructions. Main-method improvement and human/in-class checks remain unestablished.

- [CP2 and core implementation progress](cp2-progress.md): actual results, requirement coverage, and remaining hand-in gates.
- [Independent clean-folder reproduction](reproduction.md): pinned environment/model/data reproduction and its human/Git-clone limitations.

These records describe the reviewed development branch and its recorded source snapshots; no cp2-50 hand-in tag or submission is claimed.

## Post-merge task acceptance

See [the PR #44 acceptance reconciliation](task-reconciliation.md) for closed technical tasks, actionable Ready work, and remaining submission/validation requirements. Issue acceptance and PR merging do not by themselves complete an academic checkpoint.

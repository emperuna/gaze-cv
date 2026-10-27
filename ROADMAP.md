# GAZE Development Roadmap

Status: Implementation in progress as of 22 October 2026. Image/video processing and core session modules now exist; [the checkpoint report](docs/checkpoints/cp2-progress.md) maps measured evidence and remaining gates. Checkboxes below remain acceptance gates, not an automatic claim of submission.

This roadmap breaks the [PRD](PRD.md) into checkpoint deliverables for the project team. It follows the supplied Milestone 1 checkpoint guide for the schedule and general submission expectations, Milestone 2 - Checkpoint Guide.pdf (pages 1-3) for the CP2 completion requirements, and the concept paper for GAZE's scope. The CP2 section distinguishes course requirements from additional GAZE commitments; other feature allocations remain the project's proposed plan.

The [task backlog](TASK.md) turns these milestones into individually assignable work items with stable IDs. [AGENTS.md](AGENTS.md) defines contribution and verification conventions. The task file links the created Issues and the [checkpoint kanban board](https://github.com/users/emperuna/projects/3/views/2). Board updates and Markdown status reconciliation remain manual; no continuous synchronization is installed.

## Checkpoint schedule

All hand-ins are due at 11:30 PM in the course timezone, which needs confirmation. Dates follow the supplied guide's October and November schedule. The guide accepts late hand-ins marked late and retains the Friday class check. Confirm actual submission status and any revised arrangements with the instructor; this roadmap does not change deadlines.

| Phase | Hand-in date | Class check | Points | Intended outcome | Hand-in tag |
| --- | --- | --- | --- | --- | --- |
| CP1 | 15 October | 16 October | 10 | Proposal, data evidence, and feasibility demonstration. | `cp1-proposal` |
| CP2 | 22 October | 23 October | 15 | Reproducible image prototype, prepared data, preprocessing evidence, validation baseline, and GAZE video evidence. | `cp2-50` |
| CP3 | 29 October | 30 October | 15 | Core direction classification and seat association with initial tests. | `cp3-core` |
| CP4 | 12 November | 13 November | 20 | Movement histories, review events, integrated outputs, and performance evidence. | `cp4-80` |
| CP5 | 19 November | Presentations from 20 November | 30 | Final team presentation and demonstration using saved video; live camera input is optional. | `v1.0` |
| Individual defense | 19 November | During the team's presentation slot | 10 | Each member explains and defends their contribution. | Same final submission |

The guide has five project checkpoints plus a separately marked individual defense, totaling 100 points. The 50% and 80% checkpoint names do not establish actual completion. Milestone 2 requires a reported completion percentage calculated from completed tasks weighted by effort; document the scope, weights, and evidence rather than counting every task equally.

Task leads below reflect the original suggested allocation, not exclusive ownership. Any collaborator may claim unassigned shared work; prerequisites and acceptance criteria determine readiness. Individual defenses remain personal responsibilities. Live claims are recorded in GitHub Issues.

## Starting position and priorities

The repository contains documentation, automation, acquired permitted samples, and a working CPU image/video prototype with core session behavior. The [implementation report](docs/checkpoints/cp2-progress.md) records measurements, review fixes, and remaining limits. Per-member contributions, human fresh-clone verification, laptop performance, and checkpoint submissions remain unverified. Pushes require user authorization.

CP1's listed deadline has passed, and CP2 is due on 22 October. Address missing CP1 prerequisites before treating CP2 as achievable. If the evidence cannot be completed by the listed deadline, report the actual state and agree on arrangements with the instructor. Keep the original checkpoint dates visible.

The team still needs to confirm the following acceptance and demonstration decisions; implementation evidence does not close these gates automatically:

- [ ] Confirm course deadlines, timezone, and prior submission status.
- [ ] Confirm an accessible labeled dataset and its permitted uses.
- [ ] Confirm the demonstration laptop, saved-video input, and three-seat arrangement; camera hardware is needed only for the optional live workflow.
- [ ] Agree on direction meanings, including left/right and mixed movements.
- [ ] Agree on authorized video collection, access, and retention.
- [ ] Confirm whether the proposed local preview satisfies the demonstration needs.

Unchecked items below represent work or evidence that still needs verification. A completed individual gate does not by itself complete a development checkpoint.

The current package implements data acquisition, shared preprocessing, landmarks, the geometric baseline, an approximate PnP comparison, annotated image/video outputs, validation scoring, fixed-seat association, source-time histories, and tested movement rules. Scripts expose these responsibilities; add further organization only when real work needs it. See [README](README.md) for supported commands and [the data card](docs/evaluation/data-card.md) for acquired inputs.

## Supporting folders and tooling

Small permitted samples, manifests, contact sheets, before/after evidence, and selected result reports are versionable. Full data, model downloads, generated video runs, project-local caches, and reproduction environments remain ignored on F:. [Evaluation notes](docs/evaluation/README.md) distinguish validation tuning from final held-out scoring. [Checkpoint evidence](docs/checkpoints/cp2-progress.md) distinguishes implemented behavior, measured results, and external verification still needed.

CI now runs actual application tests as well as repository consistency/automation tests. No application check alone establishes course hand-in, per-member contributions, laptop performance, final test accuracy, or classroom/event validation.

## CP1 Proposal and feasibility

**Outcome:** Show that the project is feasible with available data and a small reproducible demonstration.

**Dependencies:** Scope agreement and access to permitted sample data.

| Work item | Suggested contact | Completion evidence |
| --- | --- | --- |
| Check the proposal against all nine required sections. | All members | Proposal PDF with measurable targets, baseline, main approach, workflow diagram, owners, timeline, risks, and fallback. |
| Acquire real data and document its source and permissions. | All members; Jose coordinates labels | Available sample files, label explanation, counts by class, and documented conditions. |
| Prepare the labeled contact sheet. | All members | At least 20 real samples covering useful variation, committed with meaningful labels. |
| Prepare the five-image feasibility spike. | Marc | A project-relevant operation runs on five actual samples; output screenshot and reproduction instructions are committed. |
| Complete the hand-in repository evidence. | Jeremy coordinates; each member contributes | README and run instructions, required repository materials, and at least one commit from every member's own account. |
| Rehearse the three-minute pitch. | All members | Team can explain the problem, show data, explain the approach, and run the spike. |

**Completion gate:**

- [ ] The proposal covers all nine guide sections.
- [ ] Data is acquired and a labeled 20-sample contact sheet is committed.
- [x] The five-image spike runs from a fresh clone and its screenshot is committed. See [actual fresh-clone evidence](outputs/evidence/spike-fresh-clone/README.md).
- [ ] Each member has at least one contribution from their own account.
- [ ] The actual hand-in commit is identified for the `cp1-proposal` tag.

Unlabeled LFW images can demonstrate an operation but cannot supply head-direction accuracy evidence. If used for the spike, distinguish that demonstration from the labeled data required for evaluation.

## CP2 Baseline and initial progress

**Outcome:** A fresh clone can process an image into an annotated baseline output on a laptop CPU, backed by prepared data, visible preprocessing evidence, and a reproducible validation measurement.

**Dependencies:** CP1 data access, agreed labels, and reproducible execution. Relevant requirements: FR01, FR02, early FR03 and FR08, and initial FR11. Shared tasks remain available to any collaborator; the contacts elsewhere in this roadmap are advisory.

**Course requirements from the Milestone 2 guide:**

| Work item | Completion evidence | Task ID |
| --- | --- | --- |
| Establish prepared, source-separated data. | A committed one-page data card and manifests identify validation and locked test groups, class/split counts, label checks, image sizes, gaps, licences, and preprocessing. Keep each subject and recording within one split; add training data if training is introduced. | `cp2-split-protocol` |
| Implement reusable preprocessing. | Functions under `src/gaze/` are imported by prediction and evaluation, and by training if introduced. Commit before/after strips for each applied step; explain choices without adding irrelevant techniques. | `cp2-preprocessing` |
| Establish the geometric direction baseline. | Documented rules produce forward/left/right/down or unknown, with threshold settings chosen using validation data only. | `cp2-baseline` |
| Run an image prototype. | One documented command accepts an image and saves an annotated output; invalid input is understandable. The command supports a teacher-selected test image during class. | `cp2-image-prototype` |
| Measure baseline quality. | Reproducible validation accuracy and macro-F1, plus GAZE's confusion matrix, coverage, and failure counts; retain the exact manifest, settings, and command. | `cp2-first-metrics` |
| Verify clean CPU execution. | Pinned runtime dependencies, documented model retrieval, and another member's fresh-clone run on a laptop CPU produce an actual output. Help text or package imports are insufficient. | `cp2-reproduction` |
| Prepare the progress report and class review. | Proposal tasks, contributors, status, evidence, effort-weighted completion, blockers, revised dates, and each member's explanation of code they wrote. Identify the actual hand-in commit for `cp2-50`. | `cp2-hand-in` |

**Additional GAZE commitments retained for CP2:**

| Work item | Completion evidence | Task ID |
| --- | --- | --- |
| Establish repeatable saved-video input. | An authorized clip processes using source timestamps with understandable invalid-input handling. | `cp2-video` |
| Demonstrate three-face baseline observations and measure speed. | A permitted representative clip shows three simultaneously visible faces with direction labels; report misses and FPS with hardware, resolution, face count, and timing scope. No stable seat tracking is claimed yet. | `cp2-multi-face` |

**Completion gate:**

- [ ] A committed data card and reproducible manifests establish validation and source-separated locked test data; test results have not been used for tuning.
- [ ] Reusable preprocessing lives in `src/gaze/`, is used by the prototype and evaluation, and has committed before/after evidence.
- [ ] One image input produces a saved annotated baseline output using a documented command.
- [ ] Validation accuracy and macro-F1 can be reproduced, with settings, confusion matrix, coverage, and failure accounting recorded.
- [ ] A fresh clone plus README steps installs pinned dependencies, retrieves required assets, and runs the prototype on a laptop CPU.
- [ ] GAZE's saved-video demonstration shows at least three visible faces and records FPS and missed observations under stated conditions.
- [ ] The progress report matches repository evidence and includes contributors, an effort-weighted completion calculation, blockers, and revised target dates.
- [ ] Each member can open and explain code they wrote; the team can run a teacher-selected test image without tuning from its output.
- [x] The authorized `cp2-50` tag identifies the [technical hand-in package](docs/checkpoints/cp2-hand-in/README.md). Instructor acceptance and the other unchecked gates remain separate.

Image validation depends on prepared data, preprocessing, and the image prototype; it does not wait for video integration. Video input can proceed alongside this path, with FPS evidence completed under `cp2-multi-face`. Hand-in requires both paths and fresh-clone verification. Detailed reporting expectations are in [the evaluation plan](docs/evaluation/README.md) and [checkpoint evidence notes](docs/checkpoints/README.md).

The guide's example layouts, `predict.py` name, 70/15/15 split, and algorithms are illustrative. Use a layout and split justified by the actual data; no training split is required for a baseline that does not train. The 80% accuracy and 10 FPS goals remain final project targets, not minimum CP2 scores. Seat association, histories, and movement rules now have development implementations requiring later checkpoint acceptance. Live-camera support is optional; integrated event review remains required. Screenshots alone cannot satisfy the runnable-prototype requirement.

## CP3 Core implementation and testing

**Outcome:** Demonstrate the main direction approach and maintain seat references through a session.

**Dependencies:** CP2 baseline and labeled direction data. Seat evaluation also requires authorized, labeled multi-person footage. Relevant requirements: FR03, FR04, initial FR05 and FR10, and FR11.

| Work item | Suggested contact | Completion evidence |
| --- | --- | --- |
| Produce the four directions with the main approach. | Jose | Labeled output examples, documented direction conventions, and initial results. |
| Associate observations with fixed seats. | Jeremy | A three-person clip demonstrates seat references; ambiguous observations remain unassigned. |
| Establish timestamped seat histories. | Jeremy | A short session history preserves observation order and identifies gaps. |
| Handle missing or unreliable observations. | Jose and Jeremy | Examples of a hidden face, temporary disappearance, and return without invented continuous movement. |
| Compare the baseline and main approaches. | Jose coordinates; all members review | Accuracy, macro-F1, confusion matrix, and detection coverage on the same validation inputs; keep final test scoring locked. |
| Review common errors. | All members | Examples of wrong directions, missed faces, and seat association failures, with next actions. |

**Completion gate:**

- [ ] All four direction labels are demonstrated and their interpretation is documented.
- [ ] Seat consistency is measured against labeled footage using a defined measure.
- [ ] Missing observations are visible in histories rather than treated as valid directions.
- [ ] Both methods have comparable initial results and documented limitations.
- [ ] The actual hand-in commit is identified for `cp3-core`.

## CP4 Movement analysis and integrated review

**Outcome:** Demonstrate sustained and repeated movement events within a usable session review flow.

**Dependencies:** Reliable direction observations, seat histories, and labeled movement intervals. Relevant requirements: FR05 through FR10, saved-video input in FR01, and expanded FR11. Live camera support is optional and does not block CP4 or project completion.

| Work item | Suggested contact | Completion evidence |
| --- | --- | --- |
| Distinguish brief, sustained, and repeated movements. | Jeremy with Jose | Labeled sequences demonstrate each behavior, with gaps excluded from continuous duration. |
| Make observation settings adjustable and traceable. | Jeremy with Jose | Two documented settings produce explainable differences and are saved with the session. |
| Combine the preview, review log, and saved records. | Jeremy | A session can be started, reviewed, stopped, and its records opened independently. |
| Optional: demonstrate live camera input and failure handling. | Marc with Jeremy | If pursued, camera session evidence and understandable handling of an unavailable camera; not a completion gate. |
| Evaluate movement events and ordinary writing. | All members | Event precision/recall where labels permit, defined matching rules, and unwanted alerts during labeled writing intervals. |
| Measure the integrated prototype and review errors. | Marc measures speed; Jose leads accuracy; Jeremy integrates | Results on the specified laptop with resolution, face count, coverage, and known failures recorded. |

**Completion gate:**

- [ ] The target three-seat saved-video workflow runs from input through review and saved records.
- [ ] Events describe movements without asserting misconduct.
- [ ] Sustained and repeated movements are checked against labeled sequences.
- [ ] Writing-related false alerts and processing speed are reported.
- [ ] The team records whether the full scope remains feasible and which fallback is needed.
- [ ] The actual hand-in commit is identified for `cp4-80`.

## CP5 Final demonstration and report

**Outcome:** Deliver a reproducible prototype and explain its measured capabilities and limitations.

**Dependencies:** CP4 results and a confirmed final demonstration scope. Relevant requirements: all FR01Ã¢â‚¬â€œFR11, or an explicitly documented fallback with incomplete requirements listed.

| Work item | Suggested contact | Completion evidence |
| --- | --- | --- |
| Freeze evaluation settings and complete held-out evaluation. | Jose coordinates; all members evaluate | Final baseline comparison, accuracy, macro-F1, coverage, processing speed, and video-based measures where supported. |
| Verify the agreed workflow from a fresh clone. | Marc and Jeremy; all members rehearse | Reproduction instructions work with documented data and model acquisition steps. |
| Prepare the demonstration and a saved-video backup. | Jeremy coordinates; all members present | Rehearsed demonstration, permitted backup material, and a clear account of any live-camera limitations. |
| Complete the final report and presentation. | All members | Problem, data, approach, comparison, results, error analysis, limitations, and contribution summary. |
| Prepare the final hand-in. | Jeremy coordinates | Reviewed repository contents and final submission commit identified for `v1.0`; repository owner pushes manually. |

**Completion gate:**

- [ ] Final results state whether the 80% direction-accuracy and 10 FPS targets were met under the reported conditions.
- [ ] The demonstration matches the capabilities claimed in the report.
- [ ] Every PRD requirement is marked demonstrated, incomplete, or unvalidated, with evidence.
- [ ] Instructions and backup material support a repeatable presentation.
- [ ] Final report, presentation, and contribution records are ready.

## Individual technical defense

Each member prepares throughout the project rather than leaving defense preparation until the final week.

- [ ] Explain the problem and the full session workflow.
- [ ] Identify personal contributions and the commits or evidence supporting them.
- [ ] Explain the inputs, outputs, and limitations of the area owned.
- [ ] Interpret the evaluation results and describe at least one observed failure.
- [ ] Explain how the baseline differs from the main approach and why the fallback is usable.

Each member owns their preparation. Shared documentation supports the defense but does not replace individual understanding.

## Dependencies and fallback decisions

The development order is data access and feasibility, then baseline observations, main direction classification, seat histories, movement events, and final evaluation. Baseline work, data labeling, and preparation of authorized multi-person footage can proceed alongside each other once the team agrees on labels and permissions.

If labeled pose data is unavailable at CP1 or CP2, resolve access or select a permitted alternative before claiming classification accuracy. If multi-person footage is unavailable by CP3, seat consistency and temporal validation remain blocked even if image classification works. If histories or events remain unreliable at CP4, retain the minimum demonstration of multiple faces and frame-level directions on prerecorded material and report the missing capabilities.

A fallback narrows the demonstration; it does not establish that all PRD requirements have been met. Reassess the actual evidence at each checkpoint and keep unresolved work visible.

## Checkpoint hand-in routine

For every checkpoint, summarize completed work, attach reproducible evidence, record measurements and limitations, and identify each member's contribution. Check the submission against the relevant completion gate and tag the actual hand-in commit with the guide's checkpoint tag. GitHub pushes require the repository owner's authorization.

The checklists remain acceptance gates rather than an assertion that implemented work is unstarted. Review the implementation report and linked Issues before checking off a gate. The authorized cp2-50 tag identifies the technical package; LMS submission, instructor acceptance and individual/laptop verification remain separate.

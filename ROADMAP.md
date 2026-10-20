# GAZE Development Roadmap

Status: Planned work as of 21 October 2026. Repository boilerplate exists; application features remain unimplemented.

This roadmap breaks the [PRD](PRD.md) into checkpoint deliverables for the project team. It follows the supplied Milestone 1 checkpoint guide and the concept paper's proposed allocation of features. The guide defines checkpoint names, dates, marks, and submission expectations; the tasks and completion gates below are the project's proposed plan.

## Checkpoint schedule

All hand-ins are due at 11:30 PM in the course timezone, which needs confirmation. Dates follow the supplied guide's October and November schedule. The guide accepts late hand-ins marked late and retains the Friday class check. Confirm actual submission status and any revised arrangements with the instructor; this roadmap does not change deadlines.

| Phase | Hand-in date | Class check | Points | Intended outcome | Hand-in tag |
| --- | --- | --- | --- | --- | --- |
| CP1 | 15 October | 16 October | 10 | Proposal, data evidence, and feasibility demonstration. | `cp1-proposal` |
| CP2 | 22 October | 23 October | 15 | Working baseline, multiple-face observation, and first measurements. | `cp2-50` |
| CP3 | 29 October | 30 October | 15 | Core direction classification and seat association with initial tests. | `cp3-core` |
| CP4 | 12 November | 13 November | 20 | Movement histories, review events, integrated outputs, and performance evidence. | `cp4-80` |
| CP5 | 19 November | Presentations from 20 November | 30 | Final team presentation and live demonstration. | `v1.0` |
| Individual defense | 19 November | During the team's presentation slot | 10 | Each member explains and defends their contribution. | Same final submission |

The guide has five project checkpoints plus a separately marked individual defense, totaling 100 points. The 50% and 80% checkpoint names are progress review stages, not percentages to infer from completed task counts.

## Starting position and priorities

The repository contains project documentation, an initial local Git commit, and project boilerplate. GitHub publication remains a manual step for the repository owner. Data acquisition, a running feasibility demonstration, per-member contributions, and checkpoint submissions are not established by the current repository.

CP1's listed deadline has passed, and CP2 is due on 22 October. Address missing CP1 prerequisites before treating CP2 as achievable. If the evidence cannot be completed by the listed deadline, report the actual state and agree on arrangements with the instructor. Keep the original checkpoint dates visible.

Before development begins, the team should agree on these decisions:

- [ ] Confirm course deadlines, timezone, and prior submission status.
- [ ] Confirm an accessible labeled dataset and its permitted uses.
- [ ] Confirm the demonstration laptop, camera, and three-seat arrangement.
- [ ] Agree on direction meanings, including left/right and mixed movements.
- [ ] Agree on authorized video collection, access, and retention.
- [ ] Confirm whether the proposed local preview satisfies the demonstration needs.

All task checkboxes below represent future work or evidence that needs verification. Completing documentation alone does not complete a development checkpoint.

The initial `data/` folder contains [acquisition notes](data/README.md) and empty `samples/` and `annotations/` placeholders for CP1. No images or labels are supplied. Create an ignored `raw/` folder when data is acquired and `processed/` only when saved derived inputs are needed. Generated contact sheets and annotated screenshots belong in `outputs/evidence/`.

The `configs/` folder contains only [planning notes](configs/README.md). Add configuration files when working behavior needs adjustable settings: direction thresholds during baseline experiments, seat regions around CP3, and movement rules around CP4. No configuration loader or calibrated defaults exist yet.

The initial `scripts/` folder contains only `spike.py`, `make_contact_sheet.py`, and its README. Both scripts are boilerplate for CP1. Add video and evaluation commands when CP2 work begins and live-camera support around CP4; these future entry points are not included in the initial scaffold.

The initial `src/gaze/` scaffold contains only `__init__.py`, `landmarks.py`, `baseline.py`, and `visualization.py`, with no implemented behavior. The first spike will coordinate image loading and result saving. Add modules as checkpoint work needs them: video input and evaluation for CP2, the main pose approach and seat association for CP3, and movement histories and exports for CP4. This is an incremental organization plan, not completed functionality; the [README](README.md#initial-package-organization) explains the initial responsibilities.

## Supporting folders and tooling

Keep model acquisition notes, the test plan, the evidence placeholder, proposal documentation, checkpoint documentation, and the pull request template in the initial scaffold. Create model download and generated run folders only when assets or output exist; their ignore rules remain in place.

Add notebooks only for actual exploration and test fixtures only when executable tests need inputs. When evaluation work begins around CP2, create `docs/evaluation/` and document permissions, labels, subject splits, comparison procedures, missing predictions, hardware, and event matching rules before final testing. Create `docs/presentation/` for the final report, slides, demo instructions, contribution summary, results, and limitations when those materials are prepared.

Add GitHub workflows when runnable checks exist. Introduce separate development requirements when actual development tools are chosen. These deferred folders and tools do not change the checkpoint deliverables.

## CP1 Proposal and feasibility

**Outcome:** Show that the project is feasible with available data and a small reproducible demonstration.

**Dependencies:** Scope agreement and access to permitted sample data.

| Work item | Lead | Completion evidence |
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
- [ ] The five-image spike runs from a fresh clone and its screenshot is committed.
- [ ] Each member has at least one contribution from their own account.
- [ ] The actual hand-in commit is identified for the `cp1-proposal` tag.

Unlabeled LFW images can demonstrate an operation but cannot supply head-direction accuracy evidence. If used for the spike, distinguish that demonstration from the labeled data required for evaluation.

## CP2 Baseline and initial progress

**Outcome:** Show a working reference approach and demonstrate observation of multiple visible faces.

**Dependencies:** CP1 data access and reproducible execution. Relevant requirements: FR01, FR02, early FR03 and FR08, and initial FR11.

| Work item | Lead | Completion evidence |
| --- | --- | --- |
| Establish repeatable saved-video input. | Marc | A selected clip opens and completes processing; unreadable input receives an understandable message. |
| Demonstrate multiple-face observation. | Marc with Jose | A representative view shows at least three visible faces observed at once, with missed detections recorded. |
| Establish reference direction predictions. | Marc with Jose | Baseline output examples for forward, left, right, and down, using agreed label meanings. |
| Define the evaluation sample selection and subject split. | Jose; all members label | Documented development and held-out groups with no subject overlap. |
| Present the first preview and measurements. | Jeremy integrates; all members review | Labeled examples, initial accuracy and processing-speed measurements, and an explanation of failures. |

**Completion gate:**

- [ ] Saved input and the baseline run using documented steps.
- [ ] Evidence shows at least three visible faces in the same scene.
- [ ] Initial measurements identify the data, conditions, and laptop used.
- [ ] The progress summary separates demonstrated features from incomplete ones.
- [ ] The actual hand-in commit is identified for `cp2-50`.

The 80% accuracy and 10 FPS goals remain final targets. CP2 should establish honest initial measurements rather than claim those goals are already met.

## CP3 Core implementation and testing

**Outcome:** Demonstrate the main direction approach and maintain seat references through a session.

**Dependencies:** CP2 baseline and labeled direction data. Seat evaluation also requires authorized, labeled multi-person footage. Relevant requirements: FR03, FR04, initial FR05 and FR10, and FR11.

| Work item | Lead | Completion evidence |
| --- | --- | --- |
| Produce the four directions with the main approach. | Jose | Labeled output examples, documented direction conventions, and initial results. |
| Associate observations with fixed seats. | Jeremy | A three-person clip demonstrates seat references; ambiguous observations remain unassigned. |
| Establish timestamped seat histories. | Jeremy | A short session history preserves observation order and identifies gaps. |
| Handle missing or unreliable observations. | Jose and Jeremy | Examples of a hidden face, temporary disappearance, and return without invented continuous movement. |
| Compare the baseline and main approaches. | Jose coordinates; all members review | Accuracy, macro-F1, confusion matrix, and detection coverage on the same evaluation inputs. |
| Review common errors. | All members | Examples of wrong directions, missed faces, and seat association failures, with next actions. |

**Completion gate:**

- [ ] All four direction labels are demonstrated and their interpretation is documented.
- [ ] Seat consistency is measured against labeled footage using a defined measure.
- [ ] Missing observations are visible in histories rather than treated as valid directions.
- [ ] Both methods have comparable initial results and documented limitations.
- [ ] The actual hand-in commit is identified for `cp3-core`.

## CP4 Movement analysis and integrated review

**Outcome:** Demonstrate sustained and repeated movement events within a usable session review flow.

**Dependencies:** Reliable direction observations, seat histories, and labeled movement intervals. Relevant requirements: FR05 through FR10, completion of live input in FR01, and expanded FR11.

| Work item | Lead | Completion evidence |
| --- | --- | --- |
| Distinguish brief, sustained, and repeated movements. | Jeremy with Jose | Labeled sequences demonstrate each behavior, with gaps excluded from continuous duration. |
| Make observation settings adjustable and traceable. | Jeremy with Jose | Two documented settings produce explainable differences and are saved with the session. |
| Combine the preview, review log, and saved records. | Jeremy | A session can be started, reviewed, stopped, and its records opened independently. |
| Demonstrate live camera input and failure handling. | Marc with Jeremy | Camera session evidence and understandable handling of an unavailable camera. |
| Evaluate movement events and ordinary writing. | All members | Event precision/recall where labels permit, defined matching rules, and unwanted alerts during labeled writing intervals. |
| Measure the integrated prototype and review errors. | Marc measures speed; Jose leads accuracy; Jeremy integrates | Results on the specified laptop with resolution, face count, coverage, and known failures recorded. |

**Completion gate:**

- [ ] The target three-seat workflow runs from input through review and saved records.
- [ ] Events describe movements without asserting misconduct.
- [ ] Sustained and repeated movements are checked against labeled sequences.
- [ ] Writing-related false alerts and processing speed are reported.
- [ ] The team records whether the full scope remains feasible and which fallback is needed.
- [ ] The actual hand-in commit is identified for `cp4-80`.

## CP5 Final demonstration and report

**Outcome:** Deliver a reproducible prototype and explain its measured capabilities and limitations.

**Dependencies:** CP4 results and a confirmed final demonstration scope. Relevant requirements: all FR01–FR11, or an explicitly documented fallback with incomplete requirements listed.

| Work item | Lead | Completion evidence |
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

For every checkpoint, summarize completed work, attach reproducible evidence, record measurements and limitations, and identify each member's contribution. Check the submission against the relevant completion gate and tag the actual hand-in commit with the guide's checkpoint tag. The repository owner handles GitHub pushes manually.

No application tasks or checkpoint tags are completed by adding this roadmap. Development begins after the team reviews the plan and resolves the immediate prerequisites.

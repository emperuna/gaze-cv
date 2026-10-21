# Tasks

This is the GAZE backlog derived from [ROADMAP.md](ROADMAP.md) and [PRD.md](PRD.md). All 40 tasks have linked GitHub Issues; CP2 has nine planned tasks aligned with the Milestone 2 guide. Shared backlog tasks are unassigned; the first two administrative Issues were already closed on GitHub and retain their completion attribution. Creating or claiming planning work does not start application development.

<!-- policy: Follow AGENTS.md and the scope authorized in the current conversation.
     policy: Creating this backlog does not authorize implementation, external publication, or a task-draining loop.
     policy: Do not mark work complete without recorded acceptance evidence. -->

The structure follows the [TASKS.md reference](https://tasksmd.github.io/tasks.md/) with project-specific Assignee, Defense member, Status, and Issue fields. The singular filename is intentional, as requested. Discovery tools expecting `TASKS.md` need an explicit file path where supported or a later rename; no command or integration is installed.

**Priority:** P0 is reserved for urgent breakages; P1 contains required project work; P2 is useful nonblocking work; P3 is optional future work. Only P1 is populated. Checkpoint order and dependencies determine readiness within it. Being scheduled later does not make required work optional.

**Claiming:** Shared tasks have no preset owner and are initially unassigned. Any collaborator may claim an unclaimed task once its prerequisites are satisfied and development is authorized. Assign the Issue to the human claimant, re-read the assignment to detect competing claims, and move the card to In Progress when work starts. Current GitHub claims take precedence over the local snapshot. The three individual defenses remain personal responsibilities; helpers do not replace the named student's defense.

**Status:** Backlog, Ready, In Progress, Review, Blocked, Done. Backlog is untriaged; Ready requires satisfied dependencies and accessible inputs; Review requires acceptance review; Done requires verified evidence. `Blocked by` IDs describe dependencies even while an item remains in Backlog. Use `Blocked` for an actual external impediment. No development tasks are pre-claimed. Issue URLs below identify the created work items.

**Dates:** Use the original schedule in ROADMAP.md. CP1's listed deadline has passed and CP2 is next as of 22 October 2026. Confirm submission status, timezone, and revised arrangements before assigning board dates; do not infer completion from tags or commit messages.

**Paths:** Files identify relevant or future locations, not a request to create empty files now. Keep the simplified scaffold until authorized implementation needs more modules.

**Completion:** Keep a checked task with Status Done until its evidence and Issue link, if any, are recorded. Update dependent tasks before archiving/removing completed blocks. This deliberately retains reviewed completion records rather than immediately deleting tasks as the reference suggests.

## GitHub Projects board

- [Checkpoint Kanban](https://github.com/users/emperuna/projects/3/views/2): Status columns and Checkpoint swimlanes.
- [All tasks table](https://github.com/users/emperuna/projects/3/views/1).
- Checkpoint boards: [CP1](https://github.com/users/emperuna/projects/3/views/3), [CP2](https://github.com/users/emperuna/projects/3/views/4), [CP3](https://github.com/users/emperuna/projects/3/views/5), [CP4](https://github.com/users/emperuna/projects/3/views/6), [CP5](https://github.com/users/emperuna/projects/3/views/7), [Defense](https://github.com/users/emperuna/projects/3/views/8).
- [Repository Issues](https://github.com/emperuna/gaze-cv/issues): one Issue per stable task ID, with checkpoint milestones, labels, acceptance criteria, and verification.

The existing empty Project linked to this repository was reused and named GAZE Development. It remains private. Marc and Jose have Project edit access. Normal repository collaborator access is still required to claim Issues; pending invitations do not reserve shared tasks for anyone. No unconfirmed course dates were assigned.

| Task metadata | GitHub mapping |
| --- | --- |
| ID | Issue title prefix and Task ID Project field. |
| Assignee | Live Issue assignee; shared tasks stay unassigned until claimed. |
| Defense member | Named student for an individual defense; recorded in its Issue body. |
| Milestone | Repository milestone and Checkpoint Project field. |
| Tags | Repository labels, plus checkpoint and priority labels. |
| Priority heading | Priority Project field. |
| Status | Project Status field and kanban column. |
| Blocked by | Dependency IDs in Issue bodies; resolve IDs through their Issue links below. |
| Acceptance and Verification | Issue body. |

Issues and Projects own live team status and assignment; this file owns the versioned task breakdown. Reconcile links and material status changes manually. No continuous Markdown-to-board synchronization or task execution is installed. Search for the stable ID before creating an Issue to avoid duplicates. Review evidence before moving a development task to Done.

The original per-member allocation is advisory and does not control task eligibility. Remove an active claim when releasing unfinished work and leave a handoff note. Checkpoint grouping, dependencies, acceptance criteria, and review requirements remain unchanged.

Commit and repository pushes remain manual unless separately authorized.

## P1

- [x] Confirm course schedule and demonstration constraints
  - **ID**: cp1-confirm-plan
  - **Assignee**: @emperuna (completion attribution)
  - **Status**: Done
  - **Milestone**: CP1
  - **Tags**: planning
  - **Files**: `ROADMAP.md`, `PRD.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/1
  - **Acceptance**: Course timezone, submission status, three-seat setup, laptop, and demonstration expectations are recorded; original guide dates stay visible.
  - **Verification**: Review the recorded decisions with the team and reconcile the PRD and roadmap.

- [x] Prepare the GitHub Issues and Projects board
  - **ID**: cp1-project-board
  - **Assignee**: @emperuna (completion attribution)
  - **Status**: Done
  - **Milestone**: CP1
  - **Tags**: planning, tooling
  - **Files**: `TASK.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/2
  - **Acceptance**: When GitHub publication is authorized, task Issues are linked by stable ID, shared tasks are available for self-assignment, and checkpoint/status views are available without duplicates.
  - **Verification**: Compare Issues and board items against the task IDs; verify self-assignment availability and checkpoint filters. This requires authorized GitHub access.

- [ ] Acquire an accessible labeled head-pose sample set
  - **ID**: cp1-data-access
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: data
  - **Files**: `data/README.md`, `data/samples/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/3
  - **Acceptance**: Accessible source, acquired samples, permissions, and usable pose annotations are recorded; select a permitted alternative if BIWI is unavailable.
  - **Verification**: Inspect acquired files and permission records; verify annotations describe the actual selected samples.

- [ ] Define direction meanings and label selected samples
  - **ID**: cp1-label-contract
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: data, documentation
  - **Files**: `data/README.md`, `data/annotations/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/4
  - **Blocked by**: cp1-data-access
  - **Acceptance**: Subject-relative left/right, forward/down, mirroring, mixed poses, and unknown observations are documented; selected samples have traceable labels and class counts.
  - **Verification**: Manually inspect examples of all four directions and match annotations to sample files.

- [ ] Establish the minimal reproducible vision environment
  - **ID**: cp1-runtime
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: tooling, landmarks
  - **Files**: `requirements.txt`, `pyproject.toml`, `models/README.md`, `README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/5
  - **Blocked by**: cp1-data-access
  - **Acceptance**: The minimal compatible CV dependencies and any model acquisition steps are documented and verified on the intended laptop; no unlicensed assets are committed.
  - **Verification**: Create a fresh environment, install the documented dependencies, and verify required libraries and model assets load.

- [ ] Extract faces and landmarks from the selected images
  - **ID**: cp1-landmarks
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: landmarks
  - **Files**: `src/gaze/landmarks.py`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/6
  - **Blocked by**: cp1-runtime
  - **Acceptance**: Real sample images produce usable face/landmark observations or an explicit unavailable result; the output meaning is documented for Marc and Jeremy.
  - **Verification**: Inspect successful, difficult, and missing-face examples; add checks for implemented observation handling.

- [ ] Draw inspectable face and landmark results
  - **ID**: cp1-annotations
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: visualization
  - **Files**: `src/gaze/visualization.py`, `outputs/evidence/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/7
  - **Blocked by**: cp1-landmarks
  - **Acceptance**: Real observations can be drawn on images with readable face regions and landmarks; no direction is fabricated when unavailable.
  - **Verification**: Compare saved annotated examples against their source images.

- [ ] Implement the reproducible five-image feasibility spike
  - **ID**: cp1-spike
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: baseline, tooling
  - **Files**: `scripts/spike.py`, `README.md`, `outputs/evidence/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/8
  - **Blocked by**: cp1-landmarks, cp1-annotations
  - **Acceptance**: A project-relevant face/landmark operation runs on five actual samples from a fresh clone and saves inspectable results and a screenshot; this need not claim completed direction classification.
  - **Verification**: Follow documented setup and spike instructions from a fresh clone and count the five processed inputs and their outputs.

- [ ] Generate the labeled twenty-sample contact sheet
  - **ID**: cp1-contact-sheet
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: data, tooling
  - **Files**: `scripts/make_contact_sheet.py`, `outputs/evidence/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/9
  - **Blocked by**: cp1-label-contract, cp1-runtime
  - **Acceptance**: A readable contact sheet contains at least 20 real permitted samples with meaningful labels and visible variation.
  - **Verification**: Count the displayed examples and cross-check each displayed label with its annotation.

- [ ] Finalize the nine-section proposal and workflow diagram
  - **ID**: cp1-proposal
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: documentation
  - **Files**: `docs/proposal/`, `PRD.md`, `ARCHITECTURE.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/10
  - **Blocked by**: cp1-label-contract, cp1-confirm-plan
  - **Acceptance**: The proposal covers all nine guide sections, actual data evidence, owners, targets, risks, and fallback; diagrams distinguish proposed behavior from measured results.
  - **Verification**: Check each guide section against the final PDF and verify data counts and claims against evidence.

- [ ] Review CP1 evidence and rehearse the pitch
  - **ID**: cp1-hand-in
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP1
  - **Tags**: submission, presentation
  - **Files**: `docs/checkpoints/`, `README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/11
  - **Blocked by**: cp1-spike, cp1-contact-sheet, cp1-proposal
  - **Acceptance**: All CP1 gates are checked, every member has a contribution from their own account, the three-minute pitch is rehearsed, and the actual hand-in commit is identified. A tag name alone is insufficient.
  - **Verification**: Walk through ROADMAP CP1 gates and demonstrate the spike and contact sheet; repository owner handles tagging/pushing when authorized.

- [ ] Prepare the data card and source-separated evaluation inputs
  - **ID**: cp2-split-protocol
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: data, evaluation
  - **Files**: `data/README.md`, `data/annotations/`, `docs/evaluation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/12
  - **Blocked by**: cp1-label-contract
  - **Acceptance**: A committed one-page data card records sources/licences, acquired class and split counts, label creation/checks, image sizes, gaps, and preprocessing. Reproducible manifests separate validation and locked test data by subject and recording/source; add a separate training split if training is introduced. Document selection, coverage accounting, and the test-lock policy; no test-based tuning.
  - **Verification**: Validate manifests against acquired labeled files, check subject and recording/source intersections are empty, reconcile counts with the data card, and record the chosen split rationale.

- [ ] Implement reusable preprocessing and record its effects
  - **ID**: cp2-preprocessing
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: tooling, evaluation
  - **Files**: `src/gaze/`, `tests/`, `outputs/evidence/`, `docs/evaluation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/39
  - **Blocked by**: cp1-runtime, cp1-label-contract
  - **Acceptance**: Reusable functions in src/gaze perform only justified image preparation, with documented size, colour, and coordinate conventions. Prediction and evaluation import the same functions; training does too if introduced. Commit permitted before/after sample strips for each applied step. Any fitted preprocessing uses training data only, and augmentation, if used, is training-only.
  - **Verification**: Check input/output shape, colour and coordinate handling with real permitted samples; inspect each before/after strip and verify the same functions are used by prediction and evaluation when integrated.

- [ ] Implement the geometric direction baseline
  - **ID**: cp2-baseline
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: baseline
  - **Files**: `src/gaze/baseline.py`, `tests/`, `docs/evaluation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/13
  - **Blocked by**: cp1-landmarks, cp1-label-contract, cp2-preprocessing, cp2-split-protocol
  - **Acceptance**: Usable observations produce forward/left/right/down predictions using documented geometric rules and recorded threshold settings; missing observations remain unknown. Choose thresholds on validation data only and preserve the locked test split.
  - **Verification**: Check all four directions, decision boundaries, mirroring/mixed-pose conventions, and missing observations; record settings and the validation inputs used for tuning.

- [ ] Run one image through the annotated baseline prototype
  - **ID**: cp2-image-prototype
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: integration, visualization
  - **Files**: `scripts/`, `src/gaze/`, `README.md`, `outputs/evidence/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/40
  - **Blocked by**: cp2-baseline, cp1-annotations
  - **Acceptance**: One documented command accepts an image and output location, calls shared preprocessing and the baseline, and saves a readable annotated result. Missing or unusable observations are shown explicitly; invalid input produces an understandable error. The same command accepts an arbitrary eligible test image during class.
  - **Verification**: Run the command on permitted labeled examples and a missing/unreadable input; inspect saved annotations and confirm this is executable behavior rather than help output or screenshots alone.

- [ ] Read saved video with source timestamps
  - **ID**: cp2-video
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: video
  - **Files**: `scripts/`, `src/gaze/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/14
  - **Blocked by**: cp1-runtime
  - **Acceptance**: As a GAZE-specific CP2 commitment, authorized saved footage is read reproducibly with source timestamps and understandable invalid-input handling; processing speed does not alter session time. Record clip access and permitted use.
  - **Verification**: Process a known authorized clip, inspect timestamp order, and exercise missing or unreadable input.

- [ ] Demonstrate three-face observations and measure video FPS
  - **ID**: cp2-multi-face
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: integration, visualization, evaluation
  - **Files**: `src/gaze/visualization.py`, `scripts/`, `outputs/evidence/`, `docs/evaluation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/15
  - **Blocked by**: cp2-video, cp2-image-prototype, cp2-split-protocol
  - **Acceptance**: As a GAZE-specific CP2 commitment, a permitted representative clip shows at least three simultaneously visible faces with baseline labels. Record missed observations and reproducible FPS with hardware, resolution, face count, frame count, and timing scope; no stable seat tracking is claimed yet. The 10 FPS goal remains a final target.
  - **Verification**: Review simultaneous frames against the source clip and rerun the documented timing procedure. Include failures in reporting and keep timing separate from image validation accuracy.

- [ ] Measure baseline quality on the validation split
  - **ID**: cp2-first-metrics
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: evaluation
  - **Files**: `scripts/`, `src/gaze/`, `docs/evaluation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/16
  - **Blocked by**: cp2-split-protocol, cp2-image-prototype
  - **Acceptance**: Validation accuracy, macro-F1, confusion matrix, coverage, and failed-observation counts are reproducible using the shared preprocessing. Record manifest, label mapping, thresholds, metric denominators, command, environment, and results. Do not score the locked test split for tuning. Image metrics do not depend on video integration; video FPS belongs to cp2-multi-face.
  - **Verification**: Rerun the measurement on the exact validation inputs and settings; reconcile eligible, predicted, and missing counts and inspect representative errors. Verify no test results informed changes.

- [ ] Verify the image prototype from a fresh clone on CPU
  - **ID**: cp2-reproduction
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: testing, tooling
  - **Files**: `requirements.txt`, `pyproject.toml`, `models/README.md`, `README.md`, `docs/checkpoints/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/41
  - **Blocked by**: cp2-image-prototype, cp2-split-protocol
  - **Acceptance**: Runtime dependencies are pinned to verified compatible versions and model retrieval/version instructions are documented without committing large weights. Another member follows README steps from a fresh clone and new environment on a laptop CPU, obtains permitted input/assets, and saves a real annotated output. Record Python/OS/hardware, dependency versions, commands, verifier, and outcome; do not claim an unperformed check.
  - **Verification**: Follow only the documented setup and image command in a clean folder/environment and inspect the resulting output. Verify required assets are retrievable and record any failure or missing prerequisite.

- [ ] Prepare the CP2 progress report and class review
  - **ID**: cp2-hand-in
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP2
  - **Tags**: submission
  - **Files**: `docs/checkpoints/`, `README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/17
  - **Blocked by**: cp1-hand-in, cp2-first-metrics, cp2-multi-face, cp2-reproduction
  - **Acceptance**: All Milestone 2 and GAZE CP2 gates map to repository evidence. The report lists proposal tasks, actual contributors, status, evidence, agreed effort weights, completion calculated as completed weight over total planned weight, blockers, revised dates, and remaining work. Each member can explain code they wrote; the team can rerun validation and process a teacher-selected test image without tuning. Identify the actual hand-in commit.
  - **Verification**: Review ROADMAP CP2 gates, audit the weighted calculation and evidence, inspect the fresh-clone record, and rehearse individual code explanations and the image/video demonstrations. Use cp2-50 only for the actual separately authorized hand-in; this planning update does not satisfy it.

- [ ] Prepare authorized multi-person video labels
  - **ID**: cp3-video-labels
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: data, seats, temporal
  - **Files**: `data/README.md`, `data/annotations/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/18
  - **Blocked by**: cp1-confirm-plan, cp1-label-contract
  - **Acceptance**: Authorized footage has fixed seat references and labeled brief, sustained, repeated, writing, and observation-gap intervals; access and retention are documented.
  - **Verification**: Inspect consent/license records and manually cross-check labeled intervals and seat references against footage.

- [ ] Implement the main head-pose direction approach
  - **ID**: cp3-pose
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: pose
  - **Files**: `src/gaze/`, `tests/`, `models/README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/19
  - **Blocked by**: cp1-landmarks, cp2-split-protocol
  - **Acceptance**: The main method produces the four agreed directions with documented calibration and angle conventions, including explicit unavailable observations.
  - **Verification**: Check four-direction examples, mirroring and mixed-pose conventions, and missing-observation behavior.

- [ ] Associate observations with fixed seat positions
  - **ID**: cp3-seats
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: seats
  - **Files**: `src/gaze/`, `configs/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/20
  - **Blocked by**: cp3-video-labels, cp2-video
  - **Acceptance**: At least three seats can be defined and associated with observations; ambiguous assignments remain unassigned and consistency is measured against labeled footage.
  - **Verification**: Replay annotated seat sequences including disappearance, return, and ambiguity; report the defined consistency measure.

- [ ] Maintain timestamped seat direction histories
  - **ID**: cp3-histories
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: seats, integration
  - **Files**: `src/gaze/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/21
  - **Blocked by**: cp3-seats, cp3-pose
  - **Acceptance**: Per-seat histories preserve direction, time, and validity; gaps are explicit and cannot imply uninterrupted movement.
  - **Verification**: Replay labeled disappearance and return sequences and inspect history order and gap handling.

- [ ] Compare the baseline and main approaches
  - **ID**: cp3-comparison
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: evaluation
  - **Files**: `docs/evaluation/`, `scripts/`, `src/gaze/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/22
  - **Blocked by**: cp3-pose, cp2-first-metrics
  - **Acceptance**: Both methods use identical validation inputs, label mapping, preprocessing, and failure accounting; report accuracy, macro-F1, confusion matrices, coverage, and representative errors. Keep the final test split locked until settings are frozen for final evaluation.
  - **Verification**: Rerun both methods on the documented inputs and audit comparable denominators and settings.

- [ ] Prepare core implementation evidence
  - **ID**: cp3-hand-in
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP3
  - **Tags**: submission
  - **Files**: `docs/checkpoints/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/23
  - **Blocked by**: cp2-hand-in, cp3-histories, cp3-comparison
  - **Acceptance**: Core direction, seat, history, missing-observation, and comparison evidence is mapped to CP3 gates with limitations and the actual submission commit.
  - **Verification**: Review CP3 gates and demonstrate the core workflow; use cp3-core only for the actual authorized hand-in.

- [ ] Detect sustained and repeated movement events
  - **ID**: cp4-movement
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: temporal
  - **Files**: `src/gaze/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/24
  - **Blocked by**: cp3-histories, cp3-video-labels
  - **Acceptance**: Duration and repetition rules distinguish brief/sustained/repeated movements using session time; gaps do not accumulate continuous duration and events describe movement only.
  - **Verification**: Exercise labeled boundary, repetition-window, timing, and gap sequences and inspect expected event intervals.

- [ ] Make session observation settings adjustable and traceable
  - **ID**: cp4-settings
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: configuration
  - **Files**: `configs/`, `src/gaze/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/25
  - **Blocked by**: cp4-movement
  - **Acceptance**: Direction sensitivity, smoothing if used, duration, repetition count, and time window can be adjusted and validated; development-derived settings are retained with a session.
  - **Verification**: Compare two settings on the same development sequences and verify behavior changes and invalid-setting handling.

- [ ] Integrate event review and saved session records
  - **ID**: cp4-export-review
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: visualization, export
  - **Files**: `src/gaze/`, `scripts/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/26
  - **Blocked by**: cp4-settings, cp2-multi-face
  - **Acceptance**: The workflow starts, displays seat/direction annotations and timestamped events, stops, and saves independently readable records linked to session settings.
  - **Verification**: Complete a saved-input session and reopen exported records to match events and settings to the displayed session.

- [ ] Support the live camera workflow
  - **ID**: cp4-camera
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: camera
  - **Files**: `src/gaze/`, `scripts/`, `tests/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/27
  - **Blocked by**: cp4-export-review
  - **Acceptance**: Live input uses the shared observation workflow and elapsed session time; unavailable camera input receives an understandable message.
  - **Verification**: Run the authorized three-seat camera demonstration and verify startup, stop, camera failure, and time semantics.

- [ ] Evaluate movement events and false alerts during writing
  - **ID**: cp4-event-evaluation
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: evaluation, temporal
  - **Files**: `docs/evaluation/`, `scripts/`, `src/gaze/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/28
  - **Blocked by**: cp4-settings, cp3-video-labels
  - **Acceptance**: Event matching and tolerance rules are defined before scoring; precision/recall where labels permit and false alerts over labeled writing exposure are reported.
  - **Verification**: Score annotated intervals using the recorded rules and inspect matched, missed, and unwanted events.

- [ ] Measure the integrated prototype and record fallback decisions
  - **ID**: cp4-performance
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: evaluation, integration
  - **Files**: `docs/evaluation/`, `docs/checkpoints/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/29
  - **Blocked by**: cp4-camera, cp4-event-evaluation
  - **Acceptance**: End-to-end speed, supported resolution and face count, direction quality, and known errors are reported; full-scope feasibility and any fallback are explicit.
  - **Verification**: Repeat the documented representative workload on the specified laptop and review errors with all members.

- [ ] Prepare the integrated progress submission
  - **ID**: cp4-hand-in
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP4
  - **Tags**: submission
  - **Files**: `docs/checkpoints/`, `README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/30
  - **Blocked by**: cp3-hand-in, cp4-performance
  - **Acceptance**: CP4 gates are reviewed, evidence matches demonstrated capabilities, incomplete requirements are listed, and the actual hand-in commit is identified.
  - **Verification**: Demonstrate the integrated workflow and review every CP4 gate; use cp4-80 only for the actual authorized hand-in.

- [ ] Freeze settings and complete final held-out evaluation
  - **ID**: cp5-final-evaluation
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP5
  - **Tags**: evaluation
  - **Files**: `docs/evaluation/`, `data/annotations/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/31
  - **Blocked by**: cp4-hand-in
  - **Acceptance**: Final results compare methods and report whether 80% accuracy and 10 FPS targets were met, with coverage, hardware, supported conditions, and video measures where validated.
  - **Verification**: Record frozen settings before held-out runs; rerun measurements and audit leakage, denominators, and reported limitations.

- [ ] Verify fresh-clone execution and rehearse the demonstration
  - **ID**: cp5-reproduction
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP5
  - **Tags**: testing, presentation
  - **Files**: `README.md`, `docs/presentation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/32
  - **Blocked by**: cp4-hand-in
  - **Acceptance**: Another team member can follow fresh-clone setup and the supported workflow; an authorized saved-video backup and honest fallback explanation are ready.
  - **Verification**: Follow setup on a clean environment and rehearse normal, failure, and backup demonstration paths.

- [ ] Complete the final report and presentation
  - **ID**: cp5-report
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP5
  - **Tags**: documentation, presentation
  - **Files**: `docs/presentation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/33
  - **Blocked by**: cp5-final-evaluation, cp5-reproduction
  - **Acceptance**: All members contribute; materials explain problem, data, approaches, results, error analysis, limitations, and contributions and map every PRD requirement to evidence or an incomplete/unvalidated state.
  - **Verification**: Cross-check each claim against final evaluation and rehearse the presentation as a team.

- [ ] Prepare Marc personal technical defense
  - **ID**: defense-marc
  - **Defense member**: Marc (@marcjustinalbertobscs)
  - **Status**: Backlog
  - **Milestone**: Defense
  - **Tags**: presentation
  - **Files**: `docs/presentation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/34
  - **Blocked by**: cp5-report
  - **Acceptance**: Marc can explain the complete workflow, personal commits, input/baseline work, results, a failure, and fallback without relying on another member.
  - **Verification**: Conduct a mock individual defense using personal contribution evidence.

- [ ] Prepare Jose personal technical defense
  - **ID**: defense-jose
  - **Defense member**: Jose (@fyodorrrrr)
  - **Status**: Backlog
  - **Milestone**: Defense
  - **Tags**: presentation
  - **Files**: `docs/presentation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/35
  - **Blocked by**: cp5-report
  - **Acceptance**: Jose can explain the complete workflow, personal commits, landmarks/pose/evaluation work, results, a failure, and fallback independently.
  - **Verification**: Conduct a mock individual defense using personal contribution evidence.

- [ ] Prepare Jeremy personal technical defense
  - **ID**: defense-jeremy
  - **Defense member**: Jeremy (@emperuna)
  - **Status**: Backlog
  - **Milestone**: Defense
  - **Tags**: presentation
  - **Files**: `docs/presentation/`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/36
  - **Blocked by**: cp5-report
  - **Acceptance**: Jeremy can explain the complete workflow, personal commits, seat/history/review work, results, a failure, and fallback independently.
  - **Verification**: Conduct a mock individual defense using personal contribution evidence.

- [ ] Review the final submission and individual defense readiness
  - **ID**: cp5-hand-in
  - **Assignee**: Unassigned
  - **Status**: Backlog
  - **Milestone**: CP5
  - **Tags**: submission
  - **Files**: `docs/checkpoints/`, `docs/presentation/`, `README.md`
  - **Issue**: https://github.com/emperuna/gaze-cv/issues/37
  - **Blocked by**: cp5-report, defense-marc, defense-jose, defense-jeremy
  - **Acceptance**: Final gates, report, demonstration, contribution evidence, and individual preparation are checked; actual submission commit is identified without claiming unsupported capabilities.
  - **Verification**: Walk through final and individual-defense gates; repository owner handles the authorized v1.0 tag and manual push.

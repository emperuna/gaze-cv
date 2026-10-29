# GAZE Product Requirements Draft

Status: Requirements for team review, with implementation evidence as of 22 October 2026. Working image/video and core session behavior are recorded in [the checkpoint report](docs/checkpoints/cp2-progress.md); final targets and academic submission are not claimed.

Implementation update, 29 October 2026: the local website now provides optional
live camera direction analysis with Start/Stop, device/method selection, and
elapsed capture timestamps. It reuses the existing head and baseline pipelines.
Camera integration checks used real models and synthetic browser media; physical
camera and three-seat checks remain unverified. This path does not implement
seat histories, event review, or recording and does not change the requirements
or acceptance gates below. See [camera use](frontend/README.md#live-camera) and
[verification evidence](docs/superpowers/specs/2026-10-29-live-camera-verification.md).

GAZE will help instructors review head movements during classroom examinations. The semester prototype will detect multiple visible faces, estimate head direction, associate observations with fixed seats, and record sustained or repeated movements. This draft translates the concept paper into project goals, user needs, and measurable requirements.

## Source documents

- `Mamaw_ConceptPaper.pdf`, pages 1–4: project scope, algorithms, data plan, responsibilities, targets, and risks.
- `Milestone 1 - Checkpoint Guide.pdf`, pages 1–3: proposal outline, feasibility evidence, repository expectations, and checkpoint dates.
- `Milestone 2 - Checkpoint Guide.pdf`, pages 1-3: reproducible environment, prepared data, preprocessing evidence, validation baseline, runnable prototype, progress report, and CP2 review gates.

These documents are the planning basis. Their descriptions of future work do not establish completed functionality or evaluation results.

## Problem and users

An instructor supervising many students cannot consistently record the frequency and duration of every sideways or downward head movement. Ordinary writing and brief turns can resemble movements that deserve closer observation.

The primary user is an instructor reviewing an examination session. Team members are secondary users who prepare data, configure thresholds, and evaluate the prototype. Students appear in the input footage; they do not need accounts or an interaction flow.

GAZE supports observation and review. It will not identify cheating, assign misconduct scores, or make disciplinary decisions.

## Goals and scope

The target prototype will:

1. Detect and distinguish at least three simultaneously visible students in a fixed seating view.
2. Classify usable observations as forward, left, right, or down.
3. Maintain movement histories associated with seats during a session.
4. Log sustained or repeated movements using adjustable rules.
5. Display annotations and provide timestamped events for review.
6. Compare a simple baseline against the main method and measure accuracy and processing speed.

The minimum fallback is multi-face detection and frame-level direction labels on prerecorded material. If seat tracking or temporal events are incomplete, the demonstration and report must identify those limitations.

### Excluded from the semester scope

- Eye gaze estimation, emotion analysis, and intent inference.
- Facial recognition, student identity databases, and identification across sessions.
- Automatic grading, disciplinary actions, or claims of cheating detection.
- Multiple cameras, moving cameras, and unrestricted classroom coverage.
- Cloud hosting, mobile clients, school system integrations, and account management.
- Training a new head-pose model from scratch.

## Proposed user workflow

1. Select a saved video; a live camera may be used if the optional camera workflow is implemented.
2. Configure the fixed seat regions and confirm that at least three faces are sufficiently visible.
3. Load or adjust direction and movement thresholds. Show their values for the session.
4. Start processing and view face regions, seat IDs, direction labels, and processing status.
5. Review timestamped movement events alongside the annotated preview.
6. Stop the session and save its configuration and event log for later review.

Saved video is the required input workflow for demonstrations, evaluation, and project completion. Live camera support is an optional extension and is not a completion gate.

The implemented website Camera mode follows a shorter direction-only flow:
choose Camera and a method, Start and grant permission, review processed frames,
then Stop. The six-step seat/event workflow above remains a separate configured
saved-video workflow; camera directions do not establish completion of it.

The website also now exposes the saved-video seat/history/event flow through
visual/numeric seat setup, adjustable movement settings, synchronized source
playback, event seeking, downloads and reopening. Technical integration checks
are recorded in [saved-review verification](docs/superpowers/specs/2026-10-29-saved-review-verification.md).
Real seat consistency, event precision/recall and writing false alerts remain
unvalidated. The [CP4 checklist](docs/checkpoints/cp4-checklist.md) maps the newer
Phase 4 hand-in instructions, including held-out evaluation, to remaining evidence.

## Functional requirements

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| FR01 | Read saved video. Live camera input is optional. | Valid saved input processes; missing files and unreadable input produce understandable errors. If the optional camera workflow is implemented, verify camera startup, stop, elapsed session time, and unavailable-camera errors separately. |
| FR02 | Detect multiple visible faces. | An annotated test clip shows at least three visible faces processed in the same frame; missed detections are included in evaluation. |
| FR03 | Produce the four direction labels using documented rules. | Labeled evaluation samples produce reproducible predictions; left and right follow a documented subject-relative convention, with preview mirroring handled explicitly. |
| FR04 | Associate detections with fixed seat IDs within a session. | A labeled multi-person clip supports measurement of ID consistency; ambiguous associations remain unassigned. |
| FR05 | Maintain per-seat direction histories using input timestamps. | History entries preserve time order, direction, and observation validity for each assigned seat. |
| FR06 | Distinguish sustained or repeated movements from brief changes in head direction. | Documented labeled sequences show brief turns, sustained turns, repeated turns, and ordinary writing; the saved configuration explains each logged event. |
| FR07 | Allow the sensitivity, minimum movement duration, repetition count, and observation period to be adjusted. | Changing configuration changes the relevant rule behavior and the session records the values used. Defaults will be tuned on development data. |
| FR08 | Show annotations and a review log. | Preview includes face regions, seat IDs where assigned, direction labels, and event timestamps; event wording describes movement without asserting misconduct. |
| FR09 | Export events and configuration locally. | Saved records can be reviewed independently and traced to the session and settings used. |
| FR10 | Handle unreliable or missing observations explicitly. | A face that disappears or loses usable landmarks becomes unknown; missing observations do not accumulate movement duration, and histories do not bridge gaps as continuous evidence. |
| FR11 | Run both methods through a common evaluation procedure. | The same held-out labeled inputs, label mapping, and failure accounting are used for baseline and main-method comparison. |

Unknown and unassigned are processing states, not extra head-direction classes. Proposed event fields are session ID, seat ID, event type, direction, start time, end time, duration, repetition count where relevant, and a reference to the configuration used. Seat IDs identify positions rather than people.

## Project organization

The project consists of session preparation, observation, movement history, and instructor review. [ARCHITECTURE.md](ARCHITECTURE.md) describes how these areas relate and who is responsible for them.

The team will compare a simple reference approach with the proposed main approach on the same labeled examples. The checkpoint report records the implemented geometric baseline and approximate PnP comparison, including their validation results and current limitations.

## Data and evaluation plan

BIWI Kinect Head Pose Database is the planned primary source for labeled head-pose images. The concept paper references <https://huggingface.co/datasets/ETHZurich/biwi_kinect_head_pose> and describes more than 15,000 images from 20 subjects. BIWI acquisition remains unverified. The implemented initial alternative is Pointing04: 240 validation images and 120 subject-separated locked test images, plus twenty permitted checked-in validation examples. See the [data card](docs/evaluation/data-card.md) for source permissions, nominal angle labels, fixed selection, and limitations.

The 20 low-resolution LFW samples described in the paper may support a toolchain smoke test. They have no ground-truth pose labels and cannot establish direction-classification accuracy or replace labeled pose data.

Before declaring the dataset ready, record the accessible source, license and redistribution conditions, acquired counts per class, annotation format, selected samples, and lighting/view limitations. Derive direction labels from pose annotations using documented angle thresholds and a rule for mixed poses, such as down-and-left. Identify validation data for baseline measurements and threshold tuning, and a locked held-out test split for final scoring. Keep the same subject and recording/source within one split. If model training is introduced, add a distinct training split without source overlap. Commit a one-page data card covering sources/licences, acquired counts per class and split, label creation/checks, image sizes, gaps, and preprocessing; retain reproducible split manifests.

Create a contact sheet of at least 20 real samples with meaningful labels. Keep smoke-test samples clearly separated from evidence for direction evaluation. Multi-student seat association and temporal rules require separate licensed or consent-based staged video with seat and movement interval annotations; BIWI alone cannot validate them.

| Measure | Target or reporting requirement |
| --- | --- |
| Head-direction accuracy | Target at least 80% on a held-out labeled set. |
| Macro-F1 and confusion matrix | Report for both methods on the same test set; no numerical macro-F1 target is specified in the concept paper. |
| Detection and pose coverage | Report eligible samples, usable predictions, and failed detections so missing predictions do not inflate results. |
| Processing speed | Target at least 10 FPS on a specified laptop; record hardware, resolution, face count, and timing scope. |
| Seat ID consistency | Measure on annotated multi-person video; define the metric before testing. |
| Event precision and recall | Measure when labeled video permits; define event matching and time tolerance before testing. |
| False alerts during writing | Report on labeled writing intervals with the amount of evaluated footage. |

Targets are proposed success criteria, not achieved results. At CP2, report reproducible validation accuracy and macro-F1, plus confusion matrix, coverage, and failures; use validation data for the CP3 comparison as well. Tune thresholds on validation data and freeze them before final held-out evaluation. The class demonstration may run a teacher-selected test image, but its output must not be used to tune settings or reported as the aggregate validation measurement. Movement duration must reflect elapsed time in the observed session, regardless of processing speed.

## Reliability and data handling

- Keep processing and storage local for the initial prototype.
- Record session settings and the approach used so evaluation results can be reproduced.
- Preserve observation gaps and assignment uncertainty in exported results.
- Keep private footage and session records out of the public repository.
- Publish only sample assets that have permission for redistribution. Record permissions separately from code licensing.
- Make recording optional; agree on access, retention, and deletion before collecting classroom footage.

## Team ownership

The following allocation records suggested focus areas from the concept paper. Shared work is not restricted to these members; any collaborator can claim an unassigned task. Individual technical defenses remain personal responsibilities.

| Owner | Modules and evidence |
| --- | --- |
| Marc Justin Alberto | Input, preprocessing, baseline, reproducible five-image spike, and output evidence. |
| Jose III Aquino | Landmark extraction, pose estimation, direction rules, and classifier evaluation. |
| Jeremy Garin | Seat association, temporal rules, preview, event exports, and integration. |
| All members | Code reviews, labeling, evaluation, documentation, presentation, and commits from individual GitHub accounts. |

## Checkpoint plan

The [development roadmap](ROADMAP.md) breaks these milestones into tasks, ownership, dependencies, and completion evidence.

The guide lists the following deadlines at 11:30 PM. It does not state a timezone; confirm the course timezone before configuring reminders or deadlines in tools. Dates below follow the supplied guide; they are not revised commitments.

| Checkpoint | Hand in by | Planned evidence | Tag |
| --- | --- | --- | --- |
| CP1 | 15 October | Nine-section proposal, acquired data, labeled 20-sample contact sheet, runnable five-image spike and screenshot, README, individual commits. | `cp1-proposal` |
| CP2 | 22 October | Pinned CPU setup, data card and source-separated splits, shared preprocessing with before/after evidence, runnable image baseline and validation results, effort-weighted report, plus GAZE three-face video/FPS evidence. | `cp2-50` |
| CP3 | 29 October | Core pose classification, seat association, and initial tests. | `cp3-core` |
| CP4 | 12 November | Temporal rules, error analysis, FPS measurements, and interface integration. | `cp4-80` |
| Final | 19 November | Team demonstration, report, reproducible execution, and individual technical defense preparation; presentations begin 20 November. | `v1.0` |

At the planning date, the guide's CP1 deadline has passed and CP2 is the next listed deadline. Actual submission status and any revised arrangements need confirmation. Create checkpoint tags on the actual hand-in commit; a tag is not evidence that missing deliverables were completed.

## Risks and fallbacks

| Risk | Response and fallback |
| --- | --- |
| BIWI cannot be acquired or redistributed as needed. | Verify access early; select an accessible labeled alternative or consent-based labeled data. Do not substitute unlabeled smoke-test images for measured accuracy. |
| Faces are too small, occluded, or poorly lit. | Test a controlled front view with three seats, sufficient resolution, and stable lighting; report the supported conditions. |
| Downward writing produces movement alerts. | Evaluate writing intervals and tune temporal rules on development data; present events as review prompts. |
| Tracking or temporal behavior cannot be validated. | Deliver the stated fallback on prerecorded input and identify the unvalidated functions. |

## Decisions requiring team confirmation

1. Confirm the accessible labeled dataset, permissions, class counts, and subject split.
2. Agree on how direction labels are interpreted, including left and right and movements in more than one direction.
3. Confirm the test laptop, saved-video resolution, and three-seat arrangement; confirm camera hardware only if the optional live workflow is pursued.
4. Agree on seat setup, handling unclear observations, and the criteria for reviewing movement events.
5. Confirm a local preview is sufficient for the course demonstration and agree on footage retention.
6. Confirm checkpoint submission status, GitHub visibility, repository license, and asset publication permissions.

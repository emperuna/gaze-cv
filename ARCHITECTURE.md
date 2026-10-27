# GAZE Project Architecture

GAZE supports classroom examination supervision by organizing visible head movements into observations that an instructor can review. This document describes the project's main areas, their relationships, and the responsibilities of the people involved.

The project has an initial CPU prototype and remains under evaluation. [PRD.md](PRD.md) defines its requirements, success targets, and checkpoint deliverables.

## People and responsibilities

| Participant | Role in the project |
| --- | --- |
| Instructor | Prepares the examination session, reviews observations, and decides whether further attention is needed. |
| Students | Participate in the examination and may appear in authorized observation footage. |
| Project team | Prepares demonstration material, develops the prototype, evaluates its limitations, and documents results. |

Movement observations support the instructor's judgment. A sideways or downward head movement alone does not establish misconduct.

## Main project areas

| Area | Purpose | Expected outcome |
| --- | --- | --- |
| Session preparation | Establish the video source, seating arrangement, and observation settings. | A session with clearly visible participants and agreed settings. |
| Head direction observation | Describe visible head orientation as forward, left, right, or down. | Direction labels associated with visible seats. |
| Movement history | Organize observations over time for each seat. | A history that distinguishes brief, sustained, and repeated movements. |
| Instructor review | Present the observed session and relevant movement events. | A labeled view and timestamped records for human review. |
| Project evaluation | Check whether the prototype meets its stated goals under documented conditions. | Results, examples of errors, and a clear account of supported use. |

## Session flow

1. The instructor or demonstrator selects prerecorded examination footage. Live camera input is an optional extension, not required for project completion.
2. The seating arrangement and observation settings are established.
3. GAZE observes visible head directions and associates them with seats.
4. Movement histories identify sustained or repeated patterns according to the session settings.
5. The instructor reviews the labeled view and timestamped movement events.
6. Session records are saved when needed for authorized review or evaluation.

If a face cannot be observed reliably, the session should show that uncertainty. An observation gap must not be presented as a continuous movement.

## Information used and produced

| Information | Project purpose |
| --- | --- |
| Camera or saved footage | Provides the examination scene to observe. |
| Seat references | Keep observations associated with fixed positions during a session. |
| Session settings | Define which movement durations and repetitions should be recorded. |
| Direction observations | Describe visible head orientation at a given time. |
| Movement events | Summarize sustained or repeated movements with timestamps. |
| Evaluation evidence | Shows performance and limitations using labeled examples. |

Seat references identify positions within a session. The project does not require recognizing a student's identity or connecting their identity across sessions.

## Scope and operating assumptions

The target demonstration uses one fixed camera with at least three clearly visible students in a stable seating arrangement. Lighting, camera position, and face visibility affect what can be observed reliably.

The intended outcome is a review aid for head movements. Eye gaze, emotion, intent, automatic misconduct decisions, and unrestricted classroom coverage are outside the project scope.

If movement histories or event review cannot be completed, the minimum demonstration will show multiple detected faces and head direction labels on prerecorded material. The project report will identify any capabilities that remain incomplete or unvalidated.

## Team organization

The following allocation records suggested focus areas from the concept paper. Shared work is not restricted to these members; any collaborator can claim an unassigned task. Individual technical defenses remain personal responsibilities.

| Member | Primary responsibility |
| --- | --- |
| Marc Justin Alberto | Input preparation, the reference approach, and the initial feasibility demonstration. |
| Jose III Aquino | Head orientation observation, direction classification, and related evaluation. |
| Jeremy Garin | Seat association, movement histories, review outputs, and overall integration. |
| All members | Development contributions, data labeling, evaluation, documentation, and presentation. |

## Project evidence and review

The concept paper establishes the proposed direction. The PRD defines what the project must deliver. Checkpoint evidence will show what has actually been completed, including sample data, demonstration outputs, measurements, and limitations. For CP2, the Milestone 2 guide requires prepared data with a data card, visible preprocessing evidence, an image-to-output prototype that another member can reproduce, validation results, and an effort-weighted progress report. The three-face video demonstration remains an additional GAZE commitment. These are planned deliverables, not completed work.

Labeled head-pose images support direction evaluation. Multi-student video is needed to evaluate seat consistency and movement histories. Ordinary writing should be included when reviewing unwanted alerts.

Use only authorized footage and respect dataset permissions. Agree on who can access session records and how long they are retained before collecting classroom footage.

## Current evidence boundary

The prototype now supports image direction observations, saved-video annotation, configured fixed seats, source-time histories, and movement-rule records. Validation images and an office video proxy establish limited technical evidence. Final held-out results, classroom event labels, writing-related false alerts, a target laptop run, and each member's own contribution/defense remain separate obligations. See [the checkpoint report](docs/checkpoints/cp2-progress.md).

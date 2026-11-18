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

1. The instructor or demonstrator selects an input. Camera alerts (pending team agreement, 18 November 2026): the main website workflow is a live fixed camera, for example a phone used as a webcam; prerecorded footage is a secondary website path and the command-line workflow. The CP5 demonstration used saved video.
2. The seating arrangement and observation settings are established.
3. GAZE observes visible head directions and associates them with seats.
4. Movement histories identify sustained or repeated patterns according to the session settings.
5. The instructor reviews the labeled view and timestamped movement events.
6. Session records are saved when needed for authorized review or evaluation.

If a face cannot be observed reliably, the session should show that uncertainty. An observation gap must not be presented as a continuous movement.

## Implemented processing paths

| Entry point | Processing path | Available outputs |
| --- | --- | --- |
| Image / directions-only video (routes kept, not reachable from the website since 18 November 2026) | Next.js upload API → `scripts/run.py` → shared head or baseline pipeline | Annotated PNG/AVI, direction counts, JSON/JSONL, run metadata. |
| Website Saved video: seat review (secondary path, **Review a recording instead**) | Visual seat/settings editor → local review API → `scripts/review_video.py` → shared video/seat/history/event modules | Source-time playback overlays, event seeking, per-seat intervals, raw JSON/AVI downloads and saved-session reopening. |
| Website Camera (main workflow, pending team agreement) | Browser capture → local camera API → persistent `scripts/camera_worker.py` → fixed Baseline pipeline → automatic seat setup → `SeatAssociator` and `MovementMonitor` → alert grouping and cropped stills | Live preview with seat boxes, per-seat alerts with one cropped still each, Checked/Dismissed marks, session record on disk (`outputs/runs/camera/<id>/session.json` and `stills/`), resume after interruption, Past sessions, PDF with alerts, stills and marks. |
| Configured saved-video command | `scripts/process_video.py` → selected pipeline → fixed-seat association → histories → optional movement rules | Annotated video, observations, seat histories, settings, and optional movement events. Head mode requires seat-bound neutral calibration. |

The Camera path was an optional direction-only extension (29 October 2026). Since
18 November 2026 (pending team agreement) it is the main workflow. The browser owns camera
permission and device selection; Python keeps the Baseline model loaded. Frames
are processed in memory, with one in flight, and are not recorded. Capture
timestamps use elapsed monotonic time. Before monitoring, the worker suggests
seats from several frames; the instructor confirms or adjusts them. While
monitoring, the same `SeatAssociator` and `MovementMonitor` used for saved video
produce left/right movement events; Node groups them into one alert per seat and
direction and saves one cropped still (at most 200 KB each) per alert. Down never alerts, and
unknown observations never accumulate. The session record, alerts, marks and
stills are written under `outputs/runs/camera/<id>/` (ignored by Git) and are
deleted only when the session is deleted. Hiding the tab or losing the camera pauses
the session as interrupted instead of ending it; Resume continues it and records
the unmonitored interval. A session is limited to three hours. Live and upload
processing share one inference reservation per local server process. Saved-video
seat review remains available as a secondary website path and from the command
line. Review sessions retain their original source, source hash,
settings and generated records locally. Only completed manifests are listed;
failed/cancelled partial files require manual cleanup. Browser review assumes
CFR, with frame-index/FPS overlays on the original source; annotated AVI remains
a download. See [session scope and checks](docs/superpowers/specs/2026-10-29-saved-review-verification.md).

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

The website review layer derives grouped queue items and frame-based seat
coverage from saved observations. Human statuses, notes, report text and local
sign-off are saved separately with revision checks; they never replace original
model records. Camera health checks remain transient; camera alerts and marks are saved in the session record.

The website's Camera and Saved video sources offer a PDF observation report (Image had one until 18 November 2026, when its website workflow was removed; its report route remains in the code). A bounded JSON report
passes through `scripts/render_incident_report.py` into the shared ReportLab
renderer in `src/gaze/incident_pdf.py`; bytes stream back as a local PDF download.
Image/directions-only runs retain completion metadata for report provenance.
The Camera PDF is built from the saved session record (alerts, their stills,
marks, notes, unmonitored intervals and per-seat coverage) through the same
renderer, which reads only `.jpg` stills inside the session folder. Before
18 November 2026 Camera kept bounded numeric summaries in an eight-session memory
cache without stills; that cache is no longer used. Reports preserve
source-specific uncertainty and human review.
See [review workload tools](docs/review-workload.md) for the implemented rules
and limitations.

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

The prototype now supports image direction observations, saved-video annotation, configured fixed seats, source-time histories, movement-rule records, and browser camera directions (dated 18 November 2026: the camera has been the main website workflow since then, with seat alerts, pending team agreement). Validation images and an office video proxy establish limited technical evidence. Camera integration was checked with both real model pipelines and synthetic browser media; physical-camera behavior and the authorized three-seat camera demonstration remain unverified. See [camera verification](docs/superpowers/specs/2026-10-29-live-camera-verification.md) and, for the later seat-alert workflow, the [camera alerts verification record](docs/superpowers/specs/2026-11-18-camera-alerts-verification.md), which lists the physical check as not performed. Final held-out results, classroom event labels, writing-related false alerts, integrated representative laptop performance, and each member's own contribution/defense remain separate obligations. See [the checkpoint report](docs/checkpoints/cp2-progress.md).

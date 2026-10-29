# Saved-video review

The user selected the integrated website workflow: upload a saved clip, draw/name
fixed seats, process, review seat directions/history and clickable movement
events, then save/reopen the session. The existing visual seat-drawing proposal
and that workflow were accepted in conversation. Implement within the current
Mac checkout under the previously approved project-local write exception.

## Approach

Extend Saved video with a seat-review mode, retaining directions-only analysis.
Reuse `process_video`, `SeatAssociator`, `HistoryTracker`, and `MovementMonitor`;
use the existing automatic head or baseline image adapter. Automatic head
directions remain camera-relative, not neutral-calibrated seat/desk directions.
The alternative was requiring JSON configurations or a separate desktop tool;
visual seat editing was selected to make the workflow demonstrable in one UI.

Seat regions are normalized, nonoverlapping fixed positions with unique IDs.
Provide pointer drawing plus keyboard-accessible numeric editing, validation,
removal, and editable IDs. Configure duration, repetition count/window, minimum
dwell, gap, mirroring, and baseline tiling before processing. Drawn pixel-space
ROIs are converted to unmirrored coordinates when mirrored input is selected.

## Session contract

Store each session in an ignored UUID directory under outputs/runs/review.
Persist the original MP4/WebM, validated settings, raw observations, histories,
events, summary, annotated AVI, and compact review JSON. Preserve source SHA256,
pipeline metadata, source-time timestamps, and measurement scope. Publish the
completed session manifest last; incomplete/failed/cancelled runs are not listed.
Use the original browser-playable video with frame-indexed canvas overlays to
avoid requiring video conversion packages; AVI remains a separate download.
Unsupported codecs require a clear conversion message. No automatic retention
cleanup, cloud storage, identity matching, or database.

Local guarded APIs accept bounded multipart input, list/reopen completed sessions,
serve a fixed artifact allowlist with path containment, and support single HTTP
byte ranges for video seeking. Processing shares the existing inference slot;
Stop/cancel, disconnect, timeout, and navigation terminate the child and release
the slot only after exit. Limit input to 64 MB, 5 minutes, and 18,000 frames;
limit review JSON to 64 MB and seats to 20 to bound memory. Processing is a
single local request, with no progress percentage or background queue.

Initial builder-review clarification (timing behavior superseded by the faculty
refinement below): CFR originally used a user-confirmed prerequisite. Both advertised and decoded limits apply;
oversized/truncated clips fail rather than publish incomplete coverage. Source
resolution is capped at 1920 × 1080 pixels (portrait allowed), output files at
512 MB checked periodically during processing. Failed/aborted output folders
remain ignored local files for manual cleanup; only the metadata-last manifest
lists a run as completed. Mirroring converts drawn source ROIs to canonical
coordinates once and converts back once for unchanged-source playback. Frame
selection uses half-open [index/FPS,(index+1)/FPS) intervals and clears outside
processed duration. Request abort is tied to component teardown; workers get
SIGTERM then SIGKILL after two seconds with a ten-minute processing timeout.

The reviewer shows video controls, matching frame seat/direction boxes, explicit
unknown/missing/ambiguous states, active review flags, per-seat history segments,
source times, settings/provenance, event filters, and event click-to-seek.
Overlays must clear outside processed frame coverage. Reopening after reload
loads saved source/records without rerunning inference. Raw records remain
independently readable downloads. Events describe movement, never misconduct.

## Verification and delivery

## Faculty setup refinement

The user subsequently approved simplifying setup for faculty: default to the
automatic head method and existing experimental movement rules; keep method,
mirroring and thresholds in collapsed Advanced settings. Show the active rule
in plain language. Seat names, remove and visual redraw stay in the main flow;
exact coordinates move into Advanced seat editing. Add Suggest seats using
stable head detections from up to five frames spread over the clip. Suggestions
never overwrite existing edits without an explicit replace action and never
constitute person tracking. Faculty confirm/correct boxes before processing.

Replace the user-attested CFR checkbox with a decoded timestamp cadence check.
Compare every decoded presentation timestamp with index/FPS, allowing up to
1.1–2 ms of quantization tolerance; reject missing, duplicate, variable or
inconsistent timing with conversion guidance. Recheck the actual processing
upload and retain diagnostics in the review record. No global ffmpeg/ffprobe
install or automatic conversion. Preparation uses the shared inference slot,
bounded local uploads and temporary cleanup, with cancellable subprocesses.
Changing a file cancels obsolete work. Existing Camera mode is unchanged.

Faculty and fixed-camera/CCTV exports are the intended operating context. Direct
CCTV/RTSP/ONVIF integration, moving-camera layouts and identity tracking are not
implemented by this refinement. A new camera angle/layout needs seat confirmation.

## Verification and delivery (continued)

Test source-time alignment, gaps, ambiguous seats, event exports, mirroring,
settings bounds, invalid/corrupt/oversized inputs, existing-output protection,
range requests, path escapes, and processing cancellation. Verify both real
models, browser drawing/numeric editing/playback/event seeking/reopening, and
existing image/camera workflows; inspect desktop/mobile. Record limitations and
create a CP4 checklist using the newly supplied Nov 12 hand-in/Nov 13 class dates,
all seven required items, ten actual test cases, and no unsupported 80% claim.
Held-out scoring, footage-label creation, report/slides authoring, recording,
submission tagging, commits, pushes, and GitHub mutations are separate actions.

Task `cp4-export-review` (#26) is open/unassigned and reports prerequisites met.
Live Project status is unavailable. No claim/status mutation is authorized.
Preserve the existing next-env.d.ts edit. Work on feat/saved-video-review, based
on the camera feature branch so existing local capabilities remain testable.

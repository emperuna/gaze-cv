# Live camera alerts: design

Status: draft for team review, 18 November 2026. Nothing here is implemented yet.

## Intent

Ocular becomes a live supervision aid. A phone mounted at the front of the room
films every seat. The instructor sits at a laptop in front, which runs Ocular and
works as an alert dashboard. When a seat shows a sustained or repeated sideways
head movement, the dashboard tells the instructor **which seat to check**, with
one cropped still image of that seat at the moment the alert fired. The
instructor looks up, decides, and marks the alert. At the end, a PDF lists the
alerts with their stills and the instructor's marks.

Why: the instructor cannot watch every seat continuously, and reviewing a
recording after the exam is too late to act. The phone is used only because it
can be mounted where it sees every seat; the laptop webcam cannot.

Head movement does not establish cheating. An alert is a prompt to look, never a
finding. That stance from the PRD stays unchanged.

## Goals

1. Camera is the main and only visible workflow in the website.
2. Live per-seat direction, using fixed seat regions drawn on a live snapshot.
3. Real-time alerts for sustained or repeated left/right movement, naming the seat.
4. One cropped still per alert, shown on the dashboard and included in the PDF.
5. The instructor can mark each alert Checked or Dismissed.
6. A session PDF with alerts, stills, marks, settings and coverage gaps.
7. Works with Mac or the ASUS Windows laptop, and an iPhone or Android phone.
8. The landing page describes the camera-and-alerts product (see Landing page).
9. The interface is as easy to use as possible, and it explains how to use it
   (see Ease of use and the how-to guide). Requested by the user.

## Non-goals

- Removing Image code. Image is **removed from the website**; its Python
  modules, scripts, API route and evaluation stay as they are.
- Changing Saved video seat review. It stays as it is today, reached through a
  secondary link (see UI changes).
- A phone web page or pairing flow (approach B below). The design leaves room
  for it later.
- Recording continuous video, or keeping any frame other than the alert stills.
- Recognising students, linking seats to names, or tracking people across seats.
- Detecting that the camera was moved during a session (see Limitations).
- Changing the direction methods' thresholds or the evaluation results. The
  movement settings (duration, repetitions, window, dwell, maximum gap) stay
  adjustable per session, as FR07 requires.

## Anti-goals

The feature fails, even if it technically works, if:

- an alert or the PDF reads as an accusation ("cheating", "suspicious", "violation");
- "down" (writing) triggers alerts;
- time without an observation counts toward a movement;
- a still of one seat shows neighbouring students more than needed;
- stills are kept, or sent, anywhere other than the laptop session folder and the
  PDF the instructor chooses to download.

## Decisions already made

| Decision | Made by |
| --- | --- |
| Camera is the main process. Image is removed from the website; its code stays. | User |
| Saved video seat review stays as a secondary "Review a recording instead" link from the Camera screen, for testing alerts on known footage and as a backup if the phone or Camo fails. | User |
| The method selector is removed. | User |
| The fixed method is **Baseline**. Head runs at ~0.95 FPS on the demo laptop, so every frame gap exceeds the 0.5 s `max_gap` and no movement event could ever fire; Baseline runs at ~3.44 FPS and scored higher on the held-out set (82.50% vs 76.67%). | Design call; the user removed the choice without objecting |
| Instructor is at a laptop at the front; an alert shows the seat to check. | User |
| The phone is the camera, mounted to see all seats; the laptop is the dashboard. | User |
| Phone connects as a webcam through an app (approach A). | User |
| One still image per alert, cropped to the seat. | User |
| Stills are included in the PDF. | User |
| Only left/right sustained or repeated events alert; down is shown but silent. | Existing rule in `MovementMonitor._review_metadata`, kept |
| The work lands **after** the 19 November CP5 demonstration, which keeps the current saved-video workflow. Tracked as `TASK.md` `post-camera-alerts`; no GitHub Issue or board change until the user authorises one. | User |
| One alert per seat and direction while it is unmarked (see Alerts). | User |
| An interrupted session can be resumed; ended sessions can be reopened from a Past sessions list (see Interruptions). | User |

## Approaches considered

**A. Phone as a webcam through an app (chosen).** An app such as Camo
(iPhone and Android, with Mac and Windows) makes the phone appear as an
ordinary camera on the laptop. The laptop browser keeps capturing through
`getUserMedia`, exactly as today's Camera mode does. New work is limited to
seats, alerts, stills and the dashboard. Costs: a third-party app on both
devices and a dependency on it for the demo. Camo's free tier is limited to
720p, which costs nothing because `camera.py` already rejects frames above
1280x720. Check before the demo whether the free tier adds a watermark.

**B. Our own phone page.** The phone opens `https://<laptop-ip>:3000/capture`,
pairs with a code and posts frames. More flexible (no app on either device),
but needs a locally trusted HTTPS certificate (phone browsers refuse camera
access over plain HTTP), a pairing step, a live result channel to the
dashboard, and a network that allows device-to-device traffic, which campus
Wi-Fi often blocks. Deferred. The dashboard must not assume the frames come
from its own browser tab forever, so B can be added as a second input.

**Rejected: running the movement rules in TypeScript.** It would duplicate
`SeatAssociator`, `HistoryTracker` and `MovementMonitor` in two languages that
could drift apart. The rules run in Python, in the existing camera worker.

## How it works

### Instructor flow

The user's requirement: setup must be no hassle. The instructor's job is to
mount and connect the camera; after that, Ocular should be ready to go.

```
1. Open /analyze. The camera last used is preselected (else pick the phone once).
2. Click Start.
3. "Getting ready…" (about 5 s, automatic):
      measures live processing speed
      finds the seats from repeated head detections
      sets the maximum gap from the measured speed
4. "Found 6 seats" with numbered boxes over the live view.
      [Start monitoring]          Adjust seats · Advanced settings (optional)
5. Dashboard: live view with seat boxes · seat grid · alert list
      Alert: "Check seat 4 · looking right · 2.4 s" + still + [Checked] [Dismiss]
6. Stop → Download PDF report → Delete session when no longer needed
```

So the normal path is three clicks: Start, Start monitoring, and Stop at the end.

**Automatic setup (design calls, following the user's no-hassle requirement):**

- **Seats** come from `review_setup.suggest_seats`, which already clusters
  repeated head detections across sampled frames into non-overlapping seat
  regions. During "Getting ready", the worker keeps 5 live frames about 1 s
  apart and runs it on them. Seats are numbered 1 to N left to right, and the
  numbers are drawn on the live view so the instructor can match them to desks.
  An empty seat, or a student who is absent during setup, is not found; the
  instructor can add it with **Adjust seats** (the existing `SeatEditor` on a
  captured frame) but does not have to.
- If no seats are found, the screen says "No students found. Check that the
  camera sees every desk and that faces are lit, then try again", with
  **Try again** and **Draw seats myself**.
- **Maximum gap** is set from the median interval between processed frames
  during "Getting ready": `max_gap` = 2.5 × that interval, rounded up to the
  next 0.25 s, at least 0.5 s and at most 1.5 s. At 3.4 FPS (0.29 s) it stays
  0.75 s; at 2 FPS (0.5 s) it becomes 1.25 s. If even 1.5 s is too small for
  the measured speed, the screen warns that alerts may not fire and suggests
  fewer detector tiles. The chosen value is shown under Advanced settings and
  recorded in the session.
- **Everything else uses defaults**: the movement rules (2 s sustained; 3 turns
  in 10 s with 0.25 s dwell), no mirroring, detector tiling 1. They sit under a
  collapsed **Advanced settings** section that the instructor never needs to open.

### Dashboard layout (sketch)

```
┌──────────────────────────────────────────────┬───────────────────────────┐
│ Live view (seat boxes, direction per seat)   │ Alerts (newest first)  🔔 │
│                                              │ ┌───────────────────────┐ │
│   [1 fwd] [2 fwd] [3 left]                   │ │ [still] Seat 4 · right│ │
│   [4 RIGHT●] [5 down] [6 fwd]                │ │ sustained 2.4 s 10:42 │ │
│                                              │ │ [Checked] [Dismiss]   │ │
├──────────────────────────────────────────────┤ └───────────────────────┘ │
│ Seat grid  1 ✓  2 ✓  3 ·  4 ⚠  5 ·  6 ✓      │ ...                       │
│ Status: 3.4 FPS · 6/6 seats observed · 12:05 │                           │
└──────────────────────────────────────────────┴───────────────────────────┘
```

The seat grid shows each seat's current direction or `unknown`. A seat with an
open (unmarked) alert stays highlighted until the instructor marks it. On a
narrow screen the alert list stacks under the live view.

### Processing path

```
Laptop browser (camera-workspace.tsx)
  getUserMedia(phone via Camo) → JPEG frame every ~100 ms, one in flight
      │ POST /api/camera/[sessionId]  {id, timestamp_seconds, image}
      ▼
Node (server-camera.ts / CameraSession) ── one JSON line ──▶ camera_worker.py
                                                              CameraProcessor.process()
                                                                pipeline.process(frame)        Baseline ImagePipeline
                                                                SeatAssociator.associate()
                                                                HistoryTracker.update()
                                                                MovementMonitor.update()
                                                                → new events with review_required
                                                                → crop seat still for each new alert
      ◀── result: detections, per-seat states, new alerts (+ still JPEG) ──
Node writes still + event to the session folder, returns result to the browser
Browser updates live view, seat grid, alert list; chimes on a new alert
```

### Python changes

- `camera_worker.py` / `gaze.camera`: after `ready`, the worker accepts one
  **session configuration** message (seats in the existing
  `session_review.validate_settings` shape, movement settings, mirrored, tile
  grid) before frames. Reuse `validate_settings` rules for seats (1 to 20,
  non-overlapping, names 1 to 40 characters) and movement ranges.
- `CameraProcessor.process()` runs `SeatAssociator`, `HistoryTracker` and
  `MovementMonitor` on each frame, using the existing elapsed capture
  timestamp. The `max_gap` check in `HistoryTracker`/`MovementMonitor` already
  makes slow or interrupted frames break continuity.
- The result adds, per frame: per-seat `{direction, reason}` and the list of
  **new** events (`MovementMonitor.update()` return value). Events with
  `review_required: true` are alerts.
- For each new alert, the worker crops that seat's ROI from the decoded frame
  with a small margin, clamped to the frame, encodes it as JPEG and returns it
  base64 in the result. **Design call:** the worker returns bytes and Node
  writes the file, so Python stays free of session storage.
- Sustained events keep extending after they fire (`end_time`, `duration`).
  The dashboard shows the duration growing while the seat stays turned; only
  the first crossing creates an alert and a still.

### Alerts

`MovementMonitor` can emit more events than an instructor should see. One
continuous turn can emit a `repeated_movement` and then a `sustained_movement`
event for the same seat and direction, and a repeated event clears its queue,
so a student who keeps turning emits again every N turns. Raw events are kept
in the record unchanged. Alerts are built on top of them:

- An **alert** belongs to one seat and one direction (left or right).
- When an event with `review_required: true` arrives and that seat and
  direction has **no open alert**, a new alert opens, and the worker crops a
  still from that frame.
- While an alert is **open** (not yet marked), further events for the same seat
  and direction join it: the alert's event list, event count and latest time
  update; no new still is taken and no new chime plays. The dashboard shows
  "Check seat 4 · right · 3 events since 10:42".
- When the instructor marks it **Checked** or **Dismissed**, it closes. The next
  qualifying event for that seat and direction opens a new alert with a new still.
- A left alert and a right alert for the same seat are separate.
- **Design call:** grouping happens in Node, which already owns the session
  record and the marks. Python returns raw events plus a still for any event
  that could open an alert; Node discards stills for events that join an open
  alert, so they are never written to disk. To keep this cheap, Python only
  crops a still when Node has told it which seat and direction pairs are open
  (sent with each frame), so normally no wasted crop is made.
- Marks attach to alerts, not raw events. The PDF lists alerts, each with its
  grouped events, first and last time, still, mark and note.

### Interruptions

Today `CameraSession` closes the worker after 15 s without frames, and a Camo
disconnect, tab reload, laptop sleep or worker crash all end the session.

- A monitored session has a state: `monitoring`, `interrupted` or `ended`.
  Anything that stops frames without the instructor pressing **Stop** moves it
  to `interrupted`. The record on disk stays as it is.
- The dashboard then shows "Monitoring stopped at 10:58. Seats and alerts are
  saved." with **Resume** and **End session**.
- **Resume** starts a new worker, sends the same seat and movement settings,
  and continues the same record, alert list and PDF. The resumed part starts
  fresh in the movement rules (history and repetition queues are empty), and
  the gap is recorded in the coverage section as "Not monitored from 10:58 to
  11:03". No movement time bridges the gap.
- Before resuming, the dashboard shows the current camera view with the saved
  seat boxes over it and asks "Do the seats still line up?" If not, the
  instructor ends the session and starts a new one.
- **End session** (or **Stop**) marks it `ended`. Marking alerts and downloading
  the PDF still work after ending.
- A **Past sessions** list on the Camera screen shows saved sessions (date,
  duration, seat count, alerts, how many are unmarked), so the instructor can
  reopen one after a restart to finish marking, download the PDF or delete it.
  A session left in `monitoring` when the server stopped is shown as
  `interrupted`.
- Deletion stays manual until the team and instructor agree a retention period.

### Node and storage

- `startCamera` keeps one processing slot and one worker. Method is fixed to
  `baseline`; `validateCameraSettings` stops accepting `head` from the UI path.
- A session folder `outputs/runs/camera/<sessionId>/` (already ignored by Git)
  holds `session.json` (settings, seats, alerts, marks, coverage gaps, start and
  end times) and `stills/<alertId>.jpg`. No other frames are written.
- New routes, following the existing patterns:
  - `PUT /api/camera/[sessionId]/alerts/[alertId]`: set `Checked` or
    `Dismissed`, with an optional short note.
  - `GET /api/camera/[sessionId]/stills/[alertId]`: serve a still to the dashboard.
  - `DELETE /api/camera/[sessionId]/record`: delete the session folder.
- The current in-memory `CameraReportLog` (30-minute expiry, eight sessions)
  is replaced for monitored sessions by the on-disk record, because an exam is
  longer than 30 minutes and the stills must survive until the PDF is made.
- **Design call:** a monitored session is limited to 3 hours. The existing
  18,000-sample cap in `CameraReportLog` covers about 88 minutes at 3.4 FPS, so
  per-frame samples in the record must be summarised (counts per minute) rather
  than kept individually. A banner warns at 2 h 45 min; at 3 h monitoring stops
  and the record is saved as ended.
- **Design call, coverage per seat:** the record keeps, for each seat, its
  observed percentage and the intervals of 2 s or more in which it was unknown
  (bounded at 200 intervals per seat, with an omitted count). This matches
  `seatCoverage` in Saved video. Frame-level gaps of 5 s or more stay as today.
- **Design call, limits:** at most 200 stills per session. After that, alerts
  still appear without a still, and the PDF says how many alerts have none. The
  PDF item cap is raised from 500 only if a session can exceed it; every alert
  that has a still appears in the PDF, so no still is kept without being reported.

### UI changes

- `analysis-modes.tsx`: drop the three-tab source switcher. Camera is what
  `/analyze` opens.
- **Saved video, secondary** (user decision): the Camera screen has a quiet
  text link, "Review a recording instead", below the setup panel. It opens
  `/analyze?mode=video`, which shows today's Saved video workspace with a
  "Back to live camera" link. **Design call:** only the seat-and-movement review
  is offered there; the directions-only video option is dropped, because the
  link exists to check alerts on known footage. **Design call:** its method
  selector is removed too and Baseline fixed, matching Camera, so a recording
  and a live session use the same rules and give comparable alerts.
- **Image is removed** (user decision). No tab, button or link leads to it;
  `/analyze?mode=image` opens Camera. **Design call:** its API route and React
  component stay in the code but unused, because deleting them is harder to
  undo and was not asked for. Removing that dead code can be a later change.
- `camera-workspace.tsx`: remove the method selector; keep mirrored input and
  detector tiling under Input settings (tiling helps small faces in a
  classroom view). Remove the "does not assign seats or detect movement
  events" disclaimer and replace it with the alert wording below.
- Seats are found automatically (see Instructor flow). **Adjust seats** opens
  `SeatEditor`, which today draws over a `<video>` source; adapt it to accept a
  still image (the captured setup frame), preloaded with the found seats. Seats
  are locked once monitoring starts; changing them requires Stop and a new
  session.
- The setup screen shows only the camera choice, Start, and then Start
  monitoring. Movement settings, mirroring and tiling live under a collapsed
  Advanced settings section.
- Alert wording: "Check seat 4: looking right for 2.4 s" or "Check seat 4:
  turned right 3 times in 10 s". Never "suspicious", "cheating" or "incident".
- Chime on a new alert, with a mute toggle. Browsers allow sound only after a
  user click, which Start monitoring provides.
- Advanced settings: the same five movement settings and ranges as Saved video
  (`session_review.validate_settings`), defaulting to `MovementSettings` except
  `max_gap`, which is set automatically from measured speed. The instructor may
  still change any of them, because FR07 requires adjustable rules; the
  maximum-gap field explains that a larger gap lets unseen moments between
  processed frames count as one continuous movement.
- Rate warning: if the median interval between processed frames over the last
  10 s exceeds the session's `max_gap`, show "Processing is too slow for
  movement alerts (x FPS). Use fewer detector tiles." Without this, alerts would
  silently never fire. The 3.44 FPS figure was measured on saved video; the live
  path adds JPEG encoding and an HTTP round trip, so the physical check must
  measure live FPS at the tiling actually used.
- Keep the existing camera health warnings (`cameraWarnings`).

### PDF

- `cameraIncidentReport` gains an alert section: seat, time, direction, type,
  duration, the instructor's mark and note, and the still.
- `incident_pdf.validate_report` / `render_incident_pdf` accept bounded images:
  JPEG only, at most 200 stills, at most 200 KB each. The report body limit
  (currently 4 MB through stdin) must be raised or stills passed by file path
  from the session folder. **Design call:** pass file paths that Python
  resolves inside the session folder only, so large reports do not go through
  JSON.
- Every page is marked "Confidential: contains images of students. Keep only as
  long as your institution allows." The existing disclaimer stays.
- Unmarked alerts are listed as "Not reviewed".

## Ease of use and the how-to guide

The user's requirement: make the interface as easy to use as possible, and
include information on how to use it. The instructor is not technical and is
supervising an exam while using it.

**Rules for every camera screen (design calls):**

- One clear next step per screen, shown as the only large primary button
  (Start → Start monitoring → Stop). Everything else is a smaller secondary
  action or sits under Advanced settings.
- Plain words only. No "ROI", "FPS", "tiling", "max gap", "worker" or "model"
  outside Advanced settings. The status line says "Running smoothly" or
  "Running slowly: alerts may be missed", not a number; the number is in
  Advanced settings.
- Every wait shows what is happening ("Starting the camera…", "Getting
  ready: looking for students…"), never a bare spinner.
- Every error says what happened and the one thing to do next, with a button
  for it where possible ("The phone camera disconnected. Reconnect it in the
  Camo app, then press Resume.").
- A step indicator at the top of setup: **1 Connect camera · 2 Find seats ·
  3 Monitor**, with the current step highlighted.
- Alerts are readable from a few steps away: large seat number, short title,
  still image; **Checked** and **Dismiss** are large buttons. Keyboard
  shortcuts on the newest open alert: `C` for Checked, `D` for Dismiss, shown
  as hints on the buttons.
- Tooltips or one-line help under any control that is not self-explanatory.
- Works with keyboard only and with a screen reader: labelled controls,
  visible focus, a live region that announces new alerts ("New alert: check
  seat 4").
- Nothing destructive happens without an in-page confirmation (Delete
  session, End session).

**How-to guide (new):**

- A **How to use Ocular** panel on the Camera screen. It opens automatically
  the first time (remembered per browser, with a try/catch around storage) and
  can be reopened any time from a **How to use** button in the screen header.
- Content, in short numbered steps with one picture-free line each:
  1. **Before the exam:** install Camo on the phone and on this laptop; connect
     them over USB or the same Wi-Fi.
  2. **Place the phone:** mount it high at the front so every desk and face is
     visible; landscape; good lighting; do not move it after setup.
  3. **Start:** choose the phone in the camera list and press **Start**.
  4. **Seats:** Ocular finds the students and numbers the seats left to right.
     Use **Adjust seats** only if a seat is missing or wrong.
  5. **Monitor:** press **Start monitoring**. An alert tells you which seat to
     look at. Look up, decide, then press **Checked** or **Dismiss**.
  6. **If it stops:** reconnect the phone and press **Resume**. Your seats and
     alerts are kept.
  7. **After the exam:** press **Stop**, download the PDF, and delete the
     session when your institution's retention period ends.
- A **Troubleshooting** section: the phone is not in the camera list; "No
  students found"; "Running slowly"; the alert sound does not play (click the
  page once, check mute); the seats no longer line up (end the session and
  start again).
- A one-paragraph **What alerts mean** note: an alert is a prompt to look, not
  a finding; down (writing) never alerts; seats are positions, not people.
- The same guide text is published in `frontend/README.md` so it can be
  printed for instructors.

## Landing page

Requested by the user: the landing page (`frontend/src/app/page.tsx` and the
illustrative example) must describe the camera-and-alerts product. **Design
call:** keep the layout, images, brand voice and section order. Change only the
copy, links and example data that are no longer true. The proposed copy below
is a starting point that the builder may polish within the same meaning.

| Where | Now | Proposed |
| --- | --- | --- |
| Hero description | "A clearer view of visible head movement. Ocular brings observations together…" | "A live view of visible head movement. Ocular watches every seat from one fixed camera and tells you which seat to check, so your judgment goes where it is needed." |
| Hero assurance | "Local processing. Human review, always." | Unchanged. |
| Input card | Image, saved video and camera icons, each linking to a mode; "An image, a saved session, or a live camera." | Phone and laptop icons, linking to `/analyze`; heading "One camera. Every seat."; text "Mount a phone at the front. Watch from your laptop." |
| Output card overline | "FROM INPUT TO OBSERVATION" | "FROM CAMERA TO ALERT" |
| Privacy card | "Processed on your computer." | "Processed on your laptop. Only alert stills are kept." |
| Local card | "Made for a closer look. Return to timestamps. Keep the surrounding context." | "A prompt, not a verdict. Each alert names a seat and keeps one still for review." |
| Workflow 01 | "Bring a session into focus." Choose an image, saved video, or live camera. | "Set up the camera." Mount a phone where it sees every seat and connect it to your laptop as a webcam. |
| Workflow 02 | "See what can be observed." … saved-video seat review … | "Mark the seats." Capture a frame and draw a box around each seat. Adjust how long or how often a turn must happen. |
| Workflow 03 | "Review the moment in context." … source timestamps … | "Check the seat, then decide." Alerts name the seat to look at. Mark each one Checked or Dismissed, then download the report. |
| Workflow links | `/analyze?mode=video` and `#example` | `/analyze` and `#example` |
| Example section link | "Explore saved-video review" → `/analyze?mode=video` | "Open the live dashboard" → `/analyze` |
| Example data (`example-moments.ts`) | Saved-video timeline with three moments | Same seats and image, reframed as a live session: seat 03's left turn and seat 04's right turn each become an illustrative "Check seat" alert; seat 01's down stays a non-alert ("Writing looks the same; down never alerts."); seat 02 stays "Out of view; gaps are never filled in." The badge stays "Illustrative example" and the footer stays "Fictional observations · not model output". |
| FAQ: saved video or live camera? | Describes three inputs; camera has no seats or recordings | Replace with "What do I need?": a laptop running Ocular, a phone on a stand, and a webcam app such as Camo on both. Add: "You can also review a recorded clip with the same seat rules." |
| FAQ: where does my footage go? | Camera frames stay in memory | "Frames are processed on your laptop and not recorded. Each alert keeps one cropped still of that seat, saved on the laptop and included in the PDF you download. Delete the session when you no longer need it, and agree on consent and retention before using Ocular with students." |
| FAQ: what does Ocular observe? | Unchanged | Unchanged. |
| FAQ: validated? | Unchanged in meaning | Add: "Alert accuracy in real classrooms has not been measured." |
| Care note | "Agree on access and retention before recording or processing a session." | "Agree on consent, access and retention before a live session. Alert stills show students." |
| Research links | CP3 results | Point "Look into the results" at the CP4 package (`docs/checkpoints/cp4-hand-in/README.md`), the current evidence. |

Wording rules from the anti-goals apply here too: no "cheating detection",
"suspicious" or "catch".

## PRD and documentation changes

These are required, and the team should agree them before merging:

- **PRD status note**: Camera with live alerts is the main workflow as of this
  change; Saved video seat review is a secondary website path; Image remains
  in code and the CLI for evaluation only.
- **FR01**: camera input is the main workflow; saved video stays supported as a
  secondary website path, by the CLI and by the evaluation scripts.
- **FR14**: PDF reports for Camera and Saved video; Image no longer has a
  website report.
- **Proposed user workflow** and the line "Saved video is the required input
  workflow…": rewrite around the camera flow above.
- **Excluded scope**, "mobile clients": clarify that a phone used as a webcam
  through a third-party app is not a mobile client.
- **New FR15, live seat alerts**: sustained/repeated left/right events on live
  input name the seat within one processed frame of the threshold crossing;
  gaps never accumulate; down never alerts; wording never asserts misconduct.
- **New FR16, alert stills**: one cropped still per alert, stored only in the
  local session folder and the PDF; deleted with the session.
- **FR13/FR14**: camera warnings include the rate warning; the camera PDF
  includes alerts, stills and marks.
- **Reliability and data handling**: replace "frames are never saved" for Camera
  with the still-retention rule, and record that consent and a retention period
  must be agreed before use with real students.
- **ROADMAP CP5**, **ARCHITECTURE** camera row, **README**, `frontend/README.md`
  and `docs/review-workload.md`: update to match.

## Constraints

- Local only; no network service beyond the laptop's own Next.js server.
- Windows ASUS (Ryzen 5 7520U) and Mac laptops; iPhone and Android phones via Camo.
- Frames at most 1280x720 (existing worker limit).
- Follow repository rules: shared behaviour in `src/gaze/`, scripts coordinate,
  project-local caches, Conventional Commits, no merge without peer review.
- The CP5 demonstration (19 November) uses saved video per the current roadmap.
  This work merges after it. PRD and roadmap changes still need the team's
  agreement before merging.

## Verification

- Python unit tests (synthetic detections, no models): session configuration
  validation; per-frame seat states; an alert fires once at the threshold and
  then extends; down never alerts; a gap above `max_gap` prevents an alert; the
  still crop is clamped and bounded.
- TypeScript tests: alert grouping (repeated then sustained in one turn gives
  one alert; events join an open alert without a new still; a new alert opens
  after marking; left and right stay separate); alert marking and revision
  handling; interruption, resume and the recorded gap; Past sessions listing,
  including a session left in `monitoring`; report building with stills; deletion.
- PDF test: stills render; limits are enforced; the confidential marking appears.
- Integration: real Baseline model with a synthetic browser stream, as in the
  existing live-camera verification.
- Repeatable alert check without a classroom: the secondary Saved video review
  checks the rules on a recording, but not the live path. To test the live path
  itself on known footage, run Chrome with `--use-fake-device-for-media-stream
  --use-file-for-fake-video-capture=<clip>.y4m` (convert a permitted
  multi-person clip, e.g. the FourPeople proxy, to Y4M first). The clip then
  appears as the camera, so the same alerts can be reproduced on known footage.
  Cross-check the alert timing against `scripts/process_video.py --events` on
  the same clip, which uses the same `MovementMonitor`.
- Physical check, recorded separately: Camo on the ASUS with one iPhone and one
  Android phone, three seated people, measured FPS, at least one sustained and
  one repeated alert, and a writing interval that produces no alert.

## Limitations to state

- Seats are regions. If the phone or stand moves, seats no longer match; the
  instructor must stop and set up again. Not detected automatically.
- Directions are camera-relative. Students near the edges may read as left or
  right while facing their own desk.
- Alert accuracy in a real classroom is unmeasured; the held-out results cover
  single-face lab images only.
- A still shows one moment and may not show what caused the alert.

## Left to the builder

- Exact component structure, CSS, and how the dashboard state is held.
- Crop margin size, JPEG quality, and still dimensions within the stated limits.
- Chime sound and the mute control's placement.
- Whether per-minute summaries are computed in Python or Node.
- File naming inside the session folder.

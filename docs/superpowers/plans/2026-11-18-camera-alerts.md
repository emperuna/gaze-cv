# Live Camera Seat Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the live camera the main Ocular workflow: automatic seat setup, real-time "check seat" alerts with one cropped still each, marking, resume, past sessions and a PDF.

**Architecture:** The browser keeps capturing frames (the phone appears as a webcam through Camo) and posts them to the local Next.js API, which forwards them to the persistent Python `camera_worker.py`. The worker now runs the existing `SeatAssociator`, `HistoryTracker` and `MovementMonitor` per frame and returns per-seat states, new movement events and seat crops. Node owns the session record on disk: it groups events into alerts, writes stills, stores marks, tracks coverage and builds the PDF.

**Tech Stack:** Python 3.12 (OpenCV, MediaPipe, ReportLab, `unittest`), Next.js 16 / React 19 / TypeScript (Node `node:test` via `--experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-11-18-camera-alerts-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Start after the 19 November CP5 demonstration, on a new branch `feat/camera-alerts` from up-to-date `main`. Never work on `main`.
- Commit steps run only after the user authorizes commits (repository rule). Conventional Commits, scope e.g. `camera`, `landing`, `docs`; body references task `post-camera-alerts`. No Claude co-author or "Generated with" lines (user's global rule).
- Method is fixed to `baseline` for Camera and Saved video in the UI. Python `head` support and the CLI stay untouched.
- Only `review_required` events (left/right sustained or repeated) create alerts. Down never alerts.
- Alert copy: "Check seat 4: looking right for 2.4 s" / "Check seat 4: turned right 3 times in 10 s" / "Check seat 4 · right · 3 events since 10:42". Never "cheating", "suspicious", "incident", "violation" or "catch" in new UI or landing copy.
- Seat ids `seat-1`…`seat-N`, numbered left to right; display as "Seat N".
- Stills: JPEG, one per alert, cropped to the seat ROI plus margin, ≤ 200 KB, ≤ 200 per session. After 200, alerts have no still.
- Session limits: warning at 2 h 45 min (9 900 s), monitoring stops at 3 h (10 800 s).
- Automatic `max_gap` = 2.5 × median processed-frame interval, rounded up to 0.25 s, clamped to [0.5, 1.5] s; `tooSlow` when the median interval exceeds 1.2 s (even the 1.5 s cap leaves no room for one late frame).
- Frames ≤ 1280×720 (existing worker limit). Files stay under `outputs/runs/camera/<recordId>/` (Git-ignored); nothing else is written.
- Run Python with the project interpreter (`.venv/bin/python` on macOS, `.venv\Scripts\python.exe` on Windows) and keep caches in `.work/` as in README.
- New frontend test files must be added to the explicit list in `frontend/scripts/run.mjs`, or `npm test` will not run them.

## Review Focus

1. **Resume changes the time base.** The browser restarts capture time at 0 on Resume. Alert, coverage and event times in the record must keep increasing in session time (previous segment end + wall-clock gap). Test in Task 5.
2. **Mirrored input.** With "camera pixels are already mirrored", seat ROIs are in subject-canonical coordinates; the still must crop the region the instructor drew, not its mirror image. Test in Task 1.
3. **Two tabs mark the same alert.** A stale revision must be refused with 409, never silently overwrite a mark or note. Test in Task 4.
4. **A still fails to write** (disk full, permissions). The alert must still appear, with "Still could not be saved", and the session continues. Test in Task 5.
5. **A frame result arrives after Stop or after the worker died.** It must not reopen an ended record or add alerts to it. Test in Task 5.

---

### Task 1: Live seat monitoring in the Python worker

**Files:**
- Create: `src/gaze/live_session.py`
- Modify: `src/gaze/camera.py` (`CameraProcessor`, `serve`)
- Test: `tests/test_live_session.py`, extend `tests/test_camera.py`

**Interfaces:**
- Produces (Python): `class LiveSeatMonitor(config: dict, mirrored: bool)`, where `config` is the normalized dict returned by `session_review.validate_settings` (reuse it with `method='baseline'`); `LiveSeatMonitor.update(timestamp: float, result: ImageResult, image: np.ndarray, open_alerts: set[tuple[str, str]]) -> dict` returning `{'seats': {seat_id: {'direction': str, 'reason': str|None}}, 'events': [event dict + optional 'still': base64 str]}`; `crop_still(image, roi, mirrored) -> bytes`.
- Produces (JSONL protocol, all on the existing stdin/stdout lines):
  - `{"type":"configure","settings":{mirrored,tileGrid,seats,movement}}` → `{"configured":true,"seats":[...]}` or `{"error":...}`. Allowed once per worker.
  - Frame message gains optional `"setup": true` (keep the decoded frame as a setup sample; keep at most 5, newest wins) and optional `"open_alerts": [[seat_id, direction], ...]`.
  - `{"type":"suggest_seats"}` → `{"suggested":true,"seats":[{id,roi}],"sampled_frames":n,"note":str}` using `review_setup.suggest_seats(samples, pipeline)`.
  - Frame result gains `"seats"` and `"events"` only after configure.

- [ ] **Step 1: Write failing tests** in `tests/test_live_session.py`, using an injected pipeline that returns scripted `FaceObservation`s (pattern from `tests/test_camera.py`):
  - `test_sustained_right_emits_one_event_with_still`: seat `seat-1` ROI `[0,0,.5,1]`, head bbox centred in it, `right` at t = 0, 0.3 … 2.1 with `max_gap` 0.75 → exactly one `sustained_movement` event with `review_required` true and a `still` that decodes as JPEG ≤ 200 000 bytes.
  - `test_no_still_when_alert_open`: same, with `open_alerts={('seat-1','right')}` → event present, no `still` key.
  - `test_down_never_has_still`: `down` for 3 s → event with `review_required` false, no `still`.
  - `test_gap_over_max_gap_prevents_event`: `right` frames 0.9 s apart with `max_gap` 0.75 → no event.
  - `test_crop_clamped_at_frame_edge`: ROI `[.9,.9,1,1]` → crop width/height > 0 and within the image.
  - `test_mirrored_crop_matches_drawn_region` (Review Focus 2): 100×100 image whose left half is white, ROI `[0,0,.5,1]`, `mirrored=True` → the decoded crop is mostly white, i.e. the crop is taken from the canonical (unmirrored) region the seat was drawn on.
- [ ] **Step 2:** Extend `tests/test_camera.py`: `test_configure_then_frames_return_seat_states`, `test_frames_before_configure_have_no_seats`, `test_second_configure_is_error`, `test_suggest_seats_uses_setup_frames` (send 5 frames with `setup: true`, then `suggest_seats`; injected pipeline returns a stable head → one suggested seat).
- [ ] **Step 3: Run** `.venv/bin/python -m unittest tests.test_live_session tests.test_camera -v`. Expected: FAIL (module/protocol missing).
- [ ] **Step 4: Implement** `LiveSeatMonitor` in `src/gaze/live_session.py`: build `SeatAssociator`, `HistoryTracker(seat_ids, movement['max_gap'])`, `MovementMonitor(seat_ids, MovementSettings(**movement))`; per update call `associate(result.detections, w, h, mirrored)`, `history.update`, `monitor.update(timestamp, directions, sources)` exactly as `video.process_video` does. Crop margin 20% of ROI width/height, clamped; resize so the long side ≤ 320 px; `cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 80])`; if > 200 000 bytes retry at quality 60, else omit `still`. When `mirrored`, the frame is canonicalised the same way the pipelines do (`image[:, ::-1]`) before cropping canonical ROI coordinates.
- [ ] **Step 5: Implement the protocol** in `gaze/camera.py`: `CameraProcessor` gains `configure(settings)`, `suggest()`, and keeps the decoded image for `update`. `serve` dispatches on `message.get('type')`; frame messages keep today's validation. Keep the docstring rule but reword it: "Never persist camera pixels; seat crops are returned to the caller."
- [ ] **Step 6: Run** the Step 3 command, then the full suite `.venv/bin/python -m unittest discover -s tests -v`. Expected: all PASS.
- [ ] **Step 7: Commit** `feat(camera): run seat movement rules and alert crops in the live worker`.

### Task 2: Node worker protocol and fixed method

**Files:**
- Modify: `frontend/src/lib/camera-contract.ts`, `frontend/src/lib/camera-session.ts`
- Test: `frontend/tests/camera.test.mjs`

**Interfaces:**
- Consumes: Task 1 protocol.
- Produces:
  - `interface CameraSettings { mirrored: boolean; tileGrid: number }` (method removed; `startCamera` always passes `--method baseline`). `validateCameraSettings` rejects any `method` other than absent or `'baseline'`.
  - `interface CameraFrame { id; timestamp_seconds; image; setup?: boolean; open_alerts?: [string, 'left'|'right'][] }`.
  - `interface LiveSeatState { direction: Direction; reason: string|null }`, `interface LiveEvent extends MovementEvent { still?: string }` (reuse `MovementEvent` from `review-contract.ts`).
  - `CameraResult` gains optional `seats?: Record<string, LiveSeatState>; events?: LiveEvent[]`.
  - `CameraSession.command<T>(message: object, timeoutMs = 30_000): Promise<T>` for `configure` and `suggest_seats`; shares the single in-flight slot with `frame()` and rejects with "A camera request is already processing." when busy.
  - `CameraSession.onExit(listener: (reason: 'stopped'|'failed', message: string) => void)`: `stopped` only when `close()` was called through Stop.

- [ ] **Step 1: Write failing tests** in `camera.test.mjs` with the existing fake `worker()`: settings with `method:'head'` throw; a frame with `open_alerts` is forwarded verbatim; `command({type:'configure',...})` resolves with the worker's `{configured:true}`; a second request while one is pending rejects; a worker crash calls `onExit('failed', …)`, `close()` calls `onExit('stopped', …)`.
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** the types and `CameraSession` changes. Responses to commands are matched by key (`configured`, `suggested`) instead of frame id.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(camera): add worker commands and fix camera method to baseline`.

### Task 3: Alert grouping, coverage and auto settings (pure logic)

**Files:**
- Create: `frontend/src/lib/live-alerts.ts`
- Test: `frontend/tests/live-alerts.test.mjs` (add to `scripts/run.mjs`)

**Interfaces:**
- Produces:
```ts
type AlertDirection = 'left' | 'right';
type AlertMark = 'Checked' | 'Dismissed';
interface LiveAlert { id: string; seatId: string; direction: AlertDirection; openedAt: number; lastAt: number;
  eventIndexes: number[]; still: string | null; stillError: string | null; mark: AlertMark | null; note: string; markedAt: string | null }
interface SeatCoverage { frames: number; observedFrames: number; gaps: { start: number; end: number }[]; omittedGaps: number; unknownSince: number | null }
interface LiveSessionRecord {
  schemaVersion: 1; id: string; state: 'monitoring' | 'interrupted' | 'ended'; revision: number;
  createdAt: string; endedAt: string | null;
  settings: { mirrored: boolean; tileGrid: number; seats: ReviewSeat[]; movement: typeof DEFAULT_MOVEMENT; maxGapAuto: boolean };
  segments: { startedAt: string; offsetSeconds: number; endSeconds: number | null }[];
  events: (MovementEvent & { segment: number })[]; alerts: LiveAlert[];
  coverage: Record<string, SeatCoverage>; minutes: { minute: number; counts: Record<string, number> }[];
  framesProcessed: number; stillsSaved: number; lastTime: number;
}
function newRecord(id: string, settings: LiveSessionRecord['settings'], now: Date): LiveSessionRecord
function openAlertKeys(record): [string, AlertDirection][]
function applyFrame(record, time: number, seats: Record<string, LiveSeatState>, events: LiveEvent[]):
  { opened: { alert: LiveAlert; still: string | undefined }[]; updated: LiveAlert[] }   // mutates record; time is session time
function markAlert(record, alertId: string, mark: AlertMark, note: string, revision: number, now: Date): LiveAlert  // throws RevisionError on stale revision, bumps revision
function chooseMaxGap(intervalsSeconds: number[]): { maxGap: number; tooSlow: boolean; medianInterval: number }
function rateWarning(intervalsSeconds: number[], maxGap: number): string | null
function alertTitle(alert: LiveAlert, events: MovementEvent[]): string
class RevisionError extends Error {}
```
- Rules (from the spec): one open alert per `(seatId, direction)`; a `review_required` event with no open alert opens `alert-<n>` (n counts from 1) and carries the event's `still`; otherwise it joins the open alert (append index, update `lastAt`, drop the still). Marked alerts are closed. Coverage: a frame where a seat is not `unknown` counts as observed; an unknown run of ≥ 2 s becomes a gap; at most 200 gaps per seat, then `omittedGaps++`. `minutes[floor(time/60)]` accumulates direction counts. Alerts beyond `stillsSaved === 200` get `still: null, stillError: 'Still limit reached'`.

- [ ] **Step 1: Write failing tests:**
  - `repeated then sustained in one turn gives one alert` (two events, same seat/direction, no mark between) → `record.alerts.length === 1`, `eventIndexes.length === 2`, `opened.length === 1`.
  - `events join an open alert without a new still` → second event's `still` ignored, `opened.length === 0`.
  - `marking closes the alert and the next event opens a new one with a still`.
  - `left and right alerts for one seat stay separate`.
  - `down event creates no alert`.
  - `stale revision is refused` (Review Focus 3): `markAlert(record, id, 'Checked', '', record.revision - 1, now)` throws `RevisionError`; record unchanged.
  - `coverage records unknown runs of 2 s or more only`; `gap list caps at 200 per seat`.
  - `chooseMaxGap`: intervals of 0.29 s → `{maxGap: .75, tooSlow: false}`; 0.5 s → `1.25`; 0.1 s → `.5`; 0.7 s → `{maxGap: 1.5, tooSlow: false}`; 1.6 s → `tooSlow: true`.
  - `rateWarning` returns null for median 0.3 s with gap 0.75, and "Processing is too slow for movement alerts (1.1 FPS). Use fewer detector tiles." for median 0.9 s with gap 0.75.
  - `alertTitle` gives "Check seat 4: looking right for 2.4 s" for one sustained event and "Check seat 4 · right · 3 events since 10:42" for three grouped events (time label via the existing `timeLabel`).
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** `live-alerts.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(camera): group live movement events into seat alerts`.

### Task 4: Session record storage

**Files:**
- Create: `frontend/src/lib/server-camera-record.ts`
- Test: `frontend/tests/camera-record.test.mjs` (add to `scripts/run.mjs`)

**Interfaces:**
- Consumes: Task 3 types.
- Produces:
```ts
const cameraRecordRoot = join(projectRoot, 'outputs', 'runs', 'camera')   // overridable root param for tests
async function createRecord(settings, root?): Promise<LiveSessionRecord>
async function loadRecord(id: string, root?): Promise<LiveSessionRecord>   // a saved 'monitoring' record not owned by the live session is returned as 'interrupted'
async function saveRecord(record, root?): Promise<void>                    // atomic temp-file + rename, like saveWorkflowFile
async function writeStill(recordId: string, alertId: string, jpeg: Buffer, root?): Promise<string>  // returns 'stills/<alertId>.jpg'; rejects non-JPEG or > 200 000 bytes
async function stillFile(recordId: string, alertId: string, root?): Promise<string>
async function listRecords(root?): Promise<{ id; createdAt; endedAt; state; seconds; seats; alerts; unmarked }[]>  // newest first
async function updateAlertMark(recordId, alertId, mark, note, revision, root?): Promise<LiveAlert>  // lock file + Task 3 markAlert; RevisionError → AnalysisError 409
async function deleteRecord(recordId, root?): Promise<void>
```
- Record ids are `randomUUID()`; reuse `validRunId` for path safety. `isActive(id)` from Task 5 decides the interrupted mapping; pass it in as a parameter to keep this module testable.

- [ ] **Step 1: Write failing tests** with a temporary root under `.work/tmp`: create → load round trip; a saved `monitoring` record loads as `interrupted` when not active; `writeStill` refuses a PNG and a 200 001-byte buffer; `listRecords` sorts newest first and counts unmarked alerts; `updateAlertMark` with a stale revision rejects with status 409 (Review Focus 3); `deleteRecord` removes the folder; ids with `..` are refused.
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** following the lock/temp/rename pattern in `server-review-workflow.ts`.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(camera): store live sessions, alerts and stills on disk`.

### Task 5: Live session orchestration and API routes

**Files:**
- Modify: `frontend/src/lib/server-camera.ts`, `frontend/src/app/api/camera/route.ts` (accept `resume`), `frontend/src/app/api/camera/[sessionId]/route.ts` (frame and Stop)
- Create routes:
  - `api/camera/[sessionId]/setup/route.ts` (POST)
  - `api/camera/[sessionId]/monitor/route.ts` (POST)
  - `api/camera/sessions/route.ts` (GET)
  - `api/camera/sessions/[recordId]/route.ts` (GET record, DELETE record)
  - `api/camera/sessions/[recordId]/end/route.ts` (POST)
  - `api/camera/sessions/[recordId]/alerts/[alertId]/route.ts` (PUT `{mark, note, revision}`)
  - `api/camera/sessions/[recordId]/stills/[alertId]/route.ts` (GET, `image/jpeg`, `no-store`)
- Remove: `api/camera/[sessionId]/report/route.ts`, `lib/camera-report-store.ts`, `CameraReportLog` wiring in `server-camera.ts` (replaced by the record; Task 6 moves the report)
- Test: `frontend/tests/camera.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces:
  - `startCamera(settings: CameraSettings, signal, resume?: string): Promise<{ sessionId: string; recordId?: string; record?: LiveSessionRecord }>`. With `resume`, loads the record (must be `interrupted`), starts a worker, sends `configure` with the saved seats and movement, appends a segment with `offsetSeconds = previous lastTime + (now - interruption wall time)`, sets state `monitoring`.
  - `POST /api/camera/[sessionId]/setup` → `{ seats, sampledFrames, note }` (forwards `suggest_seats`).
  - `POST /api/camera/[sessionId]/monitor` `{ seats, movement, maxGapAuto }` → `{ recordId, record }`: validates with `validateReviewSettings({method:'baseline', ...})`, sends `configure`, creates the record.
  - Frame route: when the session has a record, converts capture time to session time (`segment.offsetSeconds + timestamp_seconds`), sends `open_alerts` from `openAlertKeys`, calls `applyFrame`, writes each opened still with `writeStill` and increments `stillsSaved` (on failure set `stillError: 'Still could not be saved'` and continue), saves the record when alerts or events changed or ≥ 5 s since the last save, and returns `CameraResult & { alerts: LiveAlert[]; sessionTime: number; revision: number }` (no still bytes to the browser; it loads stills by URL).
  - `DELETE /api/camera/[sessionId]` (Stop) → record `ended`, `endedAt` set, saved. Worker exit for any other reason → record `interrupted`, saved. At session time ≥ 10 800 s the frame route ends the record and closes the worker with "Monitoring stopped at the 3-hour limit."
  - `isActive(recordId)` for Task 4's mapping.

- [ ] **Step 1: Write failing tests** with the fake worker and a temporary record root:
  - `monitor creates a record and frames open one alert with a stored still`.
  - `resume continues session time` (Review Focus 1): first segment ends at 30 s, resume 10 s of wall time later, a frame at capture time 1 s is stored at session time 41 s; alert `openedAt` after resume > every earlier time.
  - `still write failure keeps the alert` (Review Focus 4): make `writeStill` throw; the alert exists with `stillError` and the next frame still processes.
  - `late result after Stop is ignored` (Review Focus 5): Stop while a frame is pending, then the worker replies; the record stays `ended` with no new alert.
  - `worker crash marks the record interrupted`; `3-hour limit ends the record`.
  - `marking through the route returns 409 on stale revision`.
- [ ] **Step 2: Run** `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 3: Implement** the orchestration in `server-camera.ts` and the routes, following the existing route style (`allowLocalRequest`, `AnalysisError` status mapping, `Cache-Control: no-store`).
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(camera): add monitored live sessions, resume and alert routes`.

### Task 6: PDF with alerts and stills

**Files:**
- Modify: `src/gaze/incident_pdf.py`, `scripts/render_incident_report.py`, `frontend/src/lib/incident-report.ts`, `frontend/src/lib/server-pdf.ts`
- Create: `frontend/src/app/api/camera/sessions/[recordId]/report/route.ts`
- Test: `tests/test_incident_pdf.py`, `frontend/tests/incident-report.test.mjs`

**Interfaces:**
- Produces:
  - Report schema additions (Python validates them): optional top-level `imageRoot: str` (absolute session folder) and `confidential: bool`; `items[].image: str | None` — a path relative to `imageRoot`. Python resolves it, requires it to stay inside `imageRoot`, end in `.jpg`, be ≤ 200 000 bytes, start with JPEG magic bytes, and allows ≤ 200 images; anything else raises `ValueError`.
  - `liveSessionReport(record: LiveSessionRecord, recordRoot: string): IncidentReport` in `incident-report.ts`: one item per alert (label `alertTitle`, time "first – last", detail with type, direction, event count and seat, status = mark or "Not reviewed", notes = note, image = `still`), metadata (method Baseline, seats, movement settings, max gap and whether automatic, segments), coverage lines per seat ("Seat 3: observed 94% of processed frames; unknown 10:12–10:15"), "Not monitored from … to …" lines for resume gaps, the count of alerts without a still, and the existing disclaimer. Remove `CameraReportLog` and `cameraIncidentReport`.
  - Footer when `confidential`: "Confidential: contains images of students. Keep only as long as your institution allows."
- [ ] **Step 1: Write failing Python tests:** `test_alert_still_renders` (one small JPEG in a temp `imageRoot` → PDF bytes larger than without it); `test_image_outside_root_rejected` (`../x.jpg`); `test_png_rejected`; `test_more_than_200_images_rejected`; `test_confidential_footer_text` (extract text with `pypdf` only if already installed; otherwise assert the footer string is passed to the canvas via a patched `drawString`).
- [ ] **Step 2: Write failing TS tests:** `liveSessionReport` lists unmarked alerts as "Not reviewed", includes resume gaps and the without-still count, and sets `confidential: true`.
- [ ] **Step 3: Run** `.venv/bin/python -m unittest tests.test_incident_pdf -v` and `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 4: Implement.** In `render_incident_pdf`, draw each item's still with ReportLab `Image` scaled to at most 160 pt wide, under its item text.
- [ ] **Step 5: Run** both commands again plus `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(camera): include alert stills and marks in the session PDF`.

### Task 7: Camera setup flow (Start → Getting ready → Found seats → Start monitoring)

**Files:**
- Modify: `frontend/src/components/camera-workspace.tsx`, `frontend/src/components/seat-editor.tsx`, `frontend/src/app/analyze/workspace.css`
- Create: `frontend/src/components/camera-setup.tsx`

**Interfaces:**
- Consumes: Task 5 routes; `chooseMaxGap` from Task 3; `SeatEditor`.
- Produces: `SeatEditor` accepts `source: { kind: 'video'; url: string } | { kind: 'image'; url: string }` (image: no scrubber, no duration checks). `CameraWorkspace` phases: `idle | permission | loading | preparing | found | monitoring | interrupted | ended | stopping`.

- [ ] **Step 1:** Remove the method selector and `method` state; keep mirrored and tiling under a collapsed "Advanced settings" `<details>` together with the five movement settings (defaults from `MovementSettings`; `max_gap` filled by `chooseMaxGap` and editable, with the help text from the spec).
- [ ] **Step 2:** Remember the chosen `deviceId` in `localStorage` key `ocular.camera.device`, wrapped in try/catch; preselect it when present in the device list.
- [ ] **Step 3:** After Start and model load, enter `preparing` ("Getting ready…"): send frames as today, mark one frame per second with `setup: true` until 5 are sent, record result intervals, then `POST …/setup`. Show "Found N seats" with numbered boxes drawn on the live canvas; when N = 0 show "No students found. Check that the camera sees every desk and that faces are lit, then try again" with **Try again** and **Draw seats myself**.
- [ ] **Step 4:** **Adjust seats** captures the current canvas as a data URL and opens `SeatEditor` with `{kind:'image'}`, preloaded with the found seats. **Start monitoring** posts `…/monitor` and enters `monitoring`. If `chooseMaxGap(...).tooSlow`, show the rate warning before monitoring.
- [ ] **Step 5: Verify** `cd frontend && npm run typecheck && npm test`; then run `npm run dev`, open Chrome with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=<clip>.y4m` (FourPeople proxy converted with `ffmpeg -i <clip> -vf scale=1280:720 -pix_fmt yuv420p clip.y4m`) and confirm: three clicks reach monitoring; seats are found; a blank Y4M clip shows the "No students found" message.
- [ ] **Step 6: Commit** `feat(camera): automatic seat setup before monitoring`.

### Task 8: Monitoring dashboard

**Files:**
- Create: `frontend/src/components/camera-alerts-panel.tsx`, `frontend/src/components/camera-seat-grid.tsx`
- Modify: `frontend/src/components/camera-workspace.tsx`, `frontend/src/app/analyze/workspace.css`

**Interfaces:**
- Consumes: frame route response from Task 5; `alertTitle`, `rateWarning` from Task 3; alert PUT and still GET routes.

- [ ] **Step 1:** Live canvas draws seat boxes with "Seat N" and the seat's current direction; a seat with an open alert is highlighted.
- [ ] **Step 2:** `CameraSeatGrid`: one tile per seat with direction or "unknown", open-alert state, and a status line "x.x FPS · observed/total seats observed · elapsed".
- [ ] **Step 3:** `CameraAlertsPanel`: newest first; each alert shows still (`<img>` from the still route, or "No still: <stillError>"), `alertTitle`, time, **Checked** / **Dismiss** and an optional note; PUT with the current revision; on 409 reload the record and show "This alert changed in another tab. Check it again."
- [ ] **Step 4:** Chime on each newly opened alert using a short Web Audio tone (no asset file), with a mute toggle remembered in `localStorage` key `ocular.camera.muted` (try/catch). Banners: `rateWarning`, the 2 h 45 min warning, and the existing `cameraWarnings`. Replace the old "does not assign seats or detect movement events" disclaimer with: "Alerts are prompts to look, not findings. Head direction is not eye gaze or evidence of misconduct."
- [ ] **Step 5:** Layout stacks the alert list under the live view below 900 px; check at 400 px width that nothing scrolls sideways.
- [ ] **Step 6: Verify** with the fake-camera clip: an alert appears with a still and a chime; further turns of the same seat update it without a new still; Checked closes it; a later turn opens a new one; two tabs produce the 409 message.
- [ ] **Step 7: Commit** `feat(camera): live alert dashboard with seat grid and marking`.

### Task 9: Interruptions, resume and past sessions

**Files:**
- Create: `frontend/src/components/camera-past-sessions.tsx`
- Modify: `frontend/src/components/camera-workspace.tsx`

**Interfaces:**
- Consumes: `startCamera(..., resume)` via `POST /api/camera {mirrored, tileGrid, resume}`, session list/record/end/delete/report routes.

- [ ] **Step 1:** When frames stop without Stop (track ended, worker error, hidden tab, 15 s idle), enter `interrupted`: "Monitoring stopped at hh:mm. Seats and alerts are saved." with **Resume** and **End session**. Hidden-tab handling keeps today's camera release but no longer loses the record.
- [ ] **Step 2:** **Resume** restarts capture, shows the saved seat boxes over the live view and asks "Do the seats still line up?" (**Yes, resume** / **No, end this session**), then posts with `resume`.
- [ ] **Step 3:** `CameraPastSessions` on the idle screen: date, duration, seats, alerts, unmarked count, state; actions **Open** (alerts panel read-only except marking, **Download PDF**), **Resume** for interrupted, **Delete** with an in-page confirmation (no `confirm()`).
- [ ] **Step 4:** After Stop or End session: **Download PDF report** (`/api/camera/sessions/<id>/report`) and **Delete session**.
- [ ] **Step 5: Verify** with the fake camera: kill the dev server mid-session, restart, the session is listed as interrupted, Resume continues it and the PDF shows one "Not monitored" gap; Delete removes the folder under `outputs/runs/camera/`.
- [ ] **Step 6: Commit** `feat(camera): resume interrupted sessions and list past sessions`.

### Task 10: Source navigation and Saved video as a secondary path

**Files:**
- Modify: `frontend/src/components/analysis-modes.tsx`, `frontend/src/app/analyze/page.tsx`, `frontend/src/components/video-workspace.tsx`

- [ ] **Step 1:** `AnalysisModes`: no switcher. `?mode=video` or `?session=` → `VideoWorkspace`; everything else (including `?mode=image`) → `CameraWorkspace`.
- [ ] **Step 2:** Camera screen: text link "Review a recording instead" → `/analyze?mode=video`. Video screen: "Back to live camera" → `/analyze`.
- [ ] **Step 3:** `VideoWorkspace`: remove the method selector, fix `method` to `'baseline'`, drop the directions-only video option (seat review only).
- [ ] **Step 4:** Analyze page copy: description "Live seat alerts from one fixed camera, on your device."; heading text kept; paragraph "Start the camera, let Ocular find the seats, and check the seats it points you to."
- [ ] **Step 5: Verify** `npm run typecheck && npm test`, then in the browser: `/analyze`, `/analyze?mode=image` open Camera; the link round trip works; a saved session reopens via `?session=`.
- [ ] **Step 6: Commit** `feat(analyze): make camera the main workspace with recording review as a link`.

### Task 11: Landing page

**Files:**
- Modify: `frontend/src/app/page.tsx`, `frontend/src/lib/example-moments.ts`, `frontend/src/components/session-preview.tsx` (labels only, if needed)
- Test: `frontend/tests/example-moments.test.mjs`

- [ ] **Step 1:** Update `example-moments.test.mjs` first: moments for seat 03 (left) and seat 04 (right) have titles starting "Check seat"; seat 01's moment says down never alerts; seat 02 stays out of view. Run `npm test`, expect FAIL.
- [ ] **Step 2:** Apply the spec's Landing page table to `page.tsx` and `example-moments.ts` exactly as written there (input card icons become `Smartphone` and `Laptop` from lucide-react, all links to `/analyze`; research link to `docs/checkpoints/cp4-hand-in/README.md`).
- [ ] **Step 3: Verify** `npm test`, `npm run typecheck`, `npm run build`; open `/` at 1280 px and 400 px and check copy, links, and that no new copy uses the banned words.
- [ ] **Step 4: Commit** `docs(landing): describe live seat alerts on the landing page`.

### Task 12: Documentation and requirements

**Files:**
- Modify: `PRD.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `README.md`, `frontend/README.md`, `docs/review-workload.md`, `TASK.md`
- Create: `docs/superpowers/specs/2026-11-18-camera-alerts-verification.md`

- [ ] **Step 1:** Apply the spec's "PRD and documentation changes" list. Mark the PRD edits "Pending team agreement" in the status note until the team confirms.
- [ ] **Step 2:** Run the physical check from the spec on the ASUS laptop (Camo, one iPhone, one Android phone, three seated people) and record: live FPS at the tiling used, auto max gap chosen, one sustained and one repeated alert, a writing interval with no alert, Resume after unplugging the phone. Record anything not performed as not performed.
- [ ] **Step 3:** Update `TASK.md` `post-camera-alerts` Evidence/Remaining with commands, results and the verification file.
- [ ] **Step 4: Verify** `.venv/bin/python .github/automation.py check`, `.venv/bin/python -m unittest discover -s .github/tests -v`, `.venv/bin/python -m unittest discover -s tests -v`, `cd frontend && npm test && npm run typecheck && npm run build`, `git diff --check`. Expected: all pass.
- [ ] **Step 5: Commit** `docs(camera): record live alert workflow, requirements and verification`.

# Recording Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old Saved video review with a recording review that runs the live camera engine on a video file, shows the camera's alert cards (plus "Play this moment") and produces the same faculty PDF, and cut the words on every web screen.

**Architecture:** A new Python module reads a video file at 10 frames per second of video time and pushes each frame through the existing `CameraProcessor` (faces-and-heads setup, `LiveSeatMonitor`, head-turn fallback). A Node job streams its per-frame results into a normal camera `LiveSessionRecord` (with a `source` field), using the same record logic as live, a 30-second alert grouping rule, and the existing record folder. The UI reuses the camera's seat grid, alerts panel, past sessions and PDF download.

**Tech Stack:** Python 3.12 (OpenCV, MediaPipe, ONNX Runtime), Next.js App Router + TypeScript, `node --test`, `unittest`, ReportLab.

**Spec:** `docs/superpowers/specs/2026-11-20-recording-review-design.md`

## Global Constraints

- Branch: `feat/camera-alerts` (builds on commits `3277420` and `dffd9d6`). Never work on `main`.
- Conventional Commits, one logical change per commit; no `Co-Authored-By` or "Generated with" lines. Never stage `frontend/next-env.d.ts`, `frontend/AGENTS.md`, `docs/asus-android-camera-guide.md`, or anything under `data/raw/`, `outputs/`, `.work/`.
- Never run `npm run build` (it rewrites `frontend/next-env.d.ts`). Frontend checks: `cd frontend && npm test` and `npm run typecheck`.
- Python checks: `.venv/bin/python -m unittest discover -s tests` (2 known macOS failures: `test_data…test_manifest_preserves_object_and_resolves_image`, `test_evaluation…test_report_cannot_overwrite_inputs_even_with_explicit_flag`).
- Local only: videos and results never leave the computer. `data/raw/video/iphone/IMG_3976.mp4` is a private recording of real people: never commit, upload or publish it.
- Accepted files: `.mp4 .mov .webm .m4v`; max 2 GB; max 3 hours (10 800 s). Frames sampled every 0.1 s of video time, resized to fit 1280×720.
- Camera defaults: `min_duration 1.5`, `repetition_count 3`, `repetition_window 10`, `repeat_min_duration 0.25`, `max_gap 1.0` (fixed for recordings, frames are evenly spaced). Tiling 2. Read strong head turns on.
- Recording alert grouping: an event joins the latest unmarked alert of the same seat and direction only if `event.start_time - alert.lastAt <= 30`.
- Play window: first event of the alert, `start_time - 3` to `end_time + 3`, clamped to the video.
- Faculty are the main users: plain words. "Alerts are prompts, not proof" appears once per screen.
- Word limit (web screens: home, camera, Advanced settings, Past sessions, recording screen, How to use guide; not the PDF): at most one help line of about 12 words per section; labels/buttons 1–3 words; status lines one fragment; errors one sentence saying what to do.
- `src/gaze/session_review.py` stays (the camera uses `validate_settings`). Evaluation scripts (`scripts/process_video.py` and CP2/CP3 tools) are not changed.

## Review Focus

1. **A variable-frame-rate phone video** (iPhone MOV/MP4): sampling must use each frame's own timestamp (`CAP_PROP_POS_MSEC`), never `index / fps`, and must not reject the file for an uneven frame rate. Test: a generated video whose frames carry uneven timestamps is still sampled every ~0.1 s (Task 1).
2. **The server stopping mid-review**: the record must end up `interrupted` with its alerts so far, never stuck `monitoring`, and "Review again" must not need a new upload. Test in Task 4.
3. **A second job while one runs** (a live camera or another recording): refused with the existing "Another analysis is running" message, and the slot is released on finish, cancel and crash. Test in Task 4.
4. **An upload that is too big, the wrong type, cut off part-way, or larger than free disk space**: rejected, with no half-written folder left in Past sessions. Test in Task 3.
5. **Old camera records without `source`** and **old Saved video reviews on disk**: old camera records load, list and print exactly as before; the old review folders are simply not listed. Test in Task 3 and Task 5.

---

### Task 1: Python recording engine

**Files:**
- Modify: `src/gaze/camera.py` (split `CameraProcessor.process` into decoding plus a new `analyse`)
- Create: `src/gaze/recording.py`
- Create: `scripts/recording_worker.py`
- Test: `tests/test_recording.py`, `tests/test_camera.py`

**Interfaces:**
- Produces (Python):
  - `CameraProcessor.analyse(timestamp: float, image: np.ndarray, open_alerts: set, frame_id: int = 0, setup: bool = False) -> dict` — the body of today's `process` after JPEG decoding; `process(message)` decodes then calls it. Same response shape.
  - `gaze.recording.open_video(path) -> VideoInfo` — `VideoInfo(width, height, fps, duration_seconds)`; raises `ValueError` with a one-sentence teacher-facing message for undecodable files or duration > 10 800 s.
  - `gaze.recording.sample_frames(path, every=0.1, start=0.0) -> Iterator[tuple[float, np.ndarray]]` — yields `(video_seconds, frame_resized_to_fit_1280x720)`, using `CAP_PROP_POS_MSEC`.
  - `gaze.recording.suggest(path, processor) -> dict` — feeds frames at 0, 1, 2, 3, 4 s as setup samples, returns `{'seats', 'sampled_frames', 'note', 'preview_jpeg' (base64 of the 0 s frame), 'duration_seconds', 'width', 'height'}`.
  - `gaze.recording.review(path, processor, emit) -> None` — for each sampled frame calls `processor.analyse(t, image, set())` and `emit({'t', 'seats', 'events', 'duration'})` (events keep `still` for every left/right event); finally `emit({'done': True, 'duration': d})`.
- `scripts/recording_worker.py suggest|review --input PATH [--mirrored] [--tile-grid N] [--head-turns]`: builds the same pipelines as `camera_worker.py` (including the head fallback and `FacesAndHeads` setup); `review` reads one JSON line of settings on stdin (`{mirrored, tileGrid, seats, movement}`), configures, then writes one JSON line per frame. Errors go out as `{'error': message}` and exit code 1.

- [ ] **Step 1: Write the failing tests** in `tests/test_recording.py` using a generated 4-second 320×180 MP4 (`cv2.VideoWriter`, `mp4v`) and an injected fake pipeline like `tests/test_camera.py`'s:
  - `test_samples_every_tenth_of_a_second_of_video_time` → 40 ± 1 samples, timestamps strictly increasing, gaps ≈ 0.1.
  - `test_frames_are_resized_to_fit_1280x720` (generate a 1920×1080 clip of 1 s).
  - `test_uneven_frame_times_are_sampled_by_their_own_timestamps` (write frames at 30 fps but patch `CAP_PROP_POS_MSEC` reads via a fake capture to be uneven) → no `ValueError`, samples follow the given times.
  - `test_suggest_uses_frames_at_0_to_4_seconds_and_returns_a_preview`.
  - `test_review_emits_one_line_per_frame_then_done` and `test_review_events_carry_their_still`.
  - `test_unreadable_or_too_long_videos_are_refused` (text file renamed `.mp4`; a fake info of 10 801 s).
  - In `tests/test_camera.py`: `test_analyse_matches_process_for_the_same_frame`.
- [ ] **Step 2: Run** `.venv/bin/python -m unittest tests.test_recording tests.test_camera -v` — Expected: FAIL (`No module named gaze.recording`, `analyse` missing).
- [ ] **Step 3: Implement** `analyse`, `gaze/recording.py`, and the worker script.
- [ ] **Step 4: Run** the same command — Expected: PASS. Then check the worker on the real clip: `.venv/bin/python scripts/recording_worker.py suggest --input data/raw/video/iphone/IMG_3976.mp4 --tile-grid 2 --head-turns | head -c 300` → JSON with 2 seats.
- [ ] **Step 5: Commit** `feat(recording): review a video file with the live camera engine`.

### Task 2: Shared frame recording and 30-second grouping

**Files:**
- Modify: `frontend/src/lib/live-alerts.ts`, `frontend/src/lib/server-live-session.ts`
- Test: `frontend/tests/live-alerts.test.mjs`, `frontend/tests/camera.test.mjs`

**Interfaces:**
- Produces:
  - `applyFrame(record, time, seats, events, options?: { groupWithinSeconds?: number })` — without the option, today's live behaviour; with it, the 30-second rule from Global Constraints.
  - `recordFrame(record, time, seats, events, opts: { recordOptions: RecordOptions; groupWithinSeconds?: number }) -> Promise<{ opened, updated }>` exported from `server-live-session.ts`: `applyFrame` plus still writing exactly as in `LiveCamera.process` today. `LiveCamera.process` calls it (behaviour unchanged).
- [ ] **Step 1: Write failing tests:** `applyFrame groups recording events within 30 s and opens a new alert after a longer pause` (events at 0 s, 20 s, 70 s same seat/direction → 2 alerts, first with 2 events); `without the option live grouping is unchanged` (existing tests keep passing); `recordFrame writes the opening event's still and never stores base64 in the record`.
- [ ] **Step 2: Run** `cd frontend && node --experimental-strip-types --test tests/live-alerts.test.mjs tests/camera.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `refactor(camera): share frame recording and add recording alert grouping`.

### Task 3: Recording source, upload and storage

**Files:**
- Modify: `frontend/src/lib/live-alerts.ts` (record type), `frontend/src/lib/server-camera-record.ts`
- Create: `frontend/src/lib/server-recording-files.ts`
- Test: `frontend/tests/recording-files.test.mjs`, `frontend/tests/camera.test.mjs`

**Interfaces:**
- Produces:
  - `LiveSessionRecord.source?: { kind: 'recording'; filename: string; durationSeconds: number; video: string }` (`video` is the file name inside the session folder, e.g. `recording.mp4`). Absent = live camera.
  - `RecordSummary` gains `recording: { filename: string; durationSeconds: number } | null`.
  - `saveUpload(body: ReadableStream<Uint8Array>, filename: string, opts: { root?: string; maxBytes?: number; freeBytes?: () => Promise<number> }) -> Promise<{ draftId: string; path: string }>` — streams to `<root>/<draftId>/recording<ext>` with a `draft.json` marker; rejects wrong extension, over 2 GB, or less free disk than the upload's declared size + 1 GB (400/413/507), deleting the folder on any failure.
  - `draftVideo(draftId, opts) -> Promise<string>` (path); `discardDraft(draftId, opts)`; `pruneDrafts(opts, maxAgeMs = 86_400_000)`.
  - `listRecords` skips folders without `session.json` (drafts); `deleteRecord` removes the video too (whole folder, as today).
- [ ] **Step 1: Write failing tests:** upload saves the stream and a draft; wrong extension refused; over the limit refused mid-stream and folder removed; low disk refused; a cut-off stream leaves nothing; drafts are not listed; old records without `source` list with `recording: null`; prune removes day-old drafts only.
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/recording-files.test.mjs tests/camera.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` — Expected: all pass.
- [ ] **Step 5: Commit** `feat(recording): store uploaded recordings with camera sessions`.

### Task 4: Recording job and API

**Files:**
- Create: `frontend/src/lib/server-recording.ts`
- Create routes: `frontend/src/app/api/recordings/route.ts` (POST upload → suggest), `frontend/src/app/api/recordings/[draftId]/start/route.ts`, `frontend/src/app/api/camera/sessions/[recordId]/cancel/route.ts`, `.../again/route.ts`, `.../video/route.ts`, `.../preview/route.ts`
- Test: `frontend/tests/recording.test.mjs`

**Interfaces:**
- Consumes: Task 1 worker CLI; Task 2 `recordFrame`; Task 3 storage; `acquireProcessingSlot`; `workerArgs`-style args builder.
- Produces:
  - `recordingArgs(mode: 'suggest' | 'review', input: string, settings: CameraSettings, headModelReady: boolean): string[]`.
  - `suggestRecording(draftId, settings, opts) -> Promise<{ draftId, seats, sampledFrames, durationSeconds, width, height }>` (writes `preview.jpg` into the draft folder).
  - `startRecordingReview(draftId, body: { seats, movement, exam }, opts) -> Promise<{ recordId }>` — turns the draft into a record (same id; `source` set; `state: 'monitoring'`; `movement.max_gap` forced to 1.0; `maxGapAuto: false`), acquires the processing slot, spawns `review`, applies each line with `recordFrame(..., { groupWithinSeconds: 30 })`, saves at most every 5 s and at the end (`state: 'ended'`). Worker exit without `done` → `state: 'interrupted'`, `interruptedAt` set, saved. Slot released in every case.
  - `cancelRecordingReview(recordId)` — stops the job if running, deletes the folder.
  - `reviewAgain(recordId)` — only for `ended`/`interrupted` recordings: clears events, alerts, coverage, minutes, stills, counters; same video; restarts the job.
  - Video route: range requests via `parseRange` from `media-range.ts`; content types `video/mp4`, `video/quicktime`, `video/webm`, `video/x-m4v`.
  - Progress is read from the record (`lastTime / source.durationSeconds`) via the existing `GET /api/camera/sessions/[recordId]`.
- [ ] **Step 1: Write failing tests** with a fake worker (a `PassThrough`-based child like `tests/camera.test.mjs`): lines become events/alerts with 30-s grouping and stills; `done` ends the record and releases the slot; a crash before `done` leaves `interrupted` with alerts kept; a second start while running → 409 "Another analysis is running"; cancel kills and deletes; review again clears and restarts without a new upload; video route serves byte ranges; `max_gap` is 1.0 whatever the body says.
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/recording.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: pass.
- [ ] **Step 5: Commit** `feat(recording): run a recording review job and its API`.

### Task 5: Faculty report for recordings

**Files:**
- Modify: `frontend/src/lib/faculty-report.ts`, `src/gaze/faculty_pdf.py`
- Test: `frontend/tests/faculty-report.test.mjs`, `tests/test_faculty_pdf.py`

**Interfaces:**
- Produces: for records with `source.kind === 'recording'`:
  - `date` = `Recording: <filename>`; `timeRange` = `<length>` (e.g. `35 s`, `45 min`), or `reviewed 12:30 of 45:00` when interrupted.
  - All alert, seat and timeline times as video times `m:ss` / `h:mm:ss` via `videoTime(seconds: number): string`; alert `time` adds "in the video" once in the rule line, not per alert.
  - Faculty object gains optional `offLabel` (`'not reviewed'` for recordings, absent for live). `faculty_pdf.py` uses it in the at-a-glance tile and timeline legend, defaulting to today's "camera off" text; the unprocessed rest of an interrupted recording is the off span. A finished recording has none.
  - `sessionLine` for recordings: `Session details for your records: session <8 chars> · recording <filename> · alert rules: …`.
- [ ] **Step 1: Write failing tests:** recording header and video times; interrupted recording shows the unreviewed rest with "not reviewed"; live records unchanged (existing tests); PDF draws `offLabel` when given and "camera off" when absent.
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/faculty-report.test.mjs` and `.venv/bin/python -m unittest tests.test_faculty_pdf` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both suites — Expected: pass.
- [ ] **Step 5: Commit** `feat(recording): faculty report with video times`.

### Task 6: Recording screen

**Files:**
- Create: `frontend/src/components/recording-workspace.tsx`, `frontend/src/components/moment-player.tsx`, `frontend/src/lib/recording-flow.ts`
- Modify: `frontend/src/components/analysis-modes.tsx` (`?mode=video` and `?recording=<id>` open the recording screen), `frontend/src/components/camera-alerts-panel.tsx` (optional `videoUrl` → "Play this moment"), `frontend/src/components/camera-past-sessions.tsx` (recording rows: "Recording · <filename>"; interrupted recordings offer **Review again**, not Resume; opening one goes to `?recording=<id>`), `frontend/src/app/globals.css` or the workspace stylesheet
- Test: `frontend/tests/recording-flow.test.mjs`, `frontend/tests/camera-past-sessions*.test.mjs` if present

**Interfaces:**
- Consumes: Task 4 API, camera `CameraAdvancedSettings`, seat editor, `CameraAlertsPanel`, `PdfReportDownload`, exam details `<details>`.
- Produces: `recording-flow.ts` pure helpers: `playWindow(event, durationSeconds) -> { start, end }`; `progressText(lastTime, duration) -> 'Reviewing… 12:30 of 45:00'`; `recordingStep(state) -> 'choose' | 'finding' | 'seats' | 'reviewing' | 'done' | 'stopped'`; `acceptedFile(file) -> string | null` (null = ok, else one-sentence error).
- Screen steps exactly as the spec's "What the teacher does"; progress polled every 1 s; alerts shown when done; "This video can't play in this browser." when the `<video>` errors; Cancel asks first.
- [ ] **Step 1: Write failing tests** for the four helpers (window clamped at 0 and at duration; progress text formats; steps; file checks for extension and 2 GB).
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/recording-flow.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** helpers and components.
- [ ] **Step 4: Run** `npm test && npm run typecheck` — Expected: pass. Then run the app (`npm run dev` already running on :3000), upload `IMG_3976.mp4`, and confirm: 2 seats on the preview, review completes, alerts with photos play their moment, PDF downloads.
- [ ] **Step 5: Commit** `feat(recording): recording review screen with play this moment`.

### Task 7: Remove the old Saved video review

**Files:**
- Delete: `frontend/src/components/video-workspace.tsx`, `review-workflow-panel.tsx`, `session-player.tsx` (and `session-preview.tsx` if only they use it), `frontend/src/app/api/review/**`, `frontend/src/lib/server-review.ts`, `server-review-workflow.ts`, `review-workflow.ts` (if unused after), `frontend/tests/review.test.mjs`, `review-workflow.test.mjs`, `scripts/review_video.py`, `scripts/prepare_review.py`, and their Python tests if any — each only after `grep` shows no other user.
- Modify: `README.md`, `frontend/README.md`, `ARCHITECTURE.md`, `docs/review-workload.md`, `scripts/README.md` (describe the recording flow; old reviews under `outputs/runs/review/` are kept but not listed).
- [ ] **Step 1:** `grep -rn` each file's exports/names across `frontend/src`, `frontend/tests`, `src`, `scripts`, `tests`; record any remaining user in the ledger and keep that file.
- [ ] **Step 2:** Delete, update docs, run `npm test && npm run typecheck`, the Python suite, `python .github/automation.py check` (local links) — Expected: pass (2 known Python failures).
- [ ] **Step 3: Commit** `refactor(review): remove the old saved video review`.

### Task 8: Fewer words on every web screen

**Files:**
- Modify: `frontend/src/app/page.tsx` (home), `frontend/src/components/camera-workspace.tsx`, `camera-setup.tsx`, `camera-alerts-panel.tsx`, `camera-past-sessions.tsx`, `camera-guide.tsx`, `recording-workspace.tsx`, `frontend/src/lib/camera-messages.ts`, `camera-dashboard.ts`, `camera-sessions.ts` (texts), and tests asserting old text.
- [ ] **Step 1:** List every visible string per screen (a quick script printing JSX text and message constants) into the ledger with its word count.
- [ ] **Step 2:** Rewrite to the Word limit rules; move longer explanations into the How to use guide, itself trimmed to short numbered steps; keep the "prompts, not proof" line once per screen.
- [ ] **Step 3:** Update tests that assert old wording; `npm test && npm run typecheck` — Expected: pass.
- [ ] **Step 4:** Screenshot home, camera (idle, monitoring with alerts), Advanced settings, Past sessions, recording (seats, progress, done) at 1280 and 400 px wide with the headless-Chrome driver; check nothing is cut off.
- [ ] **Step 5: Commit** `style(ui): cut on-screen text to short labels and one-line hints`.

### Task 9: End-to-end verification

- [ ] **Step 1:** Replay `data/raw/video/iphone/IMG_3976.MOV` (the original; the `.mp4` is a darker HDR re-encode, see the spec) through the recording API (script or UI). Expected: 2 seats; left/right events for seat 2 starting near 0.0, 6.7, 12.1 and 27.7 s (±0.5 s); none for seat 1; 2 alerts after 30-s grouping; PDF renders with video times.
- [ ] **Step 2:** Run the permitted stock videos (`data/raw/video/pexels/6672299-exam.mp4`, `8419341-classroom.mp4`, `data/raw/video/FourPeople_1280x720_60.webm`): seats found and alert counts recorded in the ledger, with processing time vs video length.
- [ ] **Step 3:** Full suites: `npm test`, `npm run typecheck`, Python suite, `git diff --check`.
- [ ] **Step 4:** Report results, limitations (ASUS speed untested, HEVC playback on Windows) and anything deferred.

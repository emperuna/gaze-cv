# Recording review: the camera flow, fed from a video file

## Why

"Review a recording instead" runs a separate, older system. On the user's iPhone test
video it found no faces in any of 1045 frames: it runs the face model at 1 detector tile
(the live camera uses 2), with its own older rules (0.25 s gap, 2 s turn) and none of the
live fixes (face dropouts, nearest seat, strong head turns, heads in setup). Its screen is
also long and wordy: review queue, filters, an editable summary, many explanations.

Faculty are the main users. The user wants a recording to work like the live camera, with
far fewer words on screen.

## Goals

- A recording goes through the exact live engine: same seat finding, same per-seat rules,
  same alerts and photos, same faculty PDF, same Past sessions list.
- The screen looks and reads like the camera screen: a few steps, one button at a time.
- Each alert from a recording can play the few seconds around it.
- Fewer words on every Ocular screen (see "Word limit").

## Non-goals

- Changing the evaluation scripts (`scripts/process_video.py` and the CP2/CP3 evidence
  tools). They keep their own pipeline and settings.
- Converting video formats in the app (no ffmpeg dependency).
- Recognising people or following them between seats.

## Approaches considered

- **A. A recording is a camera session whose frames come from a file (chosen).** One engine
  for live and recordings; a fix to one is a fix to both.
- B. Keep the old review engine; change its defaults and simplify its screen. Less work, but
  the two engines drift apart again, which caused today's failure.
- C. Play the file into the browser as a fake camera. Least code, but takes as long as the
  video and needs the tab open throughout.

The user chose A, with a "Play this moment" button on each alert.

## What the teacher does

1. Camera page → **Review a recording**. Choose a file (MP4, MOV, WebM, M4V; up to 2 GB
   and 3 hours).
2. **Finding seats**: the first seconds of the video are sampled exactly like Getting ready
   (5 frames, 1 s apart, faces and heads). The seats show on that frame of the video.
   **Adjust seats** works as on the camera. Optional collapsible **About this exam**.
3. **Start review**. A progress bar: "Reviewing… 12:30 of 45:00". The teacher can leave the
   page; processing continues on this computer. **Cancel** (after a confirm) stops and
   deletes the session, its video and photos.
4. When it finishes: the same alerts panel as live. Each card: photo, title, time in the
   video ("at 12:34"), **Play this moment**, Checked / Dismiss, note.
5. **Download PDF report**: the same faculty PDF, with video times instead of clock times.
6. The session is listed in **Past sessions** as "Recording · <filename>". Deleting it
   deletes its video, photos and record.

## Design

### Processing (server)

- The Python camera worker gets a recording mode: it opens the video file itself, takes
  frames at 10 per second of video time (the live rate), resizes them to fit 1280×720 as
  the browser does, and runs each through the same `CameraProcessor` (seat finding with
  faces and heads, `LiveSeatMonitor` with nearest seat and the head-turn fallback,
  `live_thresholds`). Frame timestamps are video time.
- Results stream back to Node, which applies them with the same record logic as live
  (`applyFrame`, still writing, saving), driven by the server, not the browser. Speed is
  whatever the computer manages: about 14 processed frames per second on the M-series Mac
  measured today, so roughly 0.7× the video's length; slower on the ASUS.
- Movement rules and the maximum gap use the camera defaults (1.5 s turn, 3 turns in 10 s,
  max gap 1 s because frames are evenly spaced). Advanced settings (mirroring, tiling, read
  strong head turns, rules) are the camera's.
- One processing job at a time, sharing the existing processing slot with the live camera
  (a live session and a recording cannot run together).
- If the server stops mid-review (crash, laptop closed), the session is saved as
  **interrupted** with its alerts so far. Past sessions shows it as "Stopped at 12:30 of
  45:00", its alerts can be marked and its PDF downloaded (the PDF says how far the review
  got). **Review again** reuses the stored video (no new upload), wipes that record's
  alerts and photos, and processes from the beginning. *(Designer's call.)*

### Alert grouping for recordings

Live groups every event of a seat and direction into one alert until the teacher marks it.
A recording is processed with nobody marking, so that rule would turn a whole exam into one
alert per seat and direction. For recordings, an event joins the seat-and-direction's latest
alert only if it starts within **30 seconds** of that alert's last event; otherwise it opens
a new alert with its own photo. (Builder's call to adjust the number if tests show a reason.)

### Record and files

- Same `LiveSessionRecord`, stored with camera sessions, plus a source field:
  `{ kind: 'recording', filename, durationSeconds }` (live records have no field, or
  `{ kind: 'camera' }`). Old live records keep working.
- The uploaded video is kept in the session folder and served with range requests (the
  existing `media-range` helper) for playback.
- Upload is streamed to disk (not held in memory), capped at 2 GB, rejected early when the
  disk lacks space.

### Play this moment

- Plays from 3 s before the alert's first event (the one its photo shows) to 3 s after that
  event ends, in a small player in the card. Grouped alerts play their first event.
- If the browser cannot play the file's format (e.g. HEVC on some Windows PCs), the card
  keeps the photo and says "This video can't play in this browser."

### PDF

- Same faculty layout. Header: "Recording: <filename> · <length>" instead of the live time
  range; alert and timeline times as video times ("12:34"). An interrupted review's PDF
  shows the unprocessed rest of the video where live shows "camera off", labelled
  "not reviewed (review stopped)". A finished review has none.

### What is removed

- The old Saved video review screen and everything only it uses: its components
  (video workspace, review workflow panel, session player), its API routes under
  `api/review`, its server modules, its tests, and its web-only Python scripts
  (`scripts/review_video.py`, `scripts/prepare_review.py`) if nothing else uses them.
  Existing saved reviews stay on disk under `outputs/runs/review/` but are no longer listed.
- README, ARCHITECTURE and `docs/review-workload.md` are updated to describe the new flow.

## Word limit (all Ocular screens)

The user finds the UI far too wordy ("its too much"). Scope *(designer's call)*: every web
screen: home page, camera screen (setup, monitoring, alerts, Advanced settings), Past
sessions, the recording screen, and the How to use guide (which itself is trimmed to short
steps). Not the PDF, whose wording was designed separately for faculty. Rules:

- A section has at most **one short line** of help (about 12 words). Longer explanations
  move into the **How to use** guide.
- Buttons and labels are 1–3 words. Status lines are one fragment ("Reviewing… 12:30 of 45:00").
- No repeated disclaimers on the working screens. The "alerts are prompts, not proof" line
  appears once per screen; the full wording stays in the guide and the PDF.
- Advanced settings keep a one-line hint per setting, no paragraphs.
- Error messages say what to do in one sentence.

## Starting point

Build on `feat/camera-alerts` after the two pending live changes are committed (head-turn
fallback during monitoring; faces and heads in seat setup). The recording engine depends on
both.

## Constraints

- Local-only: video and results never leave the computer.
- Faculty are the main users: plain words, no technical terms on screen.
- Head movement is not evidence of cheating; the teacher decides. Keep that wording once.
- 3-hour limit per session, as for the camera.

## Left to the builder

- Exact component split and route names; how the worker reports progress.
- The upload transport details and disk-space check.
- The final wording, within the word limit.

## Verification

- Unit tests: recording-mode worker on a short generated video (seats, events, progress,
  end); 30-second grouping; record source field and old records; upload limits and wrong
  formats; play window; PDF video times.
- The user's iPhone test video, `data/raw/video/iphone/IMG_3976.MOV` (git-ignored, private:
  never commit or upload it; the same applies to its `.mp4` copy). Baseline: replaying it through `LiveSeatMonitor` at 10 frames
  per second with the head-turn fallback gives these left/right **events** for the turning
  student (seat 2): sustained left from 0.0 s, right from 6.7 s, left from 12.1 s, right from
  27.7 s, and none for the typing student (seat 1). The recording review must produce the
  same events (start times within about 0.5 s). Alert count then follows the 30-second rule
  (here 2: one left, one right), not a fixed number.
- Known limitation: `IMG_3976.mp4` is a macOS avconvert re-encode whose HDR tone mapping makes
  it darker, and it loses the 27.7 s turn; HDR tone-mapped re-encodes can lower detection.
- The permitted classroom and exam test videos: seats found and a sensible alert count.
- Full Python and frontend suites; manual run through the website and PDF.

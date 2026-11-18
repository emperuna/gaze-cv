# Camera alerts verification record

Date: 18 November 2026. Branch `feat/camera-alerts`, commits `df29d29..HEAD`
(24 commits, `e22f853` to `ebc1a88`, plus the documentation commit that adds this record). Task: `post-camera-alerts` in
[TASK.md](../../../TASK.md). Design:
[camera alerts design](2026-11-18-camera-alerts-design.md).

This record states what was checked and what was not. The PRD changes are
pending team agreement and the CP5 demonstration (19 November) used the earlier
saved-video workflow. Alerts are prompts to look; head movement does not establish
cheating. No alert accuracy, classroom performance or live speed on the ASUS
laptop is claimed here. The 80% accuracy and 10 FPS values remain targets.

## Environment

macOS (Darwin) laptop, project `.venv`, Node/npm in `frontend/`, Google Chrome
headless. This is not the ASUS Ryzen 5 7520U laptop named in the design.

## Automated checks run for this record

Run from the repository root on 18 November 2026, after the documentation changes.

| Command | Result |
| --- | --- |
| `.venv/bin/python .github/automation.py check` | Passed: Python syntax, local document links, conflict markers and task dependencies checked. |
| `.venv/bin/python -m unittest discover -s .github/tests -v` | 16 tests, OK. |
| `.venv/bin/python -m unittest discover -s tests -v` | 189 tests, 2 failures: `test_data.DataTests.test_manifest_preserves_object_and_resolves_image` and `test_evaluation.MetricsTests.test_report_cannot_overwrite_inputs_even_with_explicit_flag`. Both are a pre-existing macOS `/private/var` temporary-path quirk, not related to this work, and were not fixed. All other tests pass. |
| `cd frontend && npm test` | 124 tests, 124 pass, 0 fail. |
| `cd frontend && npm run typecheck` | Passed (exit 0). |
| `cd frontend && npm run build` | Passed (exit 0), including all `/api/camera/...` routes. One existing Turbopack warning about dynamic filesystem access tracing. `frontend/next-env.d.ts` was copied to `.work/tmp/next-env.d.ts.bak` before the build and restored afterwards; `cmp` confirmed it byte-identical. |
| `git diff --check` | Run before commit; see the task report. |

Limits: unit tests use synthetic detections and temporary directories. They do not
use a physical camera and do not measure accuracy.

## Automated browser checks done during implementation

These were run by the implementers with headless Chrome using Chrome's fake
camera (`--use-fake-device-for-media-stream --use-file-for-fake-video-capture`),
a scratch DevTools-protocol script, the project `.venv` OpenCV for Y4M conversion
and the existing local development server. They are recorded in the task reports
under `.superpowers/sdd/2026-11-18-camera-alerts/` (local working notes) and are
not repeatable from a committed script.

- Seat finding, FourPeople proxy at detector tiling 2 (task 7): 4 seats found
  about 6 s after Start, numbered left to right; Start monitoring, then Stop saved
  the session (three clicks on the normal path). Measured 7.4 frames per second
  on this Mac, giving an automatic maximum gap of 0.5 s. At tiling 1 the Baseline
  found no heads on this clip (confirmed in Python), so the default tiling was
  changed to 2.
- Alerts, local Pexels 8419341 classroom clip converted to Y4M (task 8): an alert
  "Check seat 2: looking right" appeared with its still and one chime (counted by
  instrumenting the oscillator); a later alert for seat 1; repeated events joined
  an open alert with no second chime or still; pressing `C` marked the newest
  alert Checked; a later turn opened a new alert; a mark from another client
  followed by `D` produced the "changed in another tab" message and a reload;
  Stop saved the record (state `ended`). The newest alert's controls were visible
  without scrolling at 1366x768 and 1440x900, and there was no sideways scroll at
  400 px.
- Interruption and resume (task 9): killing the worker mid-session showed the
  interrupted view; Resume with the saved seats gave monitoring with two segments
  and the same alerts; a hidden tab left the record `interrupted`, not ended; the
  PDF contained one "Not monitored from A to B" line per interruption; killing
  the development server left the file `monitoring`, and after restart Past
  sessions showed it Interrupted and Resume then Stop ended it; Delete removed the
  folder.
- Alert timing cross-check against `scripts/process_video.py --events` on the same
  clip was a design step; the task reports do not record a completed numerical
  comparison of the two, so it is treated as not completed here.
- Landing page (task 11): 1280 px and 400 px layouts without horizontal scroll;
  a banned-word scan found no misconduct wording; clicking an example moment
  updates its text.

Limits of these checks: a fake camera replaying a local clip is not a phone or
Camo; the clips are not a three-person classroom exam; headless Chrome cannot show
whether the chime is audible; only a loop of 7-10 s of footage was used; no
assistive technology was used. They show the code paths run, not that alerts are
correct in a real room.

## Material decisions made during implementation

- Work was done on `feat/camera-alerts` in the main checkout and started before
  CP5 ended, with the user's agreement; `main` was untouched for the demonstration.
  Nothing was pushed, merged or filed as an Issue.
- Default detector tiling is 2, not 1: the Baseline found no heads on the
  four-person proxy at 1, and CP4's 3.44 FPS was measured at tile grid 2.
- Saved video stays as a secondary website path ("Review a recording instead");
  Image is removed from the website but its code and routes are kept.
- Live marks go through the in-memory record of an active session; the on-disk
  mark route refuses an active record (409). Saves share one per-record lock and
  a revision check.
- Hiding the tab or losing the camera pauses a session (interrupted, resumable)
  and does not end it; Stop is irreversible and has no confirmation.
- On entering monitoring, focus goes to the dashboard heading rather than Stop.
- With the automatic maximum gap, the slow-processing warning fires only when
  live speed drops after setup, or with a manual gap; setup speed uses the
  "too slow" check.
- The PDF output cap was raised from 8 MB to 48 MB for up to 200 stills.
- Seats are drawn in captured-pixel space and mirrored only when sent to the
  monitor (as in saved video). Mirrored input was not checked in a browser.

## Physical check (design, Step 2)

**Not performed.** It needs hardware and people that the implementing agent does
not have: the ASUS laptop, Camo, one iPhone, one Android phone and three seated
people. Who must do it: the team member holding the ASUS laptop, with the
instructor or a consenting volunteer group; record the result below.

| Item | Status | Who | Result |
| --- | --- | --- | --- |
| Live frames per second at the tiling used (2) on the ASUS laptop | Not performed | Team member with the ASUS laptop | |
| Automatic maximum gap chosen | Not performed | Same | |
| Phone appears in the camera list via Camo: one iPhone | Not performed | Same | |
| Phone appears in the camera list via Camo: one Android phone | Not performed | Same | |
| Three seated people found as three seats | Not performed | Same, with volunteers | |
| One sustained left or right alert | Not performed | Same, with volunteers | |
| One repeated alert | Not performed | Same, with volunteers | |
| A writing (down) interval with no alert | Not performed | Same, with volunteers | |
| Resume after unplugging the phone, with seats and alerts kept | Not performed | Same | |
| Seats still line up after resume; instructions to end the session if the phone moved are clear | Not performed | Same | |
| Delete a session and confirm its stills are gone | Not performed | Same | |

Volunteers must agree to appear and to the still-retention period before the check;
delete the session afterward.

## Other things not performed or not established

- Team agreement to the PRD changes, FR15 and FR16.
- Alert precision, recall, timing error and false alerts during writing on labeled
  footage; classroom accuracy; examination-scale performance.
- Mirrored camera input in a browser; the 503 Stop retry; the 3-hour limit and
  the 2 h 45 min banner in a browser; the "Running slowly" state live; a real
  second browser tab; audible chime and the mute toggle in a browser;
  screen-reader and keyboard-only testing with assistive technology.
- Peer review of the branch, and a fresh-clone reproduction by another member.

## Inconsistencies reported, not changed

- `ROADMAP.md` still states "live camera input is optional" in CP5 and the
  dependency lines and its CP5 gate text; this was left as history with a dated
  note, since changing gates needs team agreement.
- `ROADMAP.md` has pre-existing garbled characters in the CP5 dependencies line
  (an encoding fault in an en dash); not touched.
- The design's repeatable alert check includes comparing live alert timing with `scripts/process_video.py --events` on the same clip. No task report records that comparison, so it is listed as not completed.

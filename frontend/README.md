# Ocular website and local analysis workspace

A public-facing introduction to Ocular (formerly GAZE), built with React and the Next.js App
Router, TypeScript, Tailwind CSS, Lucide icons, and a locally owned shadcn/ui
button component. `package-lock.json` pins the installed dependency tree.

The landing page explains the project, its live camera
seat-alert workflow, research evidence, and limitations. The interactive classroom
example uses AI-generated imagery and fictional observations; it is not footage
or model output. Its timestamp buttons change the observation example, not the photo.
The interface follows the centered typography, soft surfaces, pastel cards, and
dark pill buttons of the user-selected Samfund reference. Brand and image prompts
are recorded in [the asset notes](public/ASSETS.md).
The separate `/analyze` page is the live camera: it finds the seats in one
fixed camera view and alerts the instructor to the seat to check, using the
existing Python pipeline on the same computer. A saved recording can be
reviewed with the same seat rules. It does not make misconduct decisions. See
[Live camera](#live-camera) and [Using the live camera](#using-the-live-camera).

## Run locally

Use Node.js 20.9 or newer (verified here with Node.js 24.21.0 and npm 11.19.0).
The Node-based test command additionally requires Node.js 22.18+.
The user explicitly authorized this session's C: checkout as an exception to
the repository's F:-only write rule. The commands below keep caches and temporary
files inside the checkout; do not change global npm or Windows settings.

From the repository root in PowerShell:

```powershell
$taskRoot = (Get-Location).Path
New-Item -ItemType Directory -Force .work/tmp, .work/npm-cache, .work/cache, .work/pip-cache, .work/matplotlib | Out-Null
$env:TEMP = Join-Path $taskRoot '.work/tmp'
$env:TMP = $env:TEMP
$env:npm_config_cache = Join-Path $taskRoot '.work/npm-cache'
$env:XDG_CACHE_HOME = Join-Path $taskRoot '.work/cache'
$env:PIP_CACHE_DIR = Join-Path $taskRoot '.work/pip-cache'
$env:MPLCONFIGDIR = Join-Path $taskRoot '.work/matplotlib'
$env:NEXT_TELEMETRY_DISABLED = '1'
Set-Location frontend
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. The project `.npmrc` keeps npm's cache in
`../.work/npm-cache`; `scripts/run.mjs` sets project-local temporary/cache
directories and disables Next.js telemetry for each app command. Dependencies
live in `frontend/node_modules`, and Next.js output lives in `frontend/.next`.

## Verify

From `frontend/`:

```powershell
npm run build
npm run typecheck
npm test
npm run start
```

`start` serves the production build on loopback. Stop either server with Ctrl+C.
The build prerenders the landing page; hosting and public deployment are not
configured. No registration, publication, GitHub task claim, commit, or push
is part of this change.

## Image/video input and output

After analysis, **Download PDF report** generates a real PDF document containing
observations for potential incident review. Image reports have no session
timestamps or inferred durations. Directions-only video reports list individual
source frames without inventing identities or movement histories. Empty/unknown
results explicitly preserve uncertainty. PDF generation requires the updated
Python `requirements.txt`, including ReportLab; it does not require new models.

The Image and directions-only video workspaces are no longer reachable from
the website (their code and API routes remain, unused); this section describes
their outputs for the record. `/analyze` opens the live camera, and the only
saved-file workflow offered is the recording review below.

## Live camera

`/analyze` opens the live camera; it is the only main screen. There is no
source switcher: **Review a recording instead** (below the setup panel) opens
`/analyze?mode=video`, the recording review, which has a **Back to live
camera** link. `?recording=<uuid>` reopens a recording from Past sessions. The
old `?session=<uuid>` bookmarks of the removed Saved video review open the
camera. Every other `mode` value, including the removed `?mode=image`, opens the camera. The Image
workspace and its API route stay in the code but no tab, button or link leads
to them.

The camera screen finds the seats automatically, numbers them left to right,
and monitors them with the Baseline method. Sustained or repeated left/right
turns open a "Check seat N" alert with a chime, a cropped still and **Checked**
/ **Dismiss** (keys `C` / `D` on the newest open alert). Down (writing) never
alerts. The session, its alerts and stills are saved on this computer;
interrupted sessions can be resumed, ended ones reopened from **Past
sessions**, and each session downloads as a PDF report for faculty: seats to
look at again (ranked), a seat map, an alert timeline, each alert with its photo
and your mark, what Ocular could not see, and space for your own decision. The
collapsible **About this exam** section (exam, room, proctor) fills its header;
left closed or blank, the PDF prints lines to fill in by hand.
Movement rules, mirroring and
detector tiling sit under **Advanced settings**. See the
[camera alerts design](../docs/superpowers/specs/2026-11-18-camera-alerts-design.md)
for the routes, storage and limits and the
[verification record](../docs/superpowers/specs/2026-11-18-camera-alerts-verification.md)
for what was and was not checked (the physical phone check is not performed).
Alert accuracy in real classrooms has not been measured; an alert is a prompt to
look, not a finding. Stills may show students' faces; agree consent and a
retention period before use with real students, and delete sessions when it ends.

**How to use Ocular** opens by itself the first time a browser shows the
camera screen (remembered under the `localStorage` key
`ocular.camera.guideSeen`) and reopens from the **How to use** button at the
top of the screen. It is a non-modal panel: monitoring and alert announcements
continue while it is open, Escape or Close closes it, and focus returns to the
button. Its text is below, so it can be printed for instructors.

**Camera checks** warn about interrupted tracks, a frozen preview, stale
processed frames, fewer usable heads than seats, and very dark/low-detail
views. These are experimental technical warnings; they cannot establish the
cause of poor visibility. See [check thresholds and limitations](../docs/review-workload.md#camera-checks).

## Using the live camera

### How to use Ocular

1. **Before the exam:** install Camo on the phone and on this laptop; connect
   them over USB or the same Wi-Fi.
2. **Place the phone:** mount it high at the front so every desk and face is
   visible; landscape; good lighting; do not move it after setup.
3. **Start:** choose the phone in the camera list and press **Start**.
4. **Seats:** Ocular finds the students and numbers the seats left to right.
   Use **Adjust seats** only if a seat is missing or wrong.
5. **Monitor:** press **Start monitoring**. An alert tells you which seat to
   look at. Look up, decide, then press **Checked** or **Dismiss** (or the C
   and D keys).
6. **If it stops:** reconnect the phone and press **Resume**. Your seats and
   alerts are kept.
7. **After the exam:** press **Stop**, download the PDF, and delete the
   session when your institution's retention period ends.

### Troubleshooting

- **The phone is not in the camera list:** open Camo on the phone and on this
  laptop and check that they are connected. Then reload the page and choose
  the phone.
- **"No students found":** check that the phone sees every desk and that faces
  are lit, then press **Try again**. You can also draw the seats yourself.
- **"Running slowly":** close other programs on this laptop. If it stays slow,
  press **Stop**, choose fewer detector tiles under Advanced settings, and
  start again.
- **The alert sound does not play:** click the page once, and check that
  **Mute alerts** is off and the laptop volume is up.
- **The seats no longer line up:** the phone has moved. End the session and
  start a new one, so Ocular can find the seats again.

### What alerts mean

An alert is a prompt to look, not a finding. It means a head in that seat
turned left or right for a while, or several times. Looking down (writing)
never alerts. Seats are positions in the room, not people: Ocular does not
recognise anyone. You decide what, if anything, needs attention.

To verify a production build alongside a development server (macOS/Linux):

```sh
NEXT_DIST_DIR=.next-verify npm run build -- --webpack
NEXT_DIST_DIR=.next-verify npm run start -- --port 3001
```

The separate output directory protects development artifacts. On PowerShell set
`$env:NEXT_DIST_DIR` first. The webpack option avoids a Turbopack build-process
port failure observed in the agent environment.

## Recording review

From the camera screen choose **Review a recording instead**
(`/analyze?mode=video`). Pick a video from one fixed camera (`.mp4`, `.mov`,
`.webm` or `.m4v`, up to 2 GB and 3 hours); it is stored only on this computer.
Ocular finds the seats from the first seconds of the video and shows them on
one frame; **Adjust seats** works as on the camera. **Start review** processes
the video in a local Python worker (`scripts/recording_worker.py`), sampling a
frame every 0.1 s of video time, with the camera's fixed movement rules and
Baseline model. A progress line shows how far it got, and you can leave the page;
**Cancel** stops and deletes the session.

When it finishes, the alerts panel matches the live camera: one card per seat
and direction, a cropped photo, the time in the video, **Play this moment**
(a short clip from 3 s before the first movement to 3 s after it), Checked and
Dismissed marks and notes. **Download PDF report** gives the faculty report with
video times instead of clock times. A review stopped by a server restart is kept
as interrupted with its alerts so far, and **Review again** reuses the stored
video. Recordings appear in **Past sessions** as "Recording" and share the
camera's session folders under ignored `outputs/runs/camera/<uuid>/`; opening
`/analyze?recording=<uuid>` reopens one without inference. Recording review and
the camera share one local inference reservation: a second job is refused while
one runs.

Old Saved video reviews under `outputs/runs/review/` are kept on disk but are no
longer listed or opened by the website, and the `/api/review` routes were
removed. Their notes, statuses and sign-offs stay in those folders.

Direct CCTV/RTSP/ONVIF connections are not implemented. Suitable exported footage
from one fixed camera uses the upload path; a changed camera angle/layout needs a
new review. Alerts are prompts for an instructor to look, not proof. The intended
interface users are faculty, with technical controls available only when needed.

The directions-only video option is no longer offered in the website. The
existing calibrated head/seat CLI remains available separately. This web review
does not establish seat consistency, event accuracy, classroom generalization,
or CP4 completion. See [technical evidence](../docs/superpowers/specs/2026-10-29-saved-review-verification.md),
[CP4 checklist](../docs/checkpoints/cp4-checklist.md), and
[before/after table](../docs/checkpoints/cp4-before-after.md).

## Processor setup and directions-only saved-file outputs

The processor must be installed in the repository's `.venv`, with models under
`models/downloads`. Use Python 3.12 and the root README's project-local cache
setup before installing the pinned `requirements.txt` (which includes `-e .`).
The optional head method additionally requires `requirements-head-pose.txt` and
`scripts/download_head_models.py`; the baseline requires
`scripts/download_model.py`. No global Python fallback or automatic model
download is used. The workspace checks interpreter/package/model availability
and offers a **Recheck** control after setup. Model integrity remains enforced
by the Python pipeline when processing starts.

The Node-runtime `GET /api/analyze` reports readiness, while
`POST /api/analyze` accepts multipart fields `file`, `method`, `mirrored`, and
`tileGrid`. It invokes `scripts/run.py` with literal argument arrays, a project
Python import path, and project-local caches. The endpoint accepts loopback
requests, rejects cross-site browser origins, caps request bodies, and permits
one analysis at a time within this server process. It is designed for a single
local Next.js server, not public/multi-worker hosting. There is no background job
queue, live progress percentage, cancellation, or automatic deletion. The request
waits for processing, with a ten-minute timeout; keep the page open.

Inputs and outputs are retained in ignored
`outputs/runs/web/<generated-uuid>/`. Every run has a new directory. Downloads
are restricted to a fixed list of generated artifacts through
`GET /api/analyze/<uuid>/<asset>`; arbitrary filesystem paths and source uploads
are not exposed. Agree on retention and remove local runs manually when appropriate.

Images show `annotated.png`, direction counts, per-detection directions and
unknown reasons, and observation/run JSON downloads. Videos provide counts,
processed frames, measured processing FPS when available, and annotated AVI,
JSONL observations, summary, and run metadata downloads. **AVI output is not
assumed to play in the browser**; the input panel previews the original when its
codec is supported. TIFF and some video codecs may also lack browser previews
while remaining decodable by Python. Saved-video timestamps assume constant
frame rate. Video counts aggregate frame observations, not unique people.

The directions-only workspace uses the automatic camera-relative runner. Camera
mode uses the same inference adapters through a persistent worker. The separate
seat-review mode integrates histories/events and saved-session review; neutral
calibration remains in the CLI. Technical integration alone does not complete
team acceptance of `cp4-export-review`.

Check the hero and remaining sections at desktop and narrow/mobile widths.
Select each of the three example timestamps: `00:12`, `00:24`, and `00:36`.
They show a left turn, a writing-compatible downward observation, and a missing
observation. At mobile widths, check the menu's open/close behavior and section
links. Verify keyboard focus and respect reduced-motion preferences.

### Historical verification recorded on 28 October 2026

- Production build passed with Next.js 16.4.3; the homepage was prerendered.
- `npm run typecheck` passed.
- Production HTTP checks passed: homepage, eight generated assets, favicon,
  expected 404, metadata, section targets, illustrative-example disclosures,
  accessibility markup, and local Markdown links.
- `git diff --check` passed; no conflict markers were found in the new source.
- Dependency installation reported zero known vulnerabilities.
- Desktop/mobile visual inspection, keyboard interaction, and live timestamp/menu
  interaction remain unverified: Windows Computer Use stopped because it could
  not confidently determine Chrome's current URL. No alternative browser
  automation was attempted after that stop.
- Python application/model tests were not run; no processing code was changed,
  and this checkout has no project Python interpreter.

Scope: the user-requested public landing page, with no existing backlog task
claimed or live Issue/Project state changed. The local production server was
used for HTTP verification and stopped afterward.

### Historical upload-page verification, 29 October 2026

- Production build and TypeScript checks passed for `/analyze` and its API routes.
- Eight Node tests passed for supported formats, upload limits, method validation,
  local-origin checks, run ID/path restrictions, download allowlists, and literal
  Python command arguments.
- Production HTTP checks passed for `/analyze`, its homepage navigation, ten
  generated assets, readiness, expected setup-required 503 responses, invalid
  uploads/methods, cross-origin rejection, download headers/content, restricted
  paths, and local Markdown links. Download checks used explicitly synthetic
  fixtures in ignored run directories, not model inference outputs.
- `git diff --check` passed. The temporary production server on port 3100 was
  stopped after verification; an already-occupied port 3000 was left untouched.
- Actual model inference and Python application tests remain unperformed: this
  checkout has neither `.venv` nor downloaded models. The UI reports this prerequisite
  and disables processing instead of presenting simulated results.
- Desktop/mobile visual and browser-interaction checks remain unverified because
  browser automation was blocked in this environment during the earlier check.

### Camera integration verification, 29 October 2026

The earlier sections record their original checkout/environment. In the later
macOS checkout, the project `.venv` and verified models were available:

- 143 application tests, 16 automation tests, and 20 frontend tests passed.
- TypeScript checks and a separate webpack production build passed.
- Both real model workers processed successive repository sample frames;
  Stop and cancelled startup released the inference reservation.
- Synthetic-camera browser checks passed for both methods, denied permission,
  pending-permission cleanup, Stop during model startup, source navigation,
  hidden-tab/disconnected-track events, and a subsequent real image upload.
- Desktop/mobile layouts were inspected; 390px had no horizontal overflow.
- Physical-device permission, camera selection/removal, the three-seat
  demonstration, and classroom performance remain unverified.

See [full verification details](../docs/superpowers/specs/2026-10-29-live-camera-verification.md),
including environment constraints and the distinction between simulated events
and physical-device checks. Camera mode does not save frames or recordings.

Dated note, 18 November 2026: the sentence above describes the 29 October
direction-only camera. The live alert workflow now saves the session record and
one cropped still per alert (never the camera video) in `outputs/runs/camera/`,
deleted with the session; see [Live camera](#live-camera) and the
[verification record](../docs/superpowers/specs/2026-11-18-camera-alerts-verification.md).

## Edit

- `src/components/target-cursor.jsx`, `target-cursor.css`, and `hero-target-cursor.tsx`:
  user-supplied React Bits TargetCursor, scoped to the hero heading/cards/principles.
  The hero kicker, all six feature cards, and four principle labels are hover
  targets, including non-interactive containers. Links also receive target locking.
  Links and enabled buttons keep the pointing-hand cursor, including over icons
  and other nested content. The reticle
  spins, snaps to targets, leans with the pointer, and squeezes on press; the
  normal cursor returns outside the hero. Touch keeps native behavior, and
  reduced motion disables animation. No additional dependency is required.
- `src/app/page.tsx`: landing-page sections, wording, and research links.
- `src/app/globals.css`: colors, typography, layouts, and responsive styles.
- `src/components/session-preview.tsx`: generated classroom photo and fictional timestamp interaction.
- `src/components/site-header.tsx`: desktop and mobile navigation.
- `src/components/ui/button.tsx`: local shadcn/ui-style component, using Radix Slot and CVA.
- `src/app/layout.tsx` and `public/brand/ocular-logo-yellow.png`: metadata and favicon.
- `src/app/analyze/` and `src/components/analysis-workspace.tsx`: media workspace.
- `src/app/api/analyze/` and `src/lib/server-analysis.ts`: local Python invocation and downloads.
- `src/lib/analysis-contract.ts`: shared formats, limits, types, and request guards.
- `tests/analysis.test.mjs`: Node tests (run with Node.js 22.18+).
- `src/components/analysis-modes.tsx`: opens the camera, or the recording screen for `?mode=video` / `?recording=`.
- `src/components/camera-workspace.tsx` and the `camera-*` components: the camera screens, alerts, past sessions and the How to use Ocular guide (`camera-guide.tsx`).
- `src/app/api/camera/`, `src/lib/server-camera.ts`, and `camera-session.ts`: live worker/session lifecycle.
- `src/lib/camera-client.ts`, `camera-contract.ts`, and `processing-slot.ts`: sequential capture, frame contracts, and inference reservation.
- `tests/camera.test.mjs` and `camera-client.test.mjs`: camera transport, cleanup, timing, and frame-loop tests.

Keep copy consistent with the root PRD and current checkpoint evidence. Do not
turn targets into achieved results or describe head movements as misconduct.
No real classroom images, remote fonts, analytics, or external runtime assets
are loaded by the landing page. External GitHub resource links open separately.

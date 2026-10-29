# GAZE website and local analysis workspace

A public-facing introduction to GAZE, built with React and the Next.js App
Router, TypeScript, Tailwind CSS, Lucide icons, and a locally owned shadcn/ui
button component. `package-lock.json` pins the installed dependency tree.

The landing page explains the project, its saved-video
workflow, research evidence, and limitations. The interactive SVG classroom
example uses hand-authored observations; it is not footage or model output.
The separate `/analyze` page accepts one image or saved video and invokes the
existing Python runner on the same computer. It returns actual annotated media,
direction counts, and downloadable records. It does not make misconduct decisions.

The **Camera** source adds live direction observations with the same models.
See [Live camera](#live-camera).

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

Open `/analyze` or use **Analyze** in the navigation. Select **Image** or
**Saved video**, browse/drop one supported file (maximum 64 MB), select the
automatic head model or geometric baseline, and optionally specify mirrored
pixels or baseline detector tiling. Input previews use local browser object URLs.
Only clicking **Analyze** sends the file to this loopback Next.js server.

## Live camera

Open `/analyze`, select **Camera**, choose a camera and method, then click
**Start camera** and allow browser camera access. The continuous preview is
shown beside the latest processed frame with direction boxes and per-frame
counts. Annotations belong to that exact captured frame; they may trail the
continuous preview when inference is slower. The interface does not mirror
camera pixels. Left/right remain subject-relative.

Click **Stop** to release the camera and Python worker. Switching sources,
navigating away, hiding the tab, or processing failure also stops capture.
Denied permissions, unavailable devices, missing models, and processing failures
show recovery messages. An abandoned session expires after 15 seconds without
work; active frames have a 30-second timeout and model startup a 60-second
timeout. Termination escalates to a forced kill after two seconds. The inference
reservation remains held until the worker actually exits.

The selected model stays loaded for the session. Browser JPEG frames are scaled
to at most 1280 × 720, with one frame in flight and at most ten capture requests
per second. Actual speed may be lower; displayed throughput includes request,
response, and scheduling time. Capture timestamps use monotonic elapsed seconds
from the start of frame processing. No camera pixels, recordings, or observation
records are saved by this mode. Microphone access is not requested.

Camera and saved-file inference share one processing reservation. Stop camera
analysis before running an upload or another live session. This supports a
single local server, not public or multi-worker hosting. Use a browser with
camera support at the loopback URL; remote-device access is not supported.

`POST /api/camera` starts a session with `method`, `mirrored`, and `tileGrid`.
`POST /api/camera/<uuid>` sends `id`, `timestamp_seconds`, and a base64 JPEG;
`DELETE /api/camera/<uuid>` stops it. Routes retain the local-origin guards and
enforce bounded request sizes. Frames pass in memory through stdin/stdout to
`scripts/camera_worker.py`, using `.venv` and project-local caches.

This mode provides directions only. Seat association, calibrated seat-relative
directions, histories, events, recording, and live-session downloads are outside
this version. Physical-camera behavior and the authorized three-seat
demonstration remain human checks; classroom accuracy remains unvalidated.
See the [design](../docs/superpowers/specs/2026-10-29-live-camera-design.md).

To verify a production build alongside a development server (macOS/Linux):

```sh
NEXT_DIST_DIR=.next-verify npm run build -- --webpack
NEXT_DIST_DIR=.next-verify npm run start -- --port 3001
```

The separate output directory protects development artifacts. On PowerShell set
`$env:NEXT_DIST_DIR` first. The webpack option avoids a Turbopack build-process
port failure observed in the agent environment.

## Processor setup and saved-file outputs

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

The saved-file workspace uses the automatic camera-relative runner. Camera mode
uses the same inference adapters through a persistent worker. Seat configuration,
neutral calibration, seat histories, event generation, and synchronized event
review are not included and do not complete `cp4-export-review`.

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

## Edit

- `src/app/page.tsx`: landing-page sections, wording, and research links.
- `src/app/globals.css`: colors, typography, layouts, and responsive styles.
- `src/components/session-preview.tsx`: illustrative SVG and timestamp interaction.
- `src/components/site-header.tsx`: desktop and mobile navigation.
- `src/components/ui/button.tsx`: local shadcn/ui-style component, using Radix Slot and CVA.
- `src/app/layout.tsx` and `src/app/icon.svg`: metadata and favicon.
- `src/app/analyze/` and `src/components/analysis-workspace.tsx`: media workspace.
- `src/app/api/analyze/` and `src/lib/server-analysis.ts`: local Python invocation and downloads.
- `src/lib/analysis-contract.ts`: shared formats, limits, types, and request guards.
- `tests/analysis.test.mjs`: Node tests (run with Node.js 22.18+).
- `src/components/analysis-modes.tsx` and `camera-workspace.tsx`: source selection and camera controls/display.
- `src/app/api/camera/`, `src/lib/server-camera.ts`, and `camera-session.ts`: live worker/session lifecycle.
- `src/lib/camera-client.ts`, `camera-contract.ts`, and `processing-slot.ts`: sequential capture, frame contracts, and inference reservation.
- `tests/camera.test.mjs` and `camera-client.test.mjs`: camera transport, cleanup, timing, and frame-loop tests.

Keep copy consistent with the root PRD and current checkpoint evidence. Do not
turn targets into achieved results or describe head movements as misconduct.
No real classroom images, remote fonts, analytics, or external runtime assets
are loaded by the landing page. External GitHub resource links open separately.

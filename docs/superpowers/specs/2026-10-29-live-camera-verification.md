# Live camera verification — 29 October 2026

Scope: approved direction-only Camera source, related to `cp4-camera` / Issue #27.
This is technical evidence, not acceptance of the full task or a checkpoint.

## Automated checks

With README project-local environment/cache settings:

| Command | Result |
| --- | --- |
| `.venv/bin/python -m unittest discover -s tests -q` | 143 passed (138 existing plus 5 live-frame tests). |
| `.venv/bin/python .github/automation.py check` | Passed syntax, links, conflict markers, and task dependency checks. |
| `.venv/bin/python -m unittest discover -s .github/tests -q` | 16 passed. |
| `../.work/node-runtime/node_modules/node/bin/node scripts/run.mjs test` from `frontend/` | 20 passed using a project-local Node 22.23.4 runtime. The installed default Node 20 cannot run the existing strip-types test command. |
| `npm run typecheck` from `frontend/` | Passed. |
| `NEXT_DIST_DIR=.next-verify npm run build -- --webpack` from `frontend/` | Passed production compilation, type checks, and route generation. |
| `git diff --check` | Passed before staging. Staged whitespace is checked again before commit. |

Tests exercise bounded JPEG/messages, corrupt inputs, monotonic capture times,
per-frame counts, pipeline reuse, sequential capture, matching results, late
result cancellation, busy inference exclusion, startup failure, idle/frame
timeouts, and SIGTERM-to-SIGKILL shutdown. Reservations are released on actual
process exit rather than on the Stop request.

Turbopack failed because its CSS build subprocess could not bind a local port,
including an escalated retry. The webpack production build passed. An isolated
`.next-verify` output directory protected the development server's artifacts.

## Real-model integration

A project-local Node harness started the real Python camera worker for both
methods and submitted the permitted repository sample
`data/samples/pointing04/person01145+0-15.jpg` twice per session. Both methods
returned the matching frame IDs/timestamps, 384 × 288 dimensions, and one forward
observation on both frames. Stop and cancelled startup released the inference
reservation. This is protocol/model integration evidence, not accuracy scoring.

MediaPipe initialization inside the sandbox failed on macOS graphics service
creation. The same test passed outside the sandbox with the same project-local
interpreter, models, and caches. No models or thresholds were changed.

## Browser integration

Headless Brave with Playwright used a dedicated project-local profile and the
browser's synthetic camera source against the production server at loopback
port 3001. Physical camera and microphone access were not requested.

Verified:

- Denied camera permission produces recovery instructions.
- Stop while permission is pending cleans up a subsequently returned stream.
- Both real model methods process successive synthetic camera frames.
- Stop ends media tracks and returns HTTP 204 after worker shutdown.
- Switching to Image stops the live session; a subsequent real baseline image
  upload completes and returns its annotated image.
- Stop during model startup allows a subsequent camera session to start.
- Simulated hidden-page and disconnected-track events stop capture and workers;
  the disconnected event displays recovery instructions.
- No browser JavaScript errors; no horizontal overflow at 390px width.

The first browser harness run completed camera cases but failed on an exact
label selector for the pre-existing upload method field. The corrected selector
passed the entire harness; this was a test-selector error, not an app failure.
Desktop (1440px) and mobile (390px) captures were inspected directly. The new UI
inherits the existing colors, layout, controls, and responsive stacking. A
separate code review found no Critical/Important defects. A separate UI review
found no material desktop/CSS issues; its image renderer could not display the
lower mobile screenshot, so mobile visual confirmation is from direct inspection.
The deterministic UI detector returned no findings.

One-off harnesses, screenshots, test profiles, and downloaded verification tools
remain ignored under `.work/live-camera/`, `.work/browser-tools/`, and
`.work/node-runtime/`. Application dependencies were not changed.

## Remaining human checks

Use a physical built-in or USB camera to check actual browser/system permission
prompts, camera selection, removal, normal Start/Stop, and directional overlays
with people. Verify realistic throughput on the intended laptop/workload. The
authorized three-seat demonstration, seat consistency, integrated event review,
movement accuracy, classroom generalization, and full Issue #27 acceptance are
not established. No camera recordings or histories are produced by this version.

The live Issue was open and unassigned when read. Live Project status was not
available; no Issue assignments, Project changes, commits to main, pushes, or
publication were performed as part of task claiming. The user authorized a
separate local feature commit on `feat/live-camera`.

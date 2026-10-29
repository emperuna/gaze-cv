# Live camera directions

Approved by the user on 29 October 2026, including project-local writes in this macOS checkout as an exception to the F:-only rule.

## Intent and scope

Extend `/analyze` with Camera beside Image and Saved video. Start requests browser camera permission, loads the selected existing model once, and displays head boxes and directions on matching processed frames. Stop releases media tracks and the Python worker. Display per-frame direction counts, elapsed capture time, and measured processing throughput. No target FPS or classroom accuracy is promised.

## Approaches

Selected: browser camera capture with a persistent project-local Python subprocess. Browser permissions and camera selection stay with the website; both existing inference adapters are reused. Alternative: Python opens the camera directly, which complicates browser preview, permissions, and selecting the correct device. Restarting Python per frame was rejected because model initialization would dominate latency.

## Interfaces and lifecycle

Next.js owns one live session at a time, sharing an inference reservation with saved-input processing. Start checks readiness and spawns `scripts/camera_worker.py`; the worker reads bounded JSON lines over stdin and returns readiness or frame results over stdout. Model diagnostics go to stderr. Frame messages carry JPEG data and monotonic capture seconds. Python validates input bounds and timestamps and calls the selected shared pipeline. No camera frames or observations are written to disk.

The browser captures at most 1280 by 720 pixels, requests at most ten processed frames per second, and waits for each response before capturing again. Processing speed may be lower. The annotated canvas contains the exact captured image whose detections are returned; a separate live preview remains continuous. Left/right are subject-relative, and unknown remains explicit. No seat association, histories, events, recording, or unique-person counts are introduced.

Stop, navigation, hidden pages, permission failure, disconnected cameras, and failed processing release resources. Late media/start responses are cleaned up. A server idle lease also expires abandoned sessions. Startup and frame processing have bounded timeouts. API routes retain existing loopback and origin guards, enforce body limits, and use unguessable session IDs. Downloads and existing file analysis remain available as before.

Builder review clarification: pause idle expiry during an active frame; the frame timeout bounds abandoned in-flight work. Shutdown sends termination followed by a forced kill after two seconds if needed. Hold the inference reservation until the child process has actually exited, including failure paths.

## Verification and boundaries

Test frame validation, capture-time ordering, independent per-frame counts, worker protocol reuse, readiness, inference exclusion, busy requests, timeouts, lease expiration, and cleanup. Run application and automation suites, frontend tests/typecheck/build, a real-model multi-frame smoke run, and browser checks with synthetic camera input where tooling permits. Physical camera permission/device behavior and the authorized three-seat demonstration remain human checks.

Related task: `cp4-camera`, Issue #27. Read-only live inspection found the issue open and unassigned. Live Project status is unavailable; no GitHub state changes are authorized. This implementation is the user-approved direction-only extension, not completion of the full seat/review acceptance criteria or the older dependency `cp4-export-review`.

Preserve existing `frontend/next-env.d.ts` edits. The user subsequently authorized a local commit on a newly created branch; no push or publication is authorized. Do not tune models or change checkpoint completion claims. All environments, caches, and verification artifacts stay under this checkout's `.venv` and `.work`.

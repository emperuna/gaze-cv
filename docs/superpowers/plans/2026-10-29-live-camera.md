# Live Camera Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add live camera direction analysis to the local website.

**Architecture:** Browser JPEG capture feeds a persistent Python worker through bounded local Next.js APIs. Both existing inference methods remain reusable, with one frame in flight and a shared inference reservation.

**Tech Stack:** Next.js, React, TypeScript, Python, OpenCV, existing MediaPipe and ONNX models.

**Spec:** `docs/superpowers/specs/2026-10-29-live-camera-design.md`

## Global constraints

- All writes and caches remain project-local in this macOS checkout, per user approval.
- No recording, seats, histories, movement flags, model tuning, pushes, or GitHub mutations. The user subsequently authorized one local feature commit.
- Camera frames stay in memory; capture timestamps use elapsed monotonic seconds.
- Preserve unrelated `frontend/next-env.d.ts` changes and the existing visual system.

## Review focus

- Stop during permission/startup must clean late streams and sessions.
- An abandoned tab must not leave inference reserved indefinitely.
- Slow inference must not queue frames or draw stale boxes on newer images.
- Malformed/large frames and decreasing timestamps must fail clearly.
- Saved uploads and live sessions must not concurrently reserve inference.

## Task 1: Frame processing and persistent worker

Files: `src/gaze/camera.py`, `scripts/camera_worker.py`, `tests/test_camera.py`.

Interface: `CameraProcessor.process(message)` consumes id, timestamp_seconds, and base64 JPEG; returns id, timestamp_seconds, result, and counts. `serve(pipeline, input_stream, output_stream)` preserves a single processor across messages.

- [x] Write tests for malformed frames, invalid/backward timestamps, per-frame counts, bounded dimensions, and multiple messages through one worker.
- [x] Observe failure, implement bounded decode and shared inference, rerun tests.

## Task 2: Local live-session API

Files: `frontend/src/lib/camera-contract.ts`, `camera-session.ts`, `processing-slot.ts`, `server-analysis.ts`, and `frontend/src/app/api/camera/` routes; `frontend/tests/camera.test.mjs`.

Interface: POST `/api/camera` starts a session with method/mirrored/tileGrid; POST `/api/camera/[sessionId]` processes one frame; DELETE stops it. `CameraSession` owns worker readiness, request promises, idle timeout, and teardown. `acquireProcessingSlot()` returns an idempotent release function.

- [x] Write failing lifecycle, request validation, timeout, and inference-reservation tests.
- [x] Implement child-process JSONL transport, size/origin guards, bounded request reads, idle expiry, and cleanup.
- [x] Run frontend tests and typecheck.

## Task 3: Camera controls and matched-frame display

Files: `frontend/src/components/analysis-modes.tsx`, `camera-workspace.tsx`, `frontend/src/lib/camera-client.ts`, `analysis-workspace.tsx`, `frontend/src/app/analyze/page.tsx`, `workspace.css`.

Interface: shared source selector switches Image/Saved video/Camera. Camera component owns stream and session lifecycle, captures one frame at a time, and draws detections only over its captured frame.

- [x] Test capture scaling, elapsed timestamps, cancellation, and sequential frame scheduling.
- [x] Implement camera/device selection, Start/Stop, matched annotations, counts, throughput, errors, and hidden-page cleanup.
- [x] Verify frontend build/typecheck and browser behavior where available.

## Task 4: Evidence and documentation

Files: root and frontend README, `scripts/README.md`, verification notes beside the design.

- [x] Run all application/automation/frontend checks and real-model repeated-frame integration.
- [x] Review resource lifecycle and inspect desktop/mobile UI; record physical-camera checks not performed.
- [x] Document use, memory-only handling, timing, limitations, and exact commands/results. Check links and whitespace.

## Execution rulings

The user explicitly approved implementation; execute inline without another approval stop. Use a focused branch in this checkout so the user can test it immediately; no separate worktree was requested. The user subsequently requested committing the completed changes to the new branch. Inspect exact staged paths and whitespace before one atomic Conventional Commit; do not push. Keep the progress ledger under `.work/live-camera/` rather than outside the approved local cache locations.

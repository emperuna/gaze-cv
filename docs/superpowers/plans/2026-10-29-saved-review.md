# Saved Review Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task.

**Goal:** Integrate saved-video seat/event review and saved-session reopening.
**Architecture:** Reuse shared Python video/seat/history/event code. Next.js
owns bounded processing and artifact APIs; browser source playback supplies
frame-indexed overlays, histories, and click-to-seek events.
**Tech Stack:** Existing Python/OpenCV/MediaPipe/ONNX and Next.js/React/TypeScript.
**Spec:** `docs/superpowers/specs/2026-10-29-saved-review-design.md`.

## Constraints and review focus

- Preserve image/camera/directions-only video behavior and unrelated edits.
- No new packages, calibration claims, identity matching, or held-out tuning.
- Keep missing/ambiguous observations explicit; never bridge gaps.
- Match source frame time when playing/seeking; clear overlays past coverage.
- Validate seats/settings twice, constrain sizes/paths, and publish only complete runs.
- Hold shared inference until actual child exit on cancel/timeout/disconnect.
- All caches and verification artifacts are project-local. The user subsequently
  authorized a commit and PR for this feature; no hand-in tag or merge is authorized.

## Task 1 — Python review-session export

Files: src/gaze/session_review.py, scripts/review_video.py, tests/test_session_review.py.
Interface: process_session(input, output, settings, pipeline) returns a compact
review record and persists raw video artifacts/settings/provenance.

- [x] Write failing tests for events/gaps/provenance, invalid settings, bounded
  media, compact history, corrupt input and protected existing output.
- [x] Implement wrapper around shared process_video with no rule changes.
- [x] Verify focused and full application tests.

## Task 2 — Guarded API and stored-session access

Files: frontend/src/lib/review-contract.ts, server-review.ts, media-range.ts;
frontend/src/app/api/review/ routes; frontend/tests/review.test.mjs.
Interfaces: POST /api/review(file, settings), GET /api/review, GET
/api/review/[id]/[asset]. Fixed assets include review.json and source.

- [x] Write failing validation/mirroring/frame lookup/range/path tests.
- [x] Implement processing, abort/timeout handling, metadata-last persistence,
  bounded list/load, contained artifact access and media range streaming.
- [x] Verify frontend tests/typecheck and real-model endpoint smoke.

## Task 3 — Seat editor and session reviewer

Files: video-workspace.tsx, seat-editor.tsx, session-player.tsx, analysis-modes.tsx,
and saved-review.css. Share review-contract types/functions with server/tests.

- [x] Add visual and numeric seats, settings, readiness, processing/cancel UI.
- [x] Add frame-matched playback overlays, event filters/seek and history strips.
- [x] Add saved-session listing/reopen, settings/provenance and downloads.
- [x] Verify browser lifecycle, event seeking, reload/reopen, and responsive UI.

## Task 4 — Evidence and CP4 checklist

- [x] Update existing docs and task evidence without declaring acceptance/Done.
- [x] Create docs/checkpoints/cp4-checklist.md covering all seven supplied items.
- [x] Record ten+ actual test cases with three+ hard/edge cases and limitations.
- [x] Run application/automation/frontend suites, build, model/browser checks,
  links/whitespace, and fresh-context review. Commit/publish only after authorized.

Execution ruling: user repeatedly authorized implementing the described workflow;
record that approved design and execute inline without another approval pause.
Use .work/saved-review/progress.md as the resumable ledger.

Publication ruling: the user's subsequent "commit and pr" authorizes committing
this complete saved-review feature and documentation, pushing its focused branch,
and opening a PR. Main now contains the camera work under rebased commit IDs;
rebase the new local feature commit onto updated main, preserving the unrelated
next-env.d.ts edit. Do not merge, force-push or create checkpoint tags.

## Task 5 — Faculty setup refinement (subsequently authorized)

- [x] Add tested decoded-timestamp inspection and stable multi-frame seat suggestions.
- [x] Add bounded/cancellable preparation API and enforce timing checks on processing.
- [x] Collapse technical settings/coordinates; add simple seat names/redraw/remove,
  Suggest seats with manual fallback and explicit replacement of existing edits.
- [x] Verify actual sample and FourPeople footage, timing failures, suggestion
  correction, default processing, cancellation and desktop/mobile behavior.
- [x] Update checklist, before/after table and verification evidence; preserve the
  earlier raw evidence as historical rather than describing current limitations incorrectly.

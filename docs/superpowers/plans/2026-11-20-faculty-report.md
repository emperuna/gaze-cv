# Faculty Seat Check Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the live camera session PDF with a three-part faculty report (summary with seat map and timeline, alert details, blind spots and review) matching the approved mockup.

**Architecture:** Node builds a structured `faculty` section from the saved session record (pure, tested). The existing PDF route sends it to `scripts/render_incident_report.py`, whose renderer gains a camera-only layout that draws the seat map and timeline with ReportLab graphics. New optional exam details (title, room, proctor) are entered at camera setup and saved in the record.

**Tech Stack:** TypeScript (Next.js 16, `node:test`), Python 3.12 with ReportLab 5.1.0 (`unittest`).

**Spec:** `docs/superpowers/specs/2026-11-20-faculty-report-design.md` (mockup: https://claude.ai/artifact/86XCi8Zj5wdPAN2wjYsyo8).

## Global Constraints

- Faculty are the main users: plain words; no "suspicious", "cheating", "incident", "violation" or "catch" in new text (the existing disclaimer sentence "Head movement ... does not establish cheating" style wording is allowed only as a negation).
- Saved video and image PDFs are unchanged.
- Ocular stores no student names; the Student column is blank for handwriting.
- Times are clock times in the laptop's local time zone, `h:mm AM/PM` (`en-US`, `hour:'numeric', minute:'2-digit'`).
- Existing limits stay: ≤ 200 stills, images only from the session folder, report JSON ≤ 4 MB, PDF ≤ 48 MB.
- Exam fields are optional strings, trimmed, each ≤ 120 characters.
- Footer on every page: "Confidential: contains images of students. Keep only as long as your institution allows." and "Page N of M".
- Do not run `npm run build` (it rewrites the user's uncommitted `frontend/next-env.d.ts`); use `npm run typecheck` and `npm test`. Do not commit unless the user says so. Never stage `frontend/next-env.d.ts` or `frontend/AGENTS.md`.

## Review Focus

1. A session with **no alerts**: page 1 says "No seats to look at again." and page 2 says "No alerts during this session."; nothing crashes. Test in Tasks 2 and 3.
2. A **120-character exam title** and **20 seats**: header wraps, seat map and timeline stay legible on one page width. Test in Task 3.
3. A **resumed session**: clock times after the gap use the second segment's start time, and the gap shows as a camera-off band and a blind-spot row. Test in Task 2.
4. A **session still running** when the PDF is made: the time range ends "now (still running)". Test in Task 2.
5. A **mirrored camera**: the seat map shows seats as the camera sees them (same flip as `displaySeats`). Test in Task 2.

---

### Task 1: Exam details at setup

**Files:**
- Modify: `frontend/src/lib/live-alerts.ts` (settings type), `frontend/src/lib/server-live-session.ts` (`monitor`), `frontend/src/app/api/camera/[sessionId]/monitor/route.ts` (doc comment), `frontend/src/components/camera-workspace.tsx` and `frontend/src/components/camera-setup.tsx` (fields)
- Create: `frontend/src/lib/exam-details.ts`
- Test: `frontend/tests/exam-details.test.mjs` (register in `frontend/scripts/run.mjs`), `frontend/tests/camera.test.mjs`

**Interfaces:**
- Produces: `interface ExamDetails { title: string; room: string; proctor: string }`; `EMPTY_EXAM: ExamDetails`; `validateExamDetails(value: unknown): ExamDetails` (absent → `EMPTY_EXAM`; trims; a non-string or > 120 characters throws `Error('Exam details must be text of at most 120 characters.')`). `LiveSessionRecord['settings']` gains optional `exam?: ExamDetails`. Monitor body gains optional `exam`.

- [ ] **Step 1:** Tests in `exam-details.test.mjs`: absent → empty strings; `"  Math 101  "` → `"Math 101"`; 121 characters throws; a number throws. In `camera.test.mjs`: monitor with `exam:{title:'Math 101 Midterm',room:'204',proctor:'Prof. Cruz'}` saves it on `record.settings.exam`; monitor without `exam` saves `EMPTY_EXAM`.
- [ ] **Step 2:** Run `cd frontend && npm test` → the new tests FAIL.
- [ ] **Step 3:** Implement `exam-details.ts`; in `monitor()` call `validateExamDetails((value as {exam?:unknown}).exam)` (AnalysisError 400 on throw) and put it in `settings`; Resume keeps the record's settings unchanged.
- [ ] **Step 4:** UI: in the idle phase, under the Camera select, a group titled **About this exam (optional)** with three labelled inputs (`id` `camera-exam-title` "Exam or class", `camera-exam-room` "Room", `camera-exam-proctor` "Proctor"), `maxLength={120}`, plain help line "Printed at the top of the PDF report. Leave blank to write it in by hand." Values live in workspace state and are sent with the monitor request.
- [ ] **Step 5:** `npm test` and `npm run typecheck` → PASS.

### Task 2: Build the faculty report data

**Files:**
- Create: `frontend/src/lib/faculty-report.ts`
- Modify: `frontend/src/lib/incident-report.ts` (`IncidentReport` gains optional `faculty`; `liveSessionReport` attaches it)
- Test: `frontend/tests/faculty-report.test.mjs` (register in `run.mjs`)

**Interfaces:**
- Consumes: `LiveSessionRecord`, `LiveAlert`, `MovementEvent`, `displaySeats` (camera-sessions.ts), `ExamDetails`.
- Produces: `facultyReport(record: LiveSessionRecord, opts: { hasStill: (still: string) => boolean; now: Date; timeZone?: string }): FacultyReport` and `clockAt(record, sessionSeconds, timeZone?): string`. `FacultyReport` (JSON, all strings already formatted):
```ts
{ exam: ExamDetails; date: string /* "Thursday 20 November 2026" */; timeRange: string /* "9:00–10:30 AM (1 h 30 min)" or "9:00 AM – now (still running)" */;
  seatsWatched: number;
  glance: { alerts: number; lookAgain: number; notReviewed: number; notWatchedMinutes: number };
  seats: { seat: string; status: 'look-again' | 'dismissed'; alerts: number; saw: string; when: string; marks: string }[];
  quietSeats: string /* "No alerts: Seats 1, 3 and 6." or "" */;
  map: { label: string; roi: [number, number, number, number]; status: 'look-again' | 'dismissed' | 'none'; hidden: boolean }[];
  timeline: { ticks: { at: number; label: string }[]; rows: { label: string; marks: { at: number; kind: 'checked' | 'not-reviewed' | 'dismissed' }[]; hidden: { from: number; to: number }[] }[]; off: { from: number; to: number }[] };
  alertGroups: { seat: string; status: 'look-again' | 'dismissed'; alerts: { time: string; title: string; rule: string; mark: 'Checked' | 'Dismissed' | null; markedAt: string | null; note: string; image: string | null; imageNote: string | null }[] }[];
  blindSpots: { what: string; when: string; reason: string }[];
  reviewSeats: string[]; rules: string; sessionLine: string }
```
- Rules (from the spec): look-again = a seat with ≥ 1 alert whose mark is not `Dismissed`; order look-again by non-dismissed count desc, then total alerts desc, then seat number; then dismissed-only seats by seat number. `at` values are fractions 0–1 of session time `[0, lastTime]`. Clock time = the last segment with `offsetSeconds ≤ t` → `startedAt + (t − offsetSeconds)` seconds. Hidden fraction = `1 − observedFrames/frames`; `hidden: true` when ≥ 0.10. Hidden stretches = coverage `gaps` plus an open `unknownSince` tail ≥ 2 s. Off bands = gaps between segments. Titles: sustained → `Looked right for 4.2 seconds`; repeated → `Turned right 4 times` (repetition count); a grouped alert's `time` spans first–last when they differ (`9:47–9:49 AM`). `rule`: sustained → "Held one direction longer than the 2-second rule." (seconds from settings), repeated → "Repeated turns: 3 or more within 10 seconds." (from settings). Blind spots: each off band → `{what:'Whole room not watched', when:'9:50–9:53 AM (3 min)', reason:'Camera stopped; monitoring resumed'}`; each hidden seat ≥ 1% → `{what:'Seat 6 hidden', when:'9:20–9:31 AM · 12% of the exam' (longest stretch, else "Short moments"), reason:'Face not visible'}`. `imageNote` = "Photo unavailable" when `image` is null. `rules` = "An alert means a head in that seat turned left or right for 2 seconds or more, or 3 times within 10 seconds. Looking down (writing) never raises an alert. Ocular does not recognise anyone and does not decide whether anyone cheated: you do." with the session's numbers. `sessionLine` = "Session details for your records: session <first 8 of id> · camera started <clock> · alert rules: <n> s, <k> turns in <w> s."

- [ ] **Step 1:** Tests: ranking and status for the mockup's sample (Seat 4: 2 Checked + 1 unreviewed → first, look-again; Seats 2 and 5 dismissed); glance numbers (5, 1, 1, 3); `clockAt` across a resume (segment 2 startedAt 9:53 local, offset 3000 → t=3060 → "9:54 AM"); off band and blind-spot row for the resume gap; hidden flag at exactly 10%; mirrored seats flip like `displaySeats`; no alerts → `seats: []`, `alertGroups: []`, `glance.alerts 0`; still-running time range; titles for sustained and repeated; missing still → `image:null, imageNote:'Photo unavailable'`; use `timeZone:'Asia/Manila'` in tests for stable output.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implement `faculty-report.ts`; `liveSessionReport` sets `report.faculty = facultyReport(record, {hasStill, now: new Date()})` and keeps its other fields for compatibility.
- [ ] **Step 4:** `npm test`, `npm run typecheck` → PASS.

### Task 3: Render the faculty layout

**Files:**
- Modify: `src/gaze/incident_pdf.py` (validate `faculty`; `mode=='camera'` with `faculty` → new layout), `scripts/render_incident_report.py` only if needed
- Test: `tests/test_incident_pdf.py`

**Interfaces:**
- Consumes: Task 2's `faculty` JSON inside the report.
- Produces: `render_incident_pdf(value)` unchanged signature; camera reports with `faculty` use the new layout; without it, the current layout (old records' PDFs still work).

- [ ] **Step 1:** Tests: validation rejects a non-dict `faculty`, strings over 2000 characters, `at` outside 0–1, more than 20 map seats or timeline rows, and images outside `imageRoot` (reuse `resolve_image`); render the mockup sample → PDF bytes, ≥ 3 pages; spy on drawn text (Paragraph texts and canvas `drawString`) to assert: "Seats to look at again", "Where the seats are", "When alerts happened", "Each alert, with its photo", "What Ocular could not see", "Your review", "How to read this report", "Page 1 of", the confidential footer, an empty exam title printed as a blank line, and none of the banned words; a 0-alert session renders "No seats to look at again." and "No alerts during this session."; a 120-character title and 20 seats render without error.
- [ ] **Step 2:** `.venv/bin/python -m unittest tests.test_incident_pdf -v` → FAIL.
- [ ] **Step 3:** Implement. Page 1: header (small caps label "OCULAR · SEAT CHECK REVIEW", exam title or a blank line, date · time range · room, proctor · seats watched, a "CONFIDENTIAL · CONTAINS STUDENT PHOTOS" tag); four glance boxes; seats table with columns Seat · Student (blank line) · What Ocular saw · When · Your marks, look-again rows tinted; quiet-seats line; seat map (`reportlab.graphics.shapes.Drawing`, boxes from `roi` scaled into ~200×120 pt, label "As seen from the camera", look-again filled, hidden dashed) beside the timeline (Drawing ~300 pt wide: rows, ticks, marks coloured checked/not-reviewed/dismissed, hatched hidden, camera-off band, legend); the rules note. Page 2 (new page): alert groups with heading per seat and a LOOK AGAIN tag, each alert as a table row of photo (≤ 160 pt wide, look-again) or smaller (dismissed) beside time/title/rule/mark/note; unreviewed alerts tinted with "☐ Nothing to follow up ☐ Follow up". Page 3 (new page): blind-spot table; Your review box (per review seat: "☐ Follow up ☐ No action" + a line; overall notes lines; Reviewed by / Signature / Date lines); How to read this report; the session line. Footer with "Page N of M" via a two-pass canvas (ReportLab `canvasmaker` counting pages).
- [ ] **Step 4:** Run the Python tests → PASS; full `.venv/bin/python -m unittest discover -s tests` (only the two known macOS path failures remain).

### Task 4: End-to-end check and docs

**Files:**
- Modify: `frontend/README.md` (PDF paragraph in "Using the live camera"/camera section), `docs/review-workload.md` (camera PDF section), `docs/asus-android-camera-guide.md` (checklist row 10 wording)
- Create: none

- [ ] **Step 1:** Generate a sample PDF from a fabricated record (seats 1–6, the mockup's alerts, one resume gap, Seat 6 hidden 12%) through `liveSessionReport` → `renderReportPdf` into `.work/tmp/faculty-report-sample.pdf`; open page images (e.g. `pdftoppm` if available, else ReportLab's page count) and compare against the mockup; fix layout issues found.
- [ ] **Step 2:** Update the docs to describe the new report in plain words.
- [ ] **Step 3:** `npm test`, `npm run typecheck`, `.venv/bin/python .github/automation.py check`, `git diff --check` → PASS.

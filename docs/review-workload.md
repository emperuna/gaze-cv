# Review workload tools

Scope: the user-requested grouped review queue, camera/coverage checks and editable
session reports. These extend the existing saved-video review and optional camera
interfaces; they do not add multi-room processing, identity recognition or
misconduct decisions. Related backlog references are `cp4-export-review`
([Issue 26](https://github.com/emperuna/gaze-cv/issues/26)) and `cp4-camera`
([Issue 27](https://github.com/emperuna/gaze-cv/issues/27)). Live GitHub state was
unavailable; no Issue assignment, Project update or acceptance claim was made.

## Saved-video review

Open a completed session in **Saved video → Seats & movement review**.

- **Seat coverage checks** show usable direction coverage and unavailable
  intervals for every configured seat. Expand a seat and select an interval to
  seek to the gap. Coverage uses half-open source-frame intervals, including the
  last frame; it is not an accuracy or attendance measurement. Missing/unknown
  observations and observations with an unavailable reason count as unavailable.
- **Review queue** combines overlapping or nearby events for the same seat and
  direction, including sustained/repeated rule records. The maximum joining gap
  is two seconds. Unavailable frame observations at a join prevent grouping.
  Different seats and directions stay separate. Every original event remains
  available under its item and in the original downloads.
- **Play context** plays up to five seconds before and after an item, bounded by
  the processed source duration, and pauses at the end. The original video
  controls remain available.
- Set **Unreviewed**, **Reviewed** or **Follow-up needed**, add item notes, and
  edit the report's summary and proctor notes. These statuses describe human
  workflow, not model confidence or disciplinary findings.
- **Save review & report** persists the decisions on this computer. Unsaved
  edits block session/source switching within the workspace; save or explicitly
  discard them first. A browser unload warning also protects unsaved work.
- Enter a reviewer name and check the acknowledgement before saving to record
  a human sign-off timestamp. Editing decisions, notes, summary or reviewer name
  clears sign-off. This local acknowledgement does not authenticate a person or
  constitute a digital signature; pending items remain visible in a signed report.
- **Download editable report (.md)** exports the saved revision as Markdown.
  It includes event/rule timestamps, source hash, seat references, statuses,
  notes, coverage gaps, settings, grouping rules and sign-off. It is editable in
  a text editor. Edited exported copies do not change the saved session.

The coverage view shows the first 100 unavailable intervals per seat. Markdown reports
list the first 200 per seat and explicitly disclose any omission; the original
`review.json` retains every frame observation. The queue uses 20 items per page.
Item notes allow 2,000 characters, the summary 20,000, proctor notes 10,000 and
the reviewer name 120, with a total 2 MB saved-note/request limit.

## Camera checks

In **Camera**, set the expected visible head count (1–20; default 1) before
starting. It is a manually supplied visibility expectation, not a detected seat
layout. Camera mode still has no seat histories, recording, saved review queue
or movement events. The PDF extension below adds numeric observation summaries.

Checks run once per second while processing is live:

- Ended camera tracks stop processing with a disconnection message; muted tracks
  show an interruption warning until they recover.
- A preview that has not advanced for five seconds warns of a frozen or
  disconnected source.
- No result after five seconds, or annotations from a capture at least five
  seconds old, warns that processed coverage is unavailable/stale. Annotations
  stay attached to their captured frame rather than to the current preview.
- A continuing shortfall in usable head observations prompts a visibility check.
  A stale result cannot establish continuing low coverage; a gap of at least
  five seconds between processed captures resets this check.
- A 32 × 18 preview sample checks for very dark or nearly uniform images.
  Mean luma below 12/255 or luma standard deviation below 4/255, continuing for
  five seconds, prompts a lens/view check. A stale or interrupted preview does
  not establish a current image-quality problem.

These are experimental technical warnings. Poor lighting, an empty room, small
heads, ordinary occlusion and model failures can produce warnings. The system
does not diagnose an obstruction, infer intent or establish that all seats are
observable. Stop clears live warnings; frames stay in memory.

## Storage and failure handling

`outputs/runs/review/<session-id>/review-workflow.json` stores only human review
state. Original model events, settings, histories and media remain unchanged.
Local-origin guards and existing UUID/path containment checks apply to the
workflow and report APIs. Notes are validated server-side; report text escapes
HTML and Markdown structure.

Saves take an exclusive per-session file lock, check the loaded revision, write
and sync a temporary file, and rename it into place. A conflicting save returns
409 with the existing notes preserved. **Reload saved review (discards edits)**
loads the latest saved revision explicitly. Corrupt existing note files produce
an error instead of being silently overwritten. After a server crash, a leftover
`review-workflow.lock` may need manual removal from that session's directory
after confirming that no save is running.

## Verification

Frontend regression tests cover grouping boundaries and preserved originals,
seat/direction separation, unavailable joins, frame-based coverage denominators,
status validation, persistence/reopening, save conflicts, lock/corruption
handling, sign-off clearing, report content/escaping and camera warning recovery.
The existing Python suite verifies the unchanged observation pipeline.

Verification recorded on 17 November 2026:

- `npm test`: 36 frontend tests passed (including 10 new regression tests).
- `npm run typecheck`: passed; production compilation also checks types.
- `$env:NEXT_DIST_DIR='.next-review-verify'; npm run build -- --webpack`:
  final production build passed after the dependency warning acknowledgement.
- `.venv\Scripts\python.exe -m unittest discover -s tests -v`: 164 passed.
- Browser checks passed for default state, grouping, context playback and pause,
  gap seeking, saved decisions/reopening, sign-off clearing, report content and
  attachment headers, source-record preservation, two-tab conflicts/reload,
  filters, local-origin enforcement and oversized-request rejection.
- Desktop (1440 px) and mobile (390 px) were inspected; mobile had no horizontal
  overflow. Browser page-error capture was empty.
- `git diff --check` and 55 local Markdown link-target checks passed; no conflict
  markers were found in the changed source/documentation.
- A synthetic camera stream with stubbed inference verified dark-view,
  low-coverage, stale-result, interrupted-track and ended-track warnings,
  recovery and track release. These checks did not use a physical camera or
  establish model accuracy. Saved playback used the permitted office proxy with
  explicitly synthetic events and seat states in a temporary session; that
  session was removed afterward.
- The initial sandbox restricted subprocesses and temporary-file access. The
  passing frontend/Python runs used scoped escalation with project-local caches
  and temporary files. No dependency installation or model change was needed.
- Next.js emitted a warning about a known dependency security vulnerability.
  Dependency upgrades are separate from this feature scope.

Representative classroom accuracy, obstruction detection quality, physical
camera disconnection and examination-scale performance remain unvalidated.
The existing five-minute/20-seat/single-local-processor limits still apply.
These tools do not satisfy outstanding academic or independent validation gates.

## PDF reports for all three options

The PDF download control stays visible in a prominent report bar above the
analysis controls for every source, even before results exist. It is disabled
until a report is ready, with nearby text explaining whether to analyze an input,
open a saved session, save review edits, or Stop the camera. On narrow screens the
button spans the report bar's width.

The 18 November extension adds **Download PDF report** to Image, Saved video
(both workflows) and Camera. The document is titled **Potential incident review
report**. It lists observations to check for possible examination irregularities;
it does not identify cheating or assign misconduct scores.

| Source | Report evidence and limits |
| --- | --- |
| Image | Non-forward usable detections, image-box references, method, source hash and coverage/unknown limitations. There is no source-session timestamp, duration, repetition, seat identity or intent inference. |
| Saved video: Directions only | Individual source-frame timestamps and direction counts; no continuity/person track is invented between frames. |
| Saved video: Seats & movement review | Grouped movement records with source timestamps, original rule references, seat regions, saved review statuses/notes, coverage gaps, proctor notes and local sign-off. |
| Camera | Processed capture timestamps, frame-level direction counts, zero-usable-head frame counts and gaps of at least five seconds between processed captures. These are observations, not seat histories or continuous movement events. |

Empty results still generate a PDF and state that no listed observations do not
establish absence of incidents. Image/video reports are generated from completed
local records; no model rerun is needed. Reports from older directions-only runs
without `analysis-result.json` require reprocessing once. Human edits in saved
review must be saved or discarded before exporting the PDF, so the document never
silently represents unsaved notes as a saved revision.

Camera summaries are held in server memory without JPEGs, boxes, identities or
recorded media. Stop/disconnection schedules expiry after 30 minutes; expiry also
applies on access. Server restart clears the cache, and at most eight sessions
are retained. Only the first 18,000 frame summaries are retained; totals include
later frames and the PDF explicitly discloses any missing detail. Download after
Stop and before leaving the workspace. Download failures show a recovery message.

Each PDF lists at most 500 review observations, explicitly stating any omitted
count. Saved-seat PDFs list up to 25 gap intervals per seat and 25 original rule
records per grouped item, with disclosure pointing to original JSON for further
detail. The existing Markdown report keeps its earlier limits. These limits
bound document size; they do not establish examination-scale capacity.

The PDF renderer runs from the local `.venv` using the pinned ReportLab and
charset-normalizer additions in `requirements.txt`. JSON input is limited to
4 MB, PDF output to 8 MB, generation to 30 seconds and simultaneous PDF jobs to
two. Generation stays in memory and does not fetch external assets. Text is
escaped and unsupported embedded-font glyphs appear as explicit Unicode
codepoint tokens instead of silent blank boxes. Existing UUID/path containment
and local-origin guards protect all three routes:

- `GET /api/analyze/<uuid>/report`: Image or directions-only saved video PDF.
- `GET /api/review/<uuid>/report?format=pdf`: saved-seat PDF; the default route
  continues to provide editable Markdown.
- `GET /api/camera/<uuid>/report`: retained numeric camera summary PDF.

Verification for this extension is recorded separately from the historical
17 November checks above. Physical-camera and representative classroom incident
accuracy remain unvalidated; no threshold/model tuning or checkpoint claim was
made by adding the exports.

### PDF verification on 18 November 2026

- `npm test`: 45 passed, including source-specific PDF contents, explicit
  truncation, numeric-only camera retention, capacity/expiry, timed deletion
  without further access and correlated worker collection.
- `npm run typecheck` and the production webpack build passed. The build
  continued on retry after the existing Next.js dependency security notice;
  that warning remains separate work.
- `.venv\Scripts\python.exe -m unittest discover -s tests -v`: 169 passed after
  the final pagination changes; `pip check` found no broken requirements.
- Browser downloads passed for Image, directions-only Saved video, saved-seat
  review and Camera after Stop. Image/video processing used actual baseline
  inference with permitted repository samples. Camera used the actual worker
  with a staged stream of a permitted sample image; it was checked again against
  the production build after the retention change. No physical camera was used.
- Browser checks covered PDF magic bytes, attachment/MIME/cache headers,
  local-origin rejection, missing camera-report errors, save-before-export,
  error display/retry, track release and a 390 px layout without overflow.
  Browser page-error capture was empty.
- Four representative PDF cases (image, empty image, camera and saved-seat
  video with long notes) produced ten pages. Text extraction verified timestamps,
  coverage, human statuses, plain-text markup and Unicode handling. All pages
  were rendered and visually inspected, with page-bound checks for clipping.
  Poppler was unavailable, so project-local PyMuPDF rendered the pages and
  project-local pypdf checked the extracted text; these QA packages were kept
  under `.work/pdf-tools`, outside application dependencies.
- The temporary verification server was stopped and the user's existing
  `next-env.d.ts` edit restored exactly. No commit, push, live task assignment
  or checkpoint acceptance was performed.
- `git diff --check`, conflict-marker scanning and 61 local Markdown link-target
  checks passed.

PDF-control visibility follow-up on 18 November: the persistent report bar was
checked in the initial viewport at 1440 px and 390 px for Image, both Saved video
workflows, and Camera. Disabled explanations, saved-review dirty/ready states,
absence of overflow and PDF downloads from the relocated controls passed browser
checks. The running site on port 3000 served the new report bar. TypeScript,
45 frontend tests, 169 Python tests and the separate production build passed;
the existing dependency security warning remains unchanged.

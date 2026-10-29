# Saved-review verification

Task: `cp4-export-review` (#26). Date: 29 October 2026. User approved the local
website integration and requested a CP4 checklist and before/after table. Work
is on `feat/saved-video-review`; the user subsequently authorized committing and
opening a PR. The camera work is already present on updated `main`. No hand-in
tag, Issue claim, Project update or academic acceptance is claimed.

## Checks

Initial integration suites: **151 application tests, 16 automation tests and 26 frontend
tests passed**. TypeScript, webpack production build, repository documentation
checks and whitespace checks passed. Test counts are behavioral verification,
not an implementation-completion percentage.

- Python session tests cover aligned exports/provenance, missing/ambiguous gaps,
  strict settings, input/output collision, corrupt media, mirroring consistency,
  and frame/output-budget boundaries.
- Frontend review tests cover seats/settings, mirroring, exact frame boundaries,
  out-of-coverage clearing, single HTTP byte ranges and cancellation during the
  real final-manifest rename.
- Production webpack build and TypeScript checks passed using
  `NEXT_DIST_DIR=.next-review-verify` to preserve existing development output.
- Both real models processed the permitted 24-frame sample WebM through the API:
  baseline returned 24 forward observations and no events; head returned 24 right
  observations and one movement event. This is integration evidence, not accuracy.
- API checks verified exported source hashes/events, correct 206/416 byte ranges,
  unknown asset rejection, cross-origin rejection, invalid seats, unconfirmed CFR,
  and corrupt-video failure.
- Headless Brave/Playwright exercised visual seat drawing, numeric editing and
  rename; real head-model processing; click-to-seek; history/provenance; synthetic
  missing observations; independent JSON downloads; Stop and shared-slot release;
  reload/reopen even when absent from the latest-session list; desktop/390px
  responsive DOM checks; basic video/image navigation; no page JavaScript errors.
- Browser follow-up also verified seeking to the synthetic fixture's second
  event at a nonzero timestamp and clearing the entire annotation canvas at the
  end of processed coverage.
- No screenshot deliverables were created. The deterministic design detector
  returned no findings; browser assertions checked controls/overflow, not a full
  human visual/keyboard acceptance review.

The browser event/gap fixture uses injected observations and is explicitly named
SYNTHETIC. It validates presentation/timing separately from real-model inference.
Two review findings were fixed: older links now fetch metadata directly, and
cancellation during publication removes the completed manifest. Regression
checks for both pass.

Commands (project-local cache/TEMP setup from README applies):

```sh
.venv/bin/python -m unittest discover -s tests -q
.venv/bin/python .github/automation.py check
.venv/bin/python -m unittest discover -s .github/tests -q
cd frontend
../.work/node-runtime/node_modules/node/bin/node scripts/run.mjs test
npm run typecheck
NEXT_DIST_DIR=.next-review-verify npm run build -- --webpack
```

The project-local Node 22 runtime was used because the default Node 20 cannot run
the existing strip-types test command. No application dependencies were added.
One permission-review timeout for starting the verification server was retried
successfully. All tools, profiles and temporary harnesses stay in `.work/`.

## Limits and remaining evidence

Only compatible constant-cadence clips are supported. The subsequent faculty
refinement replaces user confirmation with decoded timestamp checks; diagnostics
and tolerance are retained in review JSON. Media is bounded to
64 MB, five minutes/18,000 decoded frames, 1920 × 1080 source pixels, 20 seats,
64 MB compact review JSON and a 512 MB output budget (checked periodically).
Truncated/over-budget runs fail and are not listed as completed. Partial files
can remain ignored locally until manual cleanup. No background queue, live
progress percentage, automatic deletion, identity tracking, desk calibration,
or recording of live-camera sessions was added.

Manual multi-seat classroom/proxy labeling, seat consistency, real-event
precision/recall, writing false alerts, representative laptop throughput,
held-out test results, human reproduction, report/slides, and backup recording
remain separate work. Neither integration success nor passing tests establishes
80% completion or the 80% accuracy/10 FPS project targets.

[Actual test-case table](../../checkpoints/cp4-test-cases.md) ·
[CP4 checklist](../../checkpoints/cp4-checklist.md) ·
[Before/after table](../../checkpoints/cp4-before-after.md).

## Faculty setup refinement

Final refinement suites: **157 application tests, 16 automation tests and 26
frontend tests passed (199 total)**. Type checking, webpack production build,
repository link/dependency checks and whitespace checks passed. Browser/API
checks below are additional integration evidence, not accuracy scoring.

Faculty are the intended default users. The user approved hiding technical
configuration, optional automatic seat suggestions with manual correction, and
replacing the frame-rate attestation with automatic inspection. Exact controls
remain under Advanced settings and Advanced seat editing. A plain-language
summary explains active rules; Confirm seats & process is the main action.

`review_setup.py` checks all decoded presentation timestamps against source FPS,
allowing 1.1–2 ms container quantization. Unavailable/duplicate/nonfinite or
inconsistent/variable timing is rejected; no external ffprobe install or automatic
conversion is required. Setup uploads use bounded temporary directories removed
after worker exit; actual processing rechecks the source. Timing checks are
operational compatibility evidence, not pose/seat accuracy.

Suggestions cluster repeated head detections from up to five spread-out source
frames, retain distinct heads in each sample, require repeated visibility, and
produce at most 20 nonoverlapping regions. Expansions shrink to raw bounds when
padding conflicts; a reviewed regression ensures padding cannot drop a distinct
neighbor. Zero detections return manual guidance. Confirmed regions remain fixed;
there is no identity recognition or automatic seat relocation during gaps.

The real FourPeople clip's 601 frames passed timing inspection (maximum cadence
deviation about 0.333 ms). After the nearby-head padding correction, the head
method suggested five regions for four participants from five sampled frames;
the extra small region requires manual removal. The earlier four-region output
had masked that candidate through padding conflict. This is a documented false
suggestion, not evidence of perfect seat detection or classroom accuracy.
Direct CCTV/RTSP/ONVIF connections remain future work; exported compatible footage
from a fixed camera can use the upload path.

[Faculty setup before/after table](../../checkpoints/faculty-setup-before-after.md).

Faculty browser checks passed: hidden model/threshold/coordinate controls and no
frame-rate checkbox; real seat suggestions; renaming and visual redraw without
duplicating a seat; retaining existing edits until explicit replacement; optional
advanced values saved with real inference; event seeking/reload; 390px overflow
check; manual removal of the FourPeople extra candidate; rejection of actual
irregular browser-recorded video; synthetic zero-head fallback; real baseline
suggestions; no page JavaScript errors. The irregular browser video and injected
zero-head fixture are separate from real-model suggestion accuracy evidence.
An actual in-flight preparation cancellation also released the shared processor,
allowed a subsequent camera session and removed its temporary uploaded footage.

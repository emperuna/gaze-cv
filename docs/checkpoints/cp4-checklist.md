# CP4 — 80% progress checklist

Hand in one package per team by **Thursday 12 November 2026, 11:30 PM**;
class check **Friday 13 November**. Confirm the deadline timezone. These dates
and the seven items below come from the Phase 4 instructions supplied by the
user. This checklist does not establish submission or 80% completion.

Checked implementation items have technical evidence in the
[saved-review verification record](../superpowers/specs/2026-10-29-saved-review-verification.md).
Unchecked items need team work or human acceptance. Historical checkpoint
records remain historical; a working UI is not proof of classification accuracy.

## 1. Nearly complete working application

- [x] Image input and automatic/baseline direction processing exist.
- [x] Saved-video direction-only processing remains available.
- [x] Saved-video review integrates visual/numeric seat setup, directions,
  source-time histories, movement events, playback, downloads and reopening.
- [x] Faculty setup offers seat suggestions with manual correction; coordinates
  and analysis thresholds are collapsed by default, with active rules explained.
- [x] Setup and processing check decoded frame-timestamp cadence automatically;
  unsupported timing is rejected rather than delegated to a faculty checkbox.
- [x] Missing/ambiguous observations remain explicit and break continuity.
- [x] Movement duration, repetition count/window, dwell and gap are configurable
  and retained with each session.
- [x] Processing Stop cancels work and releases the shared inference slot.
- [x] Optional camera direction mode exists; it is separate from seat/event review.
- [ ] Agree the planned implementation scope and effort weights with the team.
- [ ] Calculate evidence-backed completion: sum of accepted completed effort /
  total planned effort × 100. Reach at least 80%; do not count screens or test
  count as implementation percentage, and do not equate it to prediction accuracy.
- [ ] Verify the integrated workflow with at least three fixed seats on suitable
  authorized footage and record limitations/remaining requirements.
- [ ] Have another member reproduce setup and the demonstration on the intended laptop.

## 2. Interface or visualization

- [x] Website provides image/video input and optional webcam input.
- [x] Review player shows fixed-seat regions, detection boxes, direction labels,
  current observation states and source time.
- [x] Movement-event table filters by seat/type and seeks to event start.
- [x] Histories, session settings/source hash and independently readable downloads
  are accessible; completed sessions reopen without rerunning inference.
- [x] Browser workflow checked at desktop and 390px widths; no horizontal overflow.
- [ ] Perform human usability/keyboard checks on the actual demonstration setup.
- [ ] Check the physical camera if it will be demonstrated; it is optional.

Suitable fixed-camera/CCTV exports can use uploaded video. Direct CCTV stream
connections are a future extension and are not required or implemented here.

GAZE exposes detector/direction observations, not a calibrated probability of
misconduct. The examples of confidence/masks in the brief are illustrative;
do not invent confidence values or unsupported outputs.

## 3. Held-out evaluation, laptop speed and CP3 comparison

- [ ] Confirm held-out labels, source/subject separation, permissions and leakage checks.
- [ ] Freeze preprocessing/model/threshold/settings versions before test inference.
- [ ] Reconcile the new CP4 held-out-test requirement with the older roadmap/task
  sequencing that locked final test scoring until CP5. The supplied Phase 4
  instruction governs this hand-in; record the revised protocol before scoring.
- [ ] Provide the requested `src/evaluate.py` entry point, or confirm that the
  instructor accepts the existing evaluator location. The current
  `scripts/evaluate.py` deliberately scores validation only; it is not yet a
  CP4 held-out evaluation entry point.
- [ ] Run baseline and main method on identical held-out inputs with identical
  label mapping and failure accounting. Count missed/unknown cases in denominators.
- [ ] Export accuracy, macro-F1, confusion matrices, coverage, counts and provenance.
- [ ] Evaluate seat consistency and movement precision/recall/writing false alerts
  against independently labeled video, if claiming those behaviors are reliable.
- [ ] Measure representative end-to-end saved-video speed on the demo laptop;
  record CPU/runtime, source resolution, face count, settings, warmup and exclusions.
- [ ] Compare with CP3, explaining changed conditions and dataset limitations.

CP3's 63-image stress-set baseline/main accuracies were 46.03%/20.63%.
Different test-set scores are not a directly comparable improvement. The new
24-frame integration smoke clip and passing tests are not held-out accuracy,
event-accuracy, or representative laptop-performance evidence.

## 4. Performance analysis and limitations

- [x] Current operating limits are documented: local-only server, 64 MB upload,
  CFR MP4/WebM browser playback, 5 minutes, 18,000 frames, at most 1920 × 1080
  source pixels, 20 seats and bounded session outputs.
- [x] Documentation distinguishes camera-relative head direction from desk-relative
  calibration, positions from identities, and movement observations from misconduct.
- [ ] Collect representative successes/failures: blur, dim lighting, small/profile
  heads, occlusion, crowded/missing seats and ordinary writing.
- [ ] Explain observed failure mechanisms using actual outputs rather than speculation.
- [ ] Report accuracy/coverage/speed tradeoffs and conditions not designed for.
- [ ] State every incomplete/unvalidated PRD requirement and any fallback decision.

## 5. At least ten test cases

- [x] [Test-case table](cp4-test-cases.md) records IDs, inputs, conditions,
  expected/actual outcomes and pass/fail, with more than three hard/edge cases.
- [x] Technical tests include real-model integration, synthetic event sequences,
  malformed inputs, observation gaps, cancellation and reopening.
- [ ] Have a team member execute representative cases on the actual demo laptop.
- [ ] Add labeled real-video correctness cases; synthetic rule tests do not
  establish real event precision/recall or classroom accuracy.

## 6. Report draft and presentation draft

- [ ] Introduction: problem, users, objectives, scope and review-aid limitations.
- [ ] Data: permissions, sources, labels, split counts, hard cases and preprocessing.
- [ ] Method: baseline/main models, seat association, history/gap rules, movement
  settings, interface integration and saved-session provenance.
- [ ] Experiments: frozen protocol, metrics, demo hardware, CP3 comparison and errors.
- [ ] At least eight draft slides: problem; scope; data; architecture; methods;
  application demonstration; results/speed; limitations and remaining work.
- [ ] Each member reviews the draft and can explain their contribution.

## 7. Backup demonstration and hand-in

- [ ] Record a demonstration no longer than five minutes: startup, authorized
  input, seat setup, processing, playback/event seeking, saved reopening and limitations.
- [ ] Verify the recording plays independently and contains no unauthorized footage.
- [ ] Package the report, slides, held-out metrics, laptop speed, analysis,
  test-case table and recording with clear links from the repository.
- [ ] Team reviews the actual submission revision and checks all seven items.
- [ ] Commit the authorized final package, tag that hand-in commit `cp4-80`, and
  publish the branch/tag only when explicitly authorized. No tag was created here.
- [ ] Submit repository/tag link and required files; rehearse the 13 November class check.

Related tasks: `cp4-export-review` (#26), `cp4-event-evaluation` (#28),
`cp4-performance` (#29), and `cp4-hand-in` (#30). Local evidence does not update
GitHub assignments/Project state. See the [before/after table](cp4-before-after.md).

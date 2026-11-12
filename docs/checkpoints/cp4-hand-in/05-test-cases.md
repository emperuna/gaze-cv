# 5. Executed CP4 test cases

**Execution date: 12 November 2026.** The table records actual automated outcomes on the demo computer. Injected/synthetic cases are explicitly identified. Technical Pass means the stated expectation was met, not that the model's predictions were correct. The speed and classifier targets are reported separately, including failures to meet them.

| ID | Input | Condition | Expected | Actual | Pass/fail |
| --- | --- | --- | --- | --- | --- |
| CP4-01 | Synthetic test manifest; injected baseline/head | Protocol creation | Record settings without test inference | Zero process calls at freeze; both methods later scored the same sample | Pass |
| CP4-02 | Same subject/source in validation and test | Edge: cross-split leakage | Reject before inference | Manifest validator raised leakage error; no process calls | Pass |
| CP4-03 | Manifest modified after freeze | Edge: changed protocol inputs | Reject and publish no result | Manifest hash mismatch raised before scoring | Pass |
| CP4-04 | Image bytes changed after freeze | Edge: corrupted integrity | Reject before either method | Checksum mismatch; no process calls | Pass |
| CP4-05 | Changed second-method model metadata | Edge: changed model/settings | Check both methods before any test inference | Settings mismatch; zero process calls and no result | Pass |
| CP4-06 | Checksum-valid unreadable image | Edge: undecodable input | Count unknown in both denominators | Each method had eligible=1, accuracy=0, unreadable_image reason | Pass |
| CP4-07 | Protocol path/existing results as output | Edge: overwrite request | Preserve inputs and previous reports | Protected/existing output requests rejected | Pass |
| CP4-08 | 10-frame sequence with missing frame | Edge: observation gap | Break movement continuity; retain unknown | Session regression verified split intervals and events at source times | Pass |
| CP4-09 | Two detections in one seat | Edge: ambiguous association | Unknown seat; clear review flag | Session regression verified ambiguous state and event restart | Pass |
| CP4-10 | Overlapping seats and invalid numeric rules | Edge: invalid configuration | Reject before processing/publication | Validators rejected overlap, duplicate IDs, NaN and invalid counts | Pass |
| CP4-11 | Permitted Pointing04 image through website | Real head model on laptop | Return annotated image and observation interface | Browser reached ANALYSIS COMPLETE with no page JavaScript errors | Pass |
| CP4-12 | FourPeople two-second excerpt; four drawn seats | Real head saved-video processing | Save 120 frames, settings, histories and descriptive events | 120 frames, four seats, 1 movement records; matching settings and downloadable records | Pass |
| CP4-13 | Saved source request bytes 0–31 | Edge: byte-range seek | Return HTTP 206 with exactly 32 bytes | Browser harness received 206 and 32 bytes | Pass |
| CP4-14 | Completed session after browser reload | Saved-session reopening | Restore saved session without inference | Saved-session selector restored the completed session ID | Pass |
| CP4-15 | Production browser at 390px width | Responsive layout | No horizontal overflow | documentElement.scrollWidth <= innerWidth; no page errors | Pass |
| CP4-16 | 120 checksum-verified held-out images | Both real methods, frozen protocol | All 120 images retained for each method | Baseline 99 correct; head 92 correct; seven unknowns each; JSON saved | Pass |

## Commands and evidence

- `python -m unittest discover -s tests -v`: 164 passed, including seven new held-out-protocol tests plus existing gap, ambiguity and configuration tests.
- `python -m unittest discover -s .github/tests -v`: 16 passed after rerunning temporary Git fixtures with the necessary filesystem access.
- `npm test`: 26 passed. `npm run build` and `npm run typecheck`: passed.
- [Current browser execution record](../../../outputs/evidence/cp4/browser-verification.json): real uploads, seat drawing, downloads, range access, reopening and mobile layout.
- [Held-out result](../../../outputs/evidence/cp4/held-out-results.json), [evaluator tests](../../../tests/test_checkpoint_evaluation.py), [session tests](../../../tests/test_session_review.py), [verification log](verification.md).

The existing [20-case record from 29 October](../cp4-test-cases.md) is retained as historical evidence. It is not relabeled as a new execution. More than three cases in the current table are hard or edge cases.

Remaining human checks: another member's fresh setup, keyboard/usability review and independently labeled classroom direction/seat/event/writing cases. The public office clip and synthetic fixtures do not establish real classroom event precision/recall.

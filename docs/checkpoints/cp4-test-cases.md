# CP4 technical test cases

Executed 29 October 2026 for the saved-review integration. Pass means the named
technical expectation was met; it does not establish direction/event accuracy
on real classroom footage. Model smoke footage is a 24-frame, 384 × 288 CFR WebM
made from the permitted Pointing04 sample `person01148+0+30.jpg`. The injected
event fixture is explicitly synthetic and separate from real-model evidence.

| ID | Input | Condition | Expected | Actual | Result |
| --- | --- | --- | --- | --- | --- |
| TC01 | 24-frame sample WebM; baseline | Valid seat/settings | Process all frames; persist settings/history/events with source hash. | 24 frames; 24 forward observations; zero movement events; matching exports/hash. | Pass |
| TC02 | Same WebM; automatic head model | Same input and seat | Process frames and expose movement outputs without assuming accuracy. | 24 frames; 24 right observations; one movement event. | Pass |
| TC03 | Browser upload of same WebM | Visual seat drawing plus numeric edit/rename | Save the edited region/name and selected duration. | Renamed `desk-A` persisted; real head inference completed and event displayed. | Pass |
| TC04 | Completed real-model session | Select movement-event start | Pause/seek to event source time; show matched annotations. | Browser seek matched start within one source frame; source-sized overlay and provenance/history shown. | Pass |
| TC05 | Saved synthetic event fixture | **Edge: missing frame at 1.5 s** | Show unknown/missing; do not bridge continuous movement or retain flag. | Player showed missing; Python gap tests split intervals and events. | Pass |
| TC06 | Synthetic 10-frame sequence | **Edge: two detections in one region** | Mark seat ambiguous/unassigned; reset history/event continuity. | Ambiguous/unknown recorded, active review flags cleared, later event restarted at 1.5 s. | Pass |
| TC07 | Overlapping/duplicate/zero-area/outside seats | **Edge: invalid configuration** | Reject before inference/session publication. | Python and frontend validators rejected cases; overlapping-seat API returned 400. | Pass |
| TC08 | Nonempty corrupt WebM | **Edge: unreadable media** | Clear failure; no completed review record. | API returned 422; Python test confirmed no review.json publication. | Pass |
| TC09 | Decoded timestamps `[0,17,80,97]` at 60 FPS; unavailable/duplicate timestamp variants | **Edge: irregular or unavailable timing** | Automatically reject timing incompatible with frame-indexed review. | Timing checker rejected variable, duplicate, missing and nonfinite timestamps; no user-attestation checkbox is required. | Pass |
| TC10 | Saved source HTTP requests | **Edge: valid/out-of-bounds byte ranges** | Valid range returns 206 and exact bytes; invalid range returns 416. | Requested first 32 bytes returned 32 bytes; out-of-range returned 416. | Pass |
| TC11 | Artifact URL and foreign browser origin | **Edge: disallowed access** | Reject unknown/prototype asset and nonlocal origin. | `__proto__` artifact returned 404; foreign Origin returned 403. | Pass |
| TC12 | Processing FourPeople proxy | Stop during processing | Abort child, release inference, do not add completed session. | Completed-session count unchanged; subsequent camera start/stop succeeded. | Pass |
| TC13 | Final manifest publication | **Edge: abort during actual rename** | Remove completed manifest and report cancellation. | Filesystem regression test aborted after rename; session.json was absent. | Pass |
| TC14 | Saved-session bookmark after reload | **Edge: session omitted from recent list** | Reopen intact session directly without inference. | Browser test hid list entries; metadata fallback reopened saved URL. | Pass |
| TC15 | Times around 0.25 s at 4 FPS | **Edge: exact frame boundary/outside coverage** | Use half-open frame intervals; return no frame past processed duration. | 0.249→frame 0, 0.25→frame 1, 0.75→no frame for 0.75 s coverage. | Pass |
| TC16 | Seat mirror round trip | Already mirrored pixels | Convert drawn/canonical rectangles once in each direction. | Coordinate assertions round-tripped within 1e-10. | Pass |
| TC17 | Invalid movement values/output limits | **Edge: NaN/zero/fractional count/limit breach** | Reject invalid settings or over-budget session without completed record. | Movement validators and simulated frame/output-budget boundary tests passed. | Pass |
| TC18 | 390px browser viewport; existing modes | Responsive navigation/regression | No horizontal overflow; preserve basic video/image workflows. | No overflow; Directions only and Image controls reachable; no page JavaScript errors. | Pass |
| TC19 | Repeated nearby synthetic head boxes across three frames | **Edge: close seats and padding conflict** | Keep distinct raw detections separate without overlapping regions. | Regression tests retain both seats; padding shrinks before any raw-region conflict is rejected. | Pass |
| TC20 | Empty detector outputs across three frames | **Edge: suggestions miss every head** | Return no invented seats and retain manual fallback. | Suggestion unit test returns empty seats and manual-setup guidance. | Pass |

Raw harness results remain project-local under `.work/saved-review/`. See
[verification commands and limitations](../superpowers/specs/2026-10-29-saved-review-verification.md).
The next required cases use independently labeled multi-person footage on the
actual demo laptop, including ordinary writing, low light, blur and occlusion.

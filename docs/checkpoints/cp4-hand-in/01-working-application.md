# 1. Working application and integration

**Ocular / GAZE — CP4 draft**  
Prepared: 12 November 2026  
Base source revision: `d60038d3f256f7d2bcc60e6c769018f8c47c2d3c`

**Status:** Integrated behavior and a four-seat office-proxy demonstration are verified on the demo laptop. Team review of the 80% calculation and classroom validation remain pending.

The current implementation offers three input paths through the local Next.js interface and shared Python modules. The source code separates reusable detection, preprocessing, direction classification, seat association, histories and movement logic under src/gaze. Scripts coordinate processing rather than duplicating the algorithms. [S02] [S14] [S17]

| Processing path | Implemented behavior | Evidence boundary |
| --- | --- | --- |
| Image and automatic saved video | Uploads call scripts/run.py using the head model or geometric baseline. Annotated media and direction records are saved. | Automatic directions are camera-relative. Counts are observations, not identities. |
| Saved video seat review | Seat suggestions/manual regions, configurable movement rules, synchronized overlays, event seeking, histories, downloads, Stop and reopening. | Suggestions need correction. Real seat consistency and event accuracy are unmeasured. |
| Optional browser camera | Device/method selection, Start/Stop, elapsed capture time and matching processed-frame overlays. Frames stay in memory. | Direction-only. Physical-camera and representative three-seat acceptance remain pending. |

## Integration evidence

The saved-review verification record reports 157 application tests, 16 automation tests and 26 frontend tests after the faculty setup refinement, for 199 technical tests. It also records real-model API processing, browser workflow checks, cancellation and reopening. These are historical checks from 29 October 2026, not new executions on this document date. [S04]

On a 24-frame, 384 by 288 smoke clip built from a permitted Pointing04 image, the baseline produced 24 forward observations and no events. The head model produced 24 right observations and one event. This difference verifies that the pipeline and UI expose method outputs; without independent clip labels, it does not determine which method was correct. [S04] [S10]

## Completion assessment

The project has substantial integrated behavior and fresh four-seat laptop evidence. Agreed effort weights and human classroom acceptance are not recorded. Overall completion must use 100 times accepted completed effort divided by total planned effort. No 80 percent implementation claim is made from the number of screens, passing tests, or the checkpoint name. [S03]

Held-out scoring, laptop speed and an automated four-seat office-proxy demonstration are now recorded below. Remaining acceptance includes representative classroom footage, another member’s setup reproduction and team review. [S03] [S04]

## Evidence provenance

Historical measurements retain their original dates and hardware. New CP4 measurements are dated 12 November 2026 and linked to machine-readable evidence and frozen implementation hashes. The base revision predates the CP4 changes; the hand-in tag identifies the final package. Academic acceptance and live Project status are not claimed.

[S02]: ../../../ARCHITECTURE.md "Current application architecture and processing paths"
[S03]: ../../../docs/checkpoints/cp4-checklist.md "Phase 4 requirements and outstanding evidence"
[S04]: ../../../docs/superpowers/specs/2026-10-29-saved-review-verification.md "Saved review verification and faculty setup refinement"
[S10]: ../../../docs/checkpoints/cp4-test-cases.md "Recorded CP4 test cases"
[S14]: ../../../scripts/run.py "Automatic image and video processing entry point"
[S17]: ../../../frontend/README.md "Current website setup and usage"

## Fresh verification on the demo laptop

On 12 November 2026, a new project-local Python 3.12.10 environment was installed with the pinned requirements and verified model downloads. The production Next.js build, TypeScript check, 164 application tests, 26 frontend tests and 16 repository automation tests passed. Browser automation processed an actual image and the four-seat excerpt through the real head model, checked 120 saved video frames, retained settings, downloaded records and reopened the completed session. The 390px viewport had no horizontal overflow or page JavaScript errors. This is agent verification, not another human member's reproduction.

Evidence: [browser verification](../../../outputs/evidence/cp4/browser-verification.json), [held-out results](03-evaluation-and-speed.md), [test log](verification.md), [backup demo](ocular-cp4-demo.mp4).

## Progress calculation and unfinished acceptance

The original [full-scope effort worksheet](../cp2-hand-in/effort-worksheet.csv) totals 138 points and historically accepted 69 points (50%). Its weights remain retrospective estimates requiring team review. New technical work does not automatically turn pending team, labeled-video, final-report or personal-defense tasks into accepted completions. No revised overall 80% claim is certified here. The required application functions are implemented, but the team must review effort weights and acceptance evidence to establish the requested implementation percentage.

Remaining evidence includes independent human setup/review, representative classroom seat/event/writing labels and personal class explanations. The office proxy demonstrates mechanics. The 10 FPS target is not met on the measured workload. These are disclosed limitations rather than hidden completed tasks.

# Verification plan

This folder currently contains only this README. No automated application tests or fixture files exist yet. Add meaningful checks as behavior is implemented:

- Direction conventions and decision boundaries.
- Seat association ambiguity and consistency.
- Movement timing, repeated events, and observation gaps.
- A small end-to-end saved-input workflow.

Create `fixtures/` when a test needs small authorized or synthetic inputs. Routine checks should not require a camera, private footage, or a full dataset download. Repository automation tests are separate in `.github/tests/`. Add application test dependencies and extend CI when application checks exist. Empty test files are intentionally omitted.

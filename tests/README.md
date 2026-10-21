# Verification plan

This folder currently contains only this README. No automated application tests or fixture files exist yet. Add meaningful checks as behavior is implemented:

- Shared preprocessing shape, colour, and coordinate conventions.
- Direction conventions, decision boundaries, and unavailable observations.
- Source-separated split manifests and transparent metric/failure accounting.
- The CP2 image-input-to-saved-output workflow and invalid input handling.
- Seat association ambiguity and consistency.
- Movement timing, repeated events, and observation gaps.
- A small end-to-end saved-input workflow.

Create `fixtures/` when a test needs small authorized or synthetic inputs. Routine checks should not require a camera, private footage, or a full dataset download. Repository automation tests are separate in `.github/tests/`. Add application test dependencies and extend CI when application checks exist. Empty test files are intentionally omitted.

CP2 also requires another member to verify the documented prototype from a fresh clone on a laptop CPU with pinned dependencies and retrievable model assets. Record that manual evidence in docs/checkpoints/; repository automation checks do not prove the CV prototype works.

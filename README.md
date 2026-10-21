# GAZE

GAZE is a proposed computer vision system for monitoring head orientation during classroom examinations using one fixed camera. It will label visible students' head directions and record sustained or repeated movements for instructor review.

Head movement does not establish cheating. The instructor remains responsible for interpreting observations.

## Project status

Planning and boilerplate only. This repository contains project documentation, a Python package skeleton, command-line placeholders, and notes for future configuration. Computer vision features, datasets, evaluation results, and checkpoint evidence have not been implemented or supplied.

## Planning documents

- [Product requirements](PRD.md): scope, user workflow, functional requirements, acceptance criteria, evaluation, and milestones.
- [Project architecture](ARCHITECTURE.md): project areas, session flow, information, responsibilities, and scope.
- [Development roadmap](ROADMAP.md): checkpoint tasks, owners, dependencies, and completion evidence.
- [Contributor instructions](AGENTS.md): working conventions, scope, and verification.
- [Task backlog](TASK.md): self-claimable tasks, dependencies, acceptance criteria, and linked GitHub Issues.
- [PR automation](docs/automation.md): proposed automatic PR creation, CI, rebases, and main-branch enforcement.
- [GitHub kanban board](https://github.com/users/emperuna/projects/3/views/2): Status columns and Checkpoint swimlanes.

## CP2 planning

The [roadmap](ROADMAP.md#cp2-baseline-and-initial-progress) now follows the Milestone 2 guide: prepared source-separated data and a data card, reusable preprocessing evidence, a one-command image baseline, validation measurements, pinned CPU setup verified from a fresh clone, and an effort-weighted progress report. GAZE also retains its three-face saved-video demonstration and FPS measurement. These are planned acceptance criteria; no prototype or evidence is supplied by this documentation update. See [checkpoint evidence expectations](docs/checkpoints/README.md).

## Expected outcome

A labeled examination video view with seat references, head direction labels, and timestamped movement records for instructor review.

## Team

| Member | Initial suggested focus |
| --- | --- |
| Marc Justin Alberto | Video input, preprocessing, baseline, and feasibility spike |
| Jose III Aquino | Landmarks, head pose, and direction classification |
| Jeremy Garin | Seat association, movement events, annotated output, and integration |
| All members | Code, data labeling, evaluation, documentation, and presentation |

Shared tasks are open to any collaborator; the original focus areas above are advisory. Claim an unassigned Issue before working so two people do not take the same task. Each member still delivers their own individual technical defense.

## Team and agent onboarding

Follow [CONTRIBUTING.md](CONTRIBUTING.md) before starting your first task. It includes access checks, a read-only agent startup prompt, task selection, conventional naming, and review expectations. [AGENTS.md](AGENTS.md) is the canonical repository guidance; verify your agent has loaded it before authorizing edits.

## Getting started

Read the PRD and project architecture for the planned capabilities, responsibilities, and evaluation goals.

The scaffold declares Python 3.10 or newer. In PowerShell, prepare an environment and install the local package with:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -c "import gaze; print(gaze.__doc__)"
```

The package currently has no runtime dependencies. Installing it may require downloading the packaging tool. Computer vision dependencies will be selected and verified during feasibility work.

Preview the initial commands with `python scripts/spike.py --help` or `python scripts/make_contact_sheet.py --help`. Running a script without `--help` reports that its feature is unimplemented; the scripts cannot process a session yet.

## Repository layout

| Location | Purpose |
| --- | --- |
| `src/gaze/` | Four boilerplate files for the initial feasibility work, described below. |
| `scripts/` | Boilerplate for the five-image spike and labeled contact sheet, plus a README. |
| `configs/` | A README describing future configuration needs; no settings files yet. |
| `data/` | Acquisition notes and empty `samples/` and `annotations/` placeholders. |
| `models/` | A README for future model acquisition; no assets or download folder yet. |
| `tests/` | A README describing future behavior checks; no tests or fixtures yet. |
| `outputs/` | Evidence placeholder and documentation; no generated runs yet. |
| `docs/` | Proposal and checkpoint documentation placeholders. |
| `.github/` | PR template, repository automation, tests, and reviewed activation settings. |

Full datasets, model downloads, and session output are ignored in their designated local folders. Only publish samples and evidence with permission. No code license has been selected yet.

## Deferred folders and tooling

Create folders when actual work needs them: `models/downloads/` for model acquisition, `outputs/runs/` for generated output, `notebooks/` for exploration, and `tests/fixtures/` for test inputs. Existing ignore rules protect local model downloads and generated runs.

The [evaluation plan](docs/evaluation/README.md) documents CP2 preparation and reporting expectations; no measurements exist yet. Add `docs/presentation/` when presentation materials exist. Repository workflow checks and automation tests now live under `.github/`; their activation and limits are documented in `docs/automation.md`. A separate development requirements file can be introduced when development tools are selected; setup currently uses only `requirements.txt`.

## Initial data organization

`data/` contains [its README](data/README.md), `samples/`, and `annotations/`. The subfolders contain only `.gitkeep` files. Future input examples belong in `samples/`, their labels in `annotations/`, and generated contact sheets or annotated screenshots in `outputs/evidence/`.

Create the ignored `data/raw/` folder when datasets are acquired and `data/processed/` only if saved derived inputs become necessary. Neither folder is part of the initial scaffold.

## Initial scripts

`scripts/` contains `spike.py`, `make_contact_sheet.py`, and [its README](scripts/README.md). Both commands remain boilerplate for the CP1 evidence tasks. Add image prediction, video, and evaluation commands around CP2 and live-camera support around CP4 when their behavior is developed.

## Initial package organization

The package starts with four files. Each contains only a responsibility description; no processing behavior or stable interfaces exist yet.

```text
src/gaze/
    __init__.py
    landmarks.py
    baseline.py
    visualization.py
```

| File | Planned responsibility |
| --- | --- |
| `__init__.py` | Identify the importable `gaze` package. |
| `landmarks.py` | Find visible faces and usable facial reference points. |
| `baseline.py` | Produce initial direction predictions from simple facial geometry, including the baseline's direction rules. |
| `visualization.py` | Draw face regions, landmarks, and direction labels for inspection. |

When implemented, `scripts/spike.py` will load five images, call these modules, and save the annotated results. During CP2 implementation, image preparation must be reusable functions under src/gaze used consistently by prediction and evaluation (and training if introduced), with before/after evidence for each applied step. Introduce a separate preprocessing module only when working behavior needs it.

Add separate modules when working behavior needs them: shared preprocessing, image prediction, video input, and evaluation around CP2, the main pose approach and seat association around CP3, and movement histories and event exports around CP4. Configuration loading, shared records, shared direction rules, and a session coordinator can be introduced when their responsibilities become clear. The broader capabilities remain planned in the roadmap; empty modules are not required in advance.

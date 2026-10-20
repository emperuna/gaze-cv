# GAZE Contributor and Agent Instructions

## Project context

GAZE is a classroom head movement review aid using one fixed camera. Head movement does not establish cheating; outputs support instructor review and must not assert misconduct or make disciplinary decisions.

The repository currently contains boilerplate only. Package modules contain descriptions, and scripts expose help and report that their features are unimplemented. Creating or updating the task backlog does not authorize application development. Work on the scope requested in the current conversation; start implementation tasks only when the user requests development work.

## Read before working

- [README.md](README.md): current layout and setup.
- [PRD.md](PRD.md): requirements and acceptance evidence.
- [ARCHITECTURE.md](ARCHITECTURE.md): project workflow and responsibilities.
- [ROADMAP.md](ROADMAP.md): checkpoint schedule and completion gates.
- [TASK.md](TASK.md): actionable backlog and GitHub Projects mapping.

Use the PRD for behavior, the roadmap for checkpoint obligations, and TASK.md for task boundaries. Report inconsistencies rather than silently changing requirements or course dates. Follow direct user instructions over these repository conventions.

## Keep the initial scaffold small

- Keep `src/gaze/` limited to `__init__.py`, `landmarks.py`, `baseline.py`, and `visualization.py` until implementation needs another module.
- Keep `scripts/` limited to `spike.py`, `make_contact_sheet.py`, and its README at this stage. Scripts coordinate tasks; reusable behavior belongs in the package.
- Keep `configs/` as planning notes until adjustable behavior exists. Do not invent calibrated defaults.
- Keep input samples in `data/samples/`, labels in `data/annotations/`, and permitted screenshots/contact sheets in `outputs/evidence/`.
- Add later folders and dependencies when real work needs them. Preserve ignore rules for private data, downloaded models, and generated runs.
- Keep the PRD, architecture, roadmap, contributor instructions, and task backlog at the repository root. Do not introduce a web frontend, backend service, database, or training framework without a requirement.

## Ownership and task workflow

Proposed leads follow the concept paper: Marc Justin Alberto owns input, baseline, and the spike; Jose III Aquino owns landmarks, pose, direction labels, and classifier evaluation; Jeremy Garin owns seat association, histories, review output, and integration. All members contribute code, labeling, evaluation, and presentation. TASK.md uses Marc, Jose, and Jeremy as short owner names. Confirmed GitHub handles are `marcjustinalbertobscs`, `fyodorrrrr`, and `emperuna`, respectively. Marc and Jose have pending repository invitations; intended ownership is recorded until Issue assignment becomes available.

For an authorized development task:

1. Read its acceptance criteria and blockers. Confirm prerequisite evidence before treating it as ready.
2. Agree on shared inputs and outputs before modifying behavior used by another owner.
3. Work on one focused task. Update its local Status when it changes; use a unique `(@agent-name)` suffix only while an agent is actively working. Proposed human ownership does not mean the task is claimed.
4. Keep unrelated edits intact. Avoid simultaneous edits to the same files and large automatic formatting changes.
5. Verify the behavior and document commands, results, limitations, and the task ID in the change summary.
6. Use Review until acceptance evidence is checked. Mark Done only when the task's criteria are satisfied. Record blockers by ID or with a concrete external reason.

Do not launch background work or a task-draining loop because a backlog exists. Do not install the reference site's autonomous next-task command as part of this setup. Never create Issues, change a Project, publish, push, or send messages unless the user has authorized that action. The repository owner handles pushes manually unless they explicitly change that instruction. Commit only when requested or required to complete an explicitly authorized Git operation.

## Task file conventions

`TASK.md` intentionally uses the user's requested singular filename. Its task blocks follow the lightweight [TASKS.md format](https://tasksmd.github.io/tasks.md/): priority headings, checkboxes, stable IDs, and nested metadata. Tools that only discover `TASKS.md` require configuration or a later rename; no duplicate task file should be maintained.

Use kebab-case unique IDs and lowercase tags. Tag vocabulary: `planning`, `data`, `documentation`, `tooling`, `baseline`, `landmarks`, `visualization`, `video`, `evaluation`, `pose`, `seats`, `temporal`, `configuration`, `export`, `camera`, `testing`, `integration`, `presentation`, and `submission`.

Owner, Status, and Issue are project-specific metadata. Keep dependency IDs valid. When a task is completed, retain its checked block until completion evidence and its Issue link, if any, are recorded. This is a deliberate adaptation for team review; completed tasks may later be archived or removed after dependent tasks are updated. An absent task alone never proves its blocker is satisfied.

GitHub Issues and Projects become the authoritative team assignment and status record once populated. TASK.md remains the versioned task breakdown. Synchronize links and material status changes manually; there is no installed synchronization. Do not claim a board was updated because a Markdown file changed.

## Python setup and verification

The scaffold declares Python 3.10 or newer. From the repository root in PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -c "import gaze; print(gaze.__doc__)"
.\.venv\Scripts\python.exe scripts/spike.py --help
.\.venv\Scripts\python.exe scripts/make_contact_sheet.py --help
```

Installation can download the packaging tool. CV dependencies have not been selected. Both scripts intentionally fail with an unimplemented message without `--help`; help output is not a working feasibility spike.

Run checks appropriate to actual changes. For documentation, check links and `git diff --check`. For future application behavior, add meaningful checks for direction conventions, timing, missing observations, association ambiguity, and comparable evaluation. No automated test suite or CI workflow exists yet; do not report a passing suite or create empty tests. Routine checks should not require private footage, a camera, or full dataset downloads. State any checks that could not be performed.

## Data and evaluation rules

Verify dataset access and permissions before relying on it. Record sources, licenses, class counts, label conventions, and subject-separated development/test splits. BIWI access remains unverified; unlabeled LFW images cannot establish direction accuracy. Multi-person footage is required for seat and temporal validation.

Use session time for movement duration and make missing observations explicit. Tune on development data and freeze settings before held-out evaluation. Compare methods on identical inputs, report missed detections, and report hardware and conditions with FPS. The PRD's 80% accuracy and 10 FPS values are targets, not achieved results. State limitations and keep instructor review central.

## Git and checkpoint handling

Inspect Git status before edits. Do not overwrite unrelated work, abort another operation, rewrite published history, force-push, or move tags without explicit authorization. During conflict resolution, inspect both versions and preserve the agreed scaffold and documentation. Scan for conflict markers even if Git says conflicts are resolved.

Use actual hand-in commits for checkpoint tags. Existing tag or commit names do not establish course completion. Check all evidence gates in ROADMAP.md before claiming a checkpoint is done. Dates and late-submission arrangements must be confirmed with the instructor.

# GAZE Contributor and Agent Instructions

## Project context

GAZE is a classroom head movement review aid using one fixed camera. Head movement does not establish cheating; outputs support instructor review and must not assert misconduct or make disciplinary decisions.

The repository currently contains boilerplate only. Package modules contain descriptions, and scripts expose help and report that their features are unimplemented. Creating or updating the task backlog does not authorize application development. Work on the scope requested in the current conversation; start implementation tasks only when the user requests development work.

## Start every agent session

These repository instructions apply to all work in this checkout. Before editing:

1. Confirm the repository root, current branch, and working tree with Git. Preserve unrelated local changes and report an active merge/rebase before altering it.
2. Read this file and the context listed below. Check for applicable nested `AGENTS.md` or `AGENTS.override.md` files before working in a subdirectory. Do not create overrides to bypass the team rules.
3. Identify the current user's requested scope. If a task is named, find its stable ID in TASK.md, inspect its linked Issue and live Project state when access is available, and check current claims, dependencies, and acceptance criteria. If GitHub is unavailable, disclose that limitation and do not invent a live status.
4. Briefly state the loaded guidance, selected task or onboarding-only scope, prerequisite state, and intended verification. Continue authorized work without requiring another approval merely for this summary.
5. During onboarding-only sessions, explain the project and rules without implementing features or claiming tasks. Use [CONTRIBUTING.md](CONTRIBUTING.md) for the member startup checklist and prompt.

Root AGENTS.md is the canonical instruction source. Agents that do not discover it automatically must be told to read and follow it explicitly. Tool support and user review are needed; this file is guidance rather than technical enforcement.

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

## Shared task claiming

Shared project tasks have no preset owner. Any repository collaborator can take an unclaimed task when its dependencies and access requirements are satisfied. The concept paper's original module allocation is advisory expertise, not a restriction on who may contribute. Confirmed member handles are `marcjustinalbertobscs`, `fyodorrrrr`, and `emperuna`.

The three individual technical defenses remain personal academic responsibilities. Another member can help prepare material, but the named student must deliver and understand their own defense.

For an authorized development task:

1. Read its acceptance criteria, live Issue, Project status, and dependencies. Select an unclaimed task whose prerequisite evidence is satisfied; do not select by a fixed Owner field.
2. When claiming is authorized, assign the Issue to the requesting human collaborator and re-read it before editing. If another assignee or active claim appears, coordinate first. Do not invent an agent GitHub account or silently take over another person's work.
3. Move the card to In Progress when work actually starts and update the local Assignee and Status snapshot. Agent-name suffixes are optional temporary session markers, not permanent ownership or a substitute for the human assignee.
4. Agree on shared inputs and outputs before modifying behavior used by another contributor. Preserve unrelated edits and avoid overlapping changes to the same files.
5. Verify the behavior and record commands, results, limitations, and the task ID. Use Review until acceptance evidence is checked; use Done only when it is satisfied.
6. Record dependency IDs or external blocker reasons. If releasing an unfinished task, document remaining work and remove the active claim so someone else can take it.

Ordinary collaborator access is still needed for GitHub assignment and editing; a pending invitation is an access limitation for that person, not a reason to reserve or block shared tasks for them. No automated task picker or claimant is installed.

Do not launch background work or a task-draining loop because a backlog exists. Do not install the reference site's autonomous next-task command as part of this setup. Never create Issues, change a Project, publish, push, or send messages unless the user has authorized that action. The repository owner handles pushes manually unless they explicitly change that instruction. Commit only when requested or required to complete an explicitly authorized Git operation.

## Task file conventions

`TASK.md` intentionally uses the user's requested singular filename. Its task blocks follow the lightweight [TASKS.md format](https://tasksmd.github.io/tasks.md/): priority headings, checkboxes, stable IDs, and nested metadata. Tools that only discover `TASKS.md` require configuration or a later rename; no duplicate task file should be maintained.

Use kebab-case unique IDs and lowercase tags. Tag vocabulary: `planning`, `data`, `documentation`, `tooling`, `baseline`, `landmarks`, `visualization`, `video`, `evaluation`, `pose`, `seats`, `temporal`, `configuration`, `export`, `camera`, `testing`, `integration`, `presentation`, and `submission`.

Assignee, Defense member, Status, and Issue are project-specific metadata. Keep dependency IDs valid. When a task is completed, retain its checked block until completion evidence and its Issue link, if any, are recorded. This is a deliberate adaptation for team review; completed tasks may later be archived or removed after dependent tasks are updated. An absent task alone never proves its blocker is satisfied.

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

Run checks appropriate to actual changes. For documentation, check links and `git diff --check`. For future application behavior, add meaningful checks for direction conventions, timing, missing observations, association ambiguity, and comparable evaluation. Repository workflow checks and automation tests are defined in .github; they become active after the setup PR is merged. Run `python .github/automation.py check` and `python -m unittest discover -s .github/tests -v` for repository automation. There is no application test suite yet; do not report CV features as tested by these checks or create empty tests. Routine checks should not require private footage, a camera, or full dataset downloads. State any checks that could not be performed.

## Data and evaluation rules

Verify dataset access and permissions before relying on it. Record sources, licenses, class counts, label conventions, and subject-separated development/test splits. BIWI access remains unverified; unlabeled LFW images cannot establish direction accuracy. Multi-person footage is required for seat and temporal validation.

Use session time for movement duration and make missing observations explicit. Tune on development data and freeze settings before held-out evaluation. Compare methods on identical inputs, report missed detections, and report hardware and conditions with FPS. The PRD's 80% accuracy and 10 FPS values are targets, not achieved results. State limitations and keep instructor review central.

## Commit and collaboration conventions

Use Conventional Commit subjects: `type(scope): imperative summary`. Relevant types are `feat`, `fix`, `docs`, `test`, `refactor`, `ci`, and `chore`; scope names should describe the affected area, such as `planning`, `onboarding`, `baseline`, or `evaluation`.

Keep commits atomic: one independently understandable change per commit, including its directly related documentation and meaningful checks. Do not bundle unrelated cleanup, generated output, or someone else's changes. Inspect staged paths and `git diff --cached --check` before committing. Reference the stable task ID and Issue in the commit body or PR description when applicable. A conventional subject does not replace acceptance evidence.

For new team work, use a focused branch such as `docs/cp1-proposal` or `feat/cp2-baseline`, based on an agreed task. Push only task branches when authorized; Auto PR creates or reuses their PR after the automation setup is activated. Complete the PR description and wait for required checks and peer review. Never bypass the main ruleset or push directly to main for ordinary work. Use each member's own Git identity. Do not create commits or pushes until authorized by the user; an explicit commit-and-push request authorizes those actions for its stated scope.

## Automatic branch maintenance

Read [docs/automation.md](docs/automation.md) for activation status and limitations. Once active, main updates trigger isolated rebases of open same-repository PR branches and explicit CI reruns. The configured bot is authorized to rewrite those feature branches only with an exact force-with-lease check; this is not permission for agents to force-push main or discard another contributor's work. Fork PRs are skipped, and conflicts require a documented human resolution.

Fetch and reconcile a bot-rebased feature branch before further pushes, preserving local-only changes. Do not blindly reset or force-push a stale branch. PR creation, checks, peer review, and branch rules provide integration gates; AGENTS.md remains guidance rather than an enforcement mechanism. Existing GitHub status workflows are separate from this Git branch automation.

## Git and checkpoint handling

Inspect Git status before edits. Do not overwrite unrelated work, abort another operation, rewrite published history, force-push, or move tags without explicit authorization. During conflict resolution, inspect both versions and preserve the agreed scaffold and documentation. Scan for conflict markers even if Git says conflicts are resolved.

Use actual hand-in commits for checkpoint tags. Existing tag or commit names do not establish course completion. Check all evidence gates in ROADMAP.md before claiming a checkpoint is done. Dates and late-submission arrangements must be confirmed with the instructor.

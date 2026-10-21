# Contributing to GAZE

Start here when joining the repository or opening it with a coding agent. GAZE has a working prototype; onboarding alone does not authorize changing it. [AGENTS.md](AGENTS.md) is the canonical working agreement for both people and coding agents.

## Join and open the repository

1. Accept the repository invitation and verify that your GitHub account can access [gaze-cv](https://github.com/emperuna/gaze-cv) and the private [Project board](https://github.com/users/emperuna/projects/3/views/2). Repository and Project access are separate.
2. Clone the repository, or update an existing clean checkout with `git pull --ff-only`. If you have local work or Git reports a divergence, inspect it before proceeding; do not reset or force-push.
3. Open the repository root in your editor or coding agent. Confirm that the root contains AGENTS.md, TASK.md, and README.md.
4. Use your own GitHub account and Git author identity so your contributions remain attributable. Follow the [README setup](README.md) when an environment is needed.
5. Read AGENTS.md and its linked planning documents. Choose from the unclaimed shared tasks in TASK.md and confirm live claims and dependencies in GitHub. There are no preset module owners. Repository invitation acceptance is still required for normal collaborator assignment access.

## Verify the agent has loaded the rules

Codex discovers repository AGENTS.md guidance when starting a session from the project root or its subdirectories. Restart an existing session after pulling updated instructions so it reloads them. See the [official AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

For any coding agent, use this first-session prompt. If the tool does not automatically discover AGENTS.md, attach or explicitly provide that file through its supported instruction mechanism. Keep it as the single source of rules rather than copying divergent instructions into multiple files.

```text
Onboard me to this repository without changing files.
Read and follow the root AGENTS.md and any applicable nested instructions.
Read README.md, PRD.md, ARCHITECTURE.md, ROADMAP.md, and TASK.md.
Confirm the repository root and summarize the active instruction sources,
the current implementation evidence and limitations, and the verification and Git conventions.
My GitHub username is <your-handle>. Identify unclaimed shared tasks and their
prerequisites, checking live Issue assignments when access is available.
Do not implement features, claim tasks, commit, push, or change GitHub state.
```

Check that its answer identifies AGENTS.md, the supported image/video commands and explicit evidence limitations, the no-implementation onboarding scope, and the task/dependency workflow. If these are missing, have the agent read the instructions before assigning work. Documentation cannot guarantee compliance by every tool; contributors and reviewers must check the result.

## Start one authorized task

Any collaborator may select an unclaimed shared task whose prerequisites are satisfied. When claiming is authorized, assign yourself to the Issue, re-read the assignment to detect competing claims, move it to In Progress when starting, and create a focused branch from an up-to-date base. Update the local task snapshot. Do not take over a task already being handled by another member. Individual defense tasks remain the named students' responsibilities.

A later implementation request can be explicit:

```text
Follow AGENTS.md. Work only on task <task-id> from TASK.md and its linked
Issue. Check live claims and prerequisites first, then implement the authorized
scope and run appropriate verification. Preserve unrelated work. Report
acceptance evidence and limitations. Do not commit or push unless I ask.
```

Update task status and Issue/Project records when authorized, keeping them consistent with the actual work. Board and Markdown updates are manual. Do not mark a checkpoint complete merely because its task or tag exists.

## Use conventional names and atomic commits

Use branch names such as `docs/cp1-proposal` or `feat/cp2-baseline`. Use commit subjects such as:

```text
docs(onboarding): explain contributor and agent startup
feat(baseline): classify head direction from facial geometry
fix(temporal): exclude observation gaps from movement duration
```

Each commit should have one clear purpose and include its directly related documentation and verification. Review staged files before committing. Keep unrelated changes separate and never commit private footage, downloaded models, generated session output, or credentials. Reference the task ID and Issue in the commit body or PR description.

## Request review

Use the PR template to state scope, linked task, verification results, and limitations. Include whether repository guidance was loaded by your agent. Reviewers check the task acceptance criteria, relevant AGENTS.md rules, and the evidence before moving work to Done. Commit and push task branches only when authorized. After activation, Auto PR opens or reuses the PR; Repository checks must pass and a different collaborator must approve under the reviewed main ruleset. Do not bypass main protections. The checks cover repository consistency, automation, and synthetic application behavior; actual CV measurements and acceptance evidence remain separate.

## Branch automation

Read [docs/automation.md](docs/automation.md) for the setup's activation state, exact checks, and conflict handling. Once activated, each main update rebases open same-repository PR branches and dispatches CI on updated heads. Fetch and reconcile your local branch before pushing again, preserving local-only changes. Fork PRs and conflicting rebases need manual handling. Human review and merge remain explicit; there is no automatic PR approval or merge.

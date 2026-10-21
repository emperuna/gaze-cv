# Pull request automation

Status: Workflow files are merged into the default branch. The repository administrator enabled GitHub's combined Actions PR creation/review-approval setting on 22 October 2026 after explicit approval. Default workflow token permissions remain read-only; individual workflows request the permissions they need. Branch-protection settings are separate and are not changed by this permission fix.

## Intended contributor flow

1. Any collaborator claims an unassigned shared task whose prerequisites are met.
2. Work on a focused branch such as `feat/cp2-baseline`; keep commits conventional and atomic.
3. Push the branch when authorized. Auto PR opens one PR against the default branch, or reuses the existing PR without overwriting its title, evidence, or draft state.
4. Complete the PR description, link the task Issue, and inspect CI. A contributor reviews acceptance evidence before approving and merging.
5. A push to `main`, including a PR merge, runs Auto rebase. Open same-repository PR branches are rebased onto current `main` in disposable clones; updated heads receive a fresh CI dispatch.
6. Conflicts or concurrent pushes require attention. The bot does not choose conflict sides, rewrite `main`, merge PRs, or move application tasks to Done.

## Workflows and verification

| File | Responsibility |
| --- | --- |
| `.github/workflows/auto-pr.yml` | Opens or reuses a branch PR after a non-main branch push. |
| `.github/workflows/ci.yml` | Runs the Repository checks job on PRs, main pushes, and explicit dispatches. |
| `.github/workflows/auto-rebase.yml` | Rebases open same-repository PRs after main changes, or on a manual default-branch dispatch. |
| `.github/automation.py` | Standard-library-only API, consistency checks, and isolated Git operations. |
| `.github/tests/test_automation.py` | Network-free tests using API doubles and real disposable Git repositories. |

Run locally:

```powershell
python .github/automation.py check
python -m unittest discover -s .github/tests -v
git diff --check
```

CI currently checks repository Python syntax, local documentation links, conflict markers, task ID/dependency consistency, whitespace, and the automation's behavior. It is not a computer vision evaluation or application test suite. Add meaningful application checks as features are implemented.

## Safe rebasing and local work

The privileged rebaser checks out only trusted default-branch automation and performs Git operations in disposable clones. It does not execute PR code or tests with its write-enabled token. Hooks, inherited Git configuration, fsmonitor, signing, and recursive submodule operations are disabled in those clones. PRs from external forks are skipped.

Each feature-branch push uses an exact `--force-with-lease` expectation. A changed head or failed lease never triggers a blind retry. Conflicts leave the remote branch unchanged and produce a deduplicated PR note. The workflow processes the other PRs and reports failures in its summary. Manual conflict repair remains a contributor responsibility.

Because successful rebases rewrite feature-branch commits, fetch before continuing local work. Have your agent compare local and remote history and preserve local-only commits while reconciling them. Never force-push a stale checkout or reset away uncommitted work. Serial workflow concurrency and strict up-to-date merge checks protect integration while main changes continue.

## Token behavior

The workflows use the repository's short-lived GITHUB_TOKEN, not a copied personal credential or stored broad-access token. Each workflow requests only its needed permissions. The rebaser and PR creator need Actions write access to explicitly dispatch CI after bot-created/updated PRs, because token-generated events have special triggering rules.

GitHub may also show an approval prompt for pull_request runs caused by its built-in token. Explicit CI dispatch provides a head check, but any remaining GitHub approval banner must be handled by a collaborator. A dedicated GitHub App can remove that event-approval limitation later if required; no App, PAT secret, or automatic approval is installed here. See [GitHub workflow-triggering rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

## Activation and enforcement

The initial setup PR was opened manually and merged before automatic PR creation became available. The Actions setting below is now applied. Its default token permissions stay read-only; only the combined creation/review-approval capability is enabled. The ruleset command remains a separate administrative action, not part of the Auto PR permission fix:

```powershell
gh api --method PUT repos/emperuna/gaze-cv/actions/permissions/workflow --input .github/rulesets/actions.json
gh api --method PUT repos/emperuna/gaze-cv/rulesets/25500005 --input .github/rulesets/main.json
```

The Actions setting allows workflows to create PRs; GitHub combines creation and review-approval capability in this setting, but these workflows never approve PRs. CI retains read-only repository permissions. The Auto PR and Auto rebase workflows only call the trusted helper for PR creation, branch maintenance, notes, and CI dispatch; there is no review-submission endpoint, APPROVE event, or approval command. Human review remains required by the team's workflow.

If Auto PR fails with HTTP 403 despite its job showing PullRequests write permission, check Settings > Actions > General > Workflow permissions and the combined "Allow GitHub Actions to create and approve pull requests" checkbox. The earlier failure on run 39655741037 occurred while this checkbox was disabled. Keep default token permissions read-only; do not add a personal token or automatic review approval to solve this error. Verify the fix by pushing a branch with a real change and no existing PR, then checking that github-actions[bot] creates exactly one PR and dispatches CI.

The proposed ruleset requires a PR, one approval from a different collaborator, resolved review conversations, and the up-to-date Repository checks result from GitHub Actions. It blocks default-branch deletion and force pushes and removes the current owner bypass. Any eligible collaborator can review another member's PR; no named code owner is required. At least two participating collaborators are needed for peer approval. These administrative changes require explicit activation after review; files alone do not enforce them.

After activation, validate the full flow with two harmless same-repository test branches: confirm PR creation and CI, obtain peer review and merge one, then verify the other rebases and gets a fresh check. Verify direct main updates are rejected without bypass. Do not claim this end-to-end exercise has passed before it runs.

## Relationship to the reference repository

The inspected [Petal AGENTS.md](https://github.com/DheKode/Petal-Monorepo/blob/main/AGENTS.md) currently specifies direct-main collaboration, and its workflow directory contains CI rather than auto-PR/rebase workflows. This setup implements the requested GAZE behavior instead of copying those repository-specific rules or its application stack.

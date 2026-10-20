"""GitHub workflow helpers. No application or pull-request code runs during rebases."""

import argparse
import ast
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


class GitHub:
    def __init__(self, token):
        self.token = token

    def request(self, path, data=None, method=None):
        request = Request(
            "https://api.github.com" + path,
            data=json.dumps(data).encode() if data is not None else None,
            method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2026-03-10",
                     "User-Agent": "gaze-workflow"},
        )
        try:
            with urlopen(request, timeout=30) as response:
                content = response.read()
                return json.loads(content) if content else None
        except HTTPError as error:
            raise RuntimeError(f"GitHub request failed: {error.code} {method or 'GET'} {path}") from None

    def pages(self, path):
        result = []
        page = 1
        while True:
            separator = "&" if "?" in path else "?"
            values = self.request(path + separator + urlencode({"per_page": 100, "page": page}))
            result.extend(values)
            if len(values) < 100:
                return result
            page += 1


def pr_title(branch):
    match = re.fullmatch(r"(feat|fix|docs|test|refactor|chore)/(.+)", branch)
    if match:
        return f"{match[1]}: {match[2].replace('-', ' ')}"
    return "chore: review " + branch.replace("\n", " ")


def open_pr(api, repo, event):
    default = event["repository"]["default_branch"]
    ref = event.get("ref", "")
    if event.get("deleted") or not ref.startswith("refs/heads/"):
        return None
    branch = ref.removeprefix("refs/heads/")
    if branch == default:
        return None
    owner = repo.split("/", 1)[0]
    query = urlencode({"state": "open", "head": owner + ":" + branch, "base": default})
    existing = api.pages(f"/repos/{repo}/pulls?{query}")
    if existing:
        return existing[0]  # Never replace a contributor's title, body, or draft state.
    compare = api.request(f"/repos/{repo}/compare/{quote(default, safe='')}...{quote(branch, safe='')}")
    if not compare.get("ahead_by", 0):
        return None
    body = (
        "## Change\n\nAutomatically opened for this branch. Complete the scope and task reference before review.\n\n"
        "## Verification\n\nRecord the actual checks and results; CI is not acceptance evidence for unimplemented features.\n\n"
        "## Repository guidance\n\nRead AGENTS.md and CONTRIBUTING.md. Keep one focused task per PR and conventional, atomic commits. "
        "Any collaborator may claim unassigned shared work. Human review and merging remain explicit.\n"
    )
    pull = api.request(f"/repos/{repo}/pulls", {
        "title": pr_title(branch), "head": branch, "base": default, "body": body,
    })
    # GITHUB_TOKEN-created PR events can require approval. Explicit dispatch is supported
    # for workflow chaining, and provides CI for this head without a stored personal token.
    api.request(f"/repos/{repo}/actions/workflows/ci.yml/dispatches", {"ref": branch})
    return pull


def isolated_environment(token, hooks):
    env = os.environ.copy()
    for key in list(env):
        if key.startswith("GIT_CONFIG_") or key in {"GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"}:
            env.pop(key)
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "Never",
                "GIT_EDITOR": "true", "GIT_SEQUENCE_EDITOR": "true"})
    settings = [
        ("core.hooksPath", str(hooks)), ("core.fsmonitor", "false"),
        ("user.name", "github-actions[bot]"),
        ("user.email", "41898282+github-actions[bot]@users.noreply.github.com"),
        ("commit.gpgsign", "false"), ("submodule.recurse", "false"),
    ]
    if token:
        value = base64.b64encode(("x-access-token:" + token).encode()).decode()
        settings.append(("http.https://github.com/.extraheader", "AUTHORIZATION: basic " + value))
    env["GIT_CONFIG_COUNT"] = str(len(settings))
    for index, (key, value) in enumerate(settings):
        env[f"GIT_CONFIG_KEY_{index}"] = key
        env[f"GIT_CONFIG_VALUE_{index}"] = value
    return env


def rebase_branch(remote, branch, default, expected, token="", before_push=None):
    """Rebase one isolated clone; lease protects remote changes after the snapshot."""
    if branch == default:
        raise ValueError("The default branch must never be rewritten")
    if not re.fullmatch(r"[0-9a-f]{40,64}", expected):
        raise ValueError("Expected an exact head commit")
    for name in [branch, default]:
        subprocess.run(["git", "check-ref-format", "refs/heads/" + name], check=True,
                       capture_output=True, text=True)
    with tempfile.TemporaryDirectory(prefix="gaze-rebase-") as directory:
        workspace = Path(directory)
        hooks = workspace / "empty-hooks"
        hooks.mkdir()
        env = isolated_environment(token, hooks)
        def git(*args, check=True):
            return subprocess.run(["git", *args], cwd=workspace, env=env, check=check,
                                  capture_output=True, text=True, timeout=180)
        git("init", "--quiet")
        git("remote", "add", "origin", remote)
        git("fetch", "--no-tags", "origin",
            "+refs/heads/" + default + ":refs/remotes/origin/base",
            "+refs/heads/" + branch + ":refs/remotes/origin/head")
        if git("rev-parse", "refs/remotes/origin/head").stdout.strip() != expected:
            return "changed", None
        if git("merge-base", "--is-ancestor", "refs/remotes/origin/base",
               "refs/remotes/origin/head", check=False).returncode == 0:
            return "current", expected
        git("checkout", "--quiet", "--detach", "refs/remotes/origin/head")
        result = git("rebase", "--rebase-merges", "refs/remotes/origin/base", check=False)
        if result.returncode:
            # This is our disposable clone, never a contributor's checkout.
            git("rebase", "--abort", check=False)
            return "conflict", None
        updated = git("rev-parse", "HEAD").stdout.strip()
        if before_push:
            before_push()  # Test seam for a contributor racing the bot push.
        push = git("push", "--force-with-lease=refs/heads/" + branch + ":" + expected,
                   "origin", "HEAD:refs/heads/" + branch, check=False)
        if push.returncode:
            raise RuntimeError("Lease-protected feature-branch push failed; no blind retry")
        return "rebased", updated


def rebase_note(api, repo, number, message):
    marker = "<!-- gaze-auto-rebase -->"
    comments = api.pages(f"/repos/{repo}/issues/{number}/comments")
    own = next((comment for comment in comments if marker in comment.get("body", "")
                and comment.get("user", {}).get("login") == "github-actions[bot]"), None)
    body = marker + "\n" + message
    if own:
        if own["body"] != body:
            api.request(f"/repos/{repo}/issues/comments/{own['id']}", {"body": body}, method="PATCH")
    else:
        api.request(f"/repos/{repo}/issues/{number}/comments", {"body": body})


def rebase_prs(api, repo):
    default = api.request(f"/repos/{repo}")["default_branch"]
    pulls = api.pages(f"/repos/{repo}/pulls?" + urlencode({"state": "open", "base": default}))
    outcomes = []
    failures = False
    for entry in pulls:
        number = entry["number"]
        try:
            pull = api.request(f"/repos/{repo}/pulls/{number}")
            if pull["state"] != "open" or pull["base"]["ref"] != default:
                continue
            head = pull["head"]
            if not head.get("repo") or head["repo"]["full_name"] != repo:
                outcomes.append(f"#{number}: external fork skipped (no automatic history rewrite)")
                continue
            result, sha = rebase_branch("https://github.com/" + repo + ".git", head["ref"],
                                        default, head["sha"], api.token)
            outcomes.append(f"#{number}: {result}")
            if result == "rebased":
                # Token pushes do not trigger push CI; dispatch CI explicitly on the new head.
                api.request(f"/repos/{repo}/actions/workflows/ci.yml/dispatches", {"ref": head["ref"]})
                existing = api.pages(f"/repos/{repo}/issues/{number}/comments")
                if any("<!-- gaze-auto-rebase -->" in c.get("body", "") for c in existing):
                    rebase_note(api, repo, number, f"Automatic rebase onto `{default}` succeeded at `{sha}`; CI was requested again.")
            elif result == "conflict":
                failures = True
                rebase_note(api, repo, number,
                            f"Automatic rebase onto `{default}` conflicts at head `{head['sha']}`. "
                            "The branch was not changed. Resolve the conflict locally, verify the result, and update this feature branch with an exact lease. Never force-push main.")
            elif result == "changed":
                failures = True
                rebase_note(api, repo, number,
                            "The head changed while the bot prepared its rebase. No push was attempted; rerun Auto rebase after the branch settles.")
        except (RuntimeError, subprocess.SubprocessError) as error:
            failures = True
            outcomes.append(f"#{number}: {error}")
    for outcome in outcomes:
        print(outcome)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write("## Rebase results\n\n" + "\n".join("- " + x for x in outcomes) + "\n")
    if failures:
        raise RuntimeError("Some branches need attention; see the per-PR notes and workflow summary")


def check_repository():
    tracked = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout.decode().split("\0")
    for name in filter(None, tracked):
        path = Path(name)
        if path.suffix == ".py":
            ast.parse(path.read_text(encoding="utf-8"), filename=name)
        if path.suffix == ".md":
            content = path.read_text(encoding="utf-8")
            if re.search(r"^(<<<<<<< |=======\s*$|>>>>>>> )", content, re.M):
                raise ValueError("Unresolved conflict markers: " + name)
            for target in re.findall(r"\]\(([^)]+)\)", content):
                if "://" not in target and not target.startswith(("#", "mailto:")):
                    target = target.split("#", 1)[0]
                    if not (path.parent / target).is_file():
                        raise ValueError(f"Broken local link in {name}: {target}")
    text = Path("TASK.md").read_text(encoding="utf-8")
    ids = re.findall(r"^  - \*\*ID\*\*: (.+)$", text, re.M)
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate task IDs")
    graph = {}
    for block in re.split(r"\n- \[[ x]\] ", text)[1:]:
        tid = re.search(r"^  - \*\*ID\*\*: (.+)$", block, re.M)[1]
        match = re.search(r"^  - \*\*Blocked by\*\*: (.+)$", block, re.M)
        graph[tid] = match[1].split(", ") if match else []
    visited, active = set(), set()
    def visit(tid):
        if tid not in graph or tid in active:
            raise ValueError("Missing or cyclic task dependency: " + tid)
        if tid in visited:
            return
        active.add(tid)
        for dependency in graph[tid]:
            visit(dependency)
        active.remove(tid)
        visited.add(tid)
    for tid in graph:
        visit(tid)
    print("Repository Python syntax, local document links, conflict markers, and task dependencies checked.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "open-pr", "rebase"])
    command = parser.parse_args().command
    if command == "check":
        check_repository()
        return
    api = GitHub(os.environ["GH_TOKEN"])
    repo = os.environ["GITHUB_REPOSITORY"]
    if command == "open-pr":
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        pull = open_pr(api, repo, event)
        print("PR: " + pull["html_url"] if pull else "No PR needed")
    else:
        rebase_prs(api, repo)


if __name__ == "__main__":
    main()

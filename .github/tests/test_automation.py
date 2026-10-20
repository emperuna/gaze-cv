"""Exercise repository automation without GitHub credentials or network access."""

import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("automation", Path(__file__).parents[1] / "automation.py")
automation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(automation)


class FakeAPI:
    token = "unused"

    def __init__(self, existing=None, ahead=1):
        self.existing = existing or []
        self.ahead = ahead
        self.writes = []
        self.queries = []

    def pages(self, path):
        self.queries.append(path)
        return self.existing

    def request(self, path, data=None, method=None):
        if data is not None:
            self.writes.append((path, data, method))
            if path.endswith("/pulls"):
                return {"number": 42, "html_url": "https://github.com/team/repo/pull/42"}
            return None
        return {"ahead_by": self.ahead}


class PullRequestTests(unittest.TestCase):
    def event(self, branch="feat/cp2-baseline", deleted=False):
        return {"ref": "refs/heads/" + branch, "deleted": deleted,
                "repository": {"default_branch": "main"}}

    def test_title_uses_conventional_type(self):
        self.assertEqual(automation.pr_title("docs/cp1-proposal"), "docs: cp1 proposal")
        self.assertEqual(automation.pr_title("topic"), "chore: review topic")

    def test_default_and_deleted_branches_are_ignored(self):
        api = FakeAPI()
        self.assertIsNone(automation.open_pr(api, "team/repo", self.event("main")))
        self.assertIsNone(automation.open_pr(api, "team/repo", self.event(deleted=True)))
        self.assertEqual(api.writes, [])
        self.assertEqual(api.queries, [])

    def test_existing_pr_is_not_duplicated_or_overwritten(self):
        existing = {"number": 7, "title": "Human title", "body": "Human evidence", "draft": True}
        api = FakeAPI(existing=[existing])
        self.assertIs(automation.open_pr(api, "team/repo", self.event()), existing)
        self.assertEqual(api.writes, [])

    def test_branch_with_no_new_commits_gets_no_pr(self):
        api = FakeAPI(ahead=0)
        self.assertIsNone(automation.open_pr(api, "team/repo", self.event()))
        self.assertEqual(api.writes, [])

    def test_creates_pr_and_explicitly_dispatches_ci(self):
        api = FakeAPI()
        result = automation.open_pr(api, "team/repo", self.event())
        self.assertEqual(result["number"], 42)
        self.assertEqual(len(api.writes), 2)
        path, payload, _ = api.writes[0]
        self.assertEqual(path, "/repos/team/repo/pulls")
        self.assertEqual(payload["base"], "main")
        self.assertEqual(payload["head"], "feat/cp2-baseline")
        self.assertNotIn("assignees", payload)
        self.assertEqual(api.writes[1][0], "/repos/team/repo/actions/workflows/ci.yml/dispatches")
        self.assertEqual(api.writes[1][1], {"ref": "feat/cp2-baseline"})


class GitRebaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gaze-automation-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.remote = self.root / "remote.git"
        self.env = automation.isolated_environment("", self.root / "no-hooks")
        (self.root / "no-hooks").mkdir()
        self.git("init", "--bare", str(self.remote), cwd=self.root)
        self.git("init", "--initial-branch=main")
        self.git("remote", "add", "origin", str(self.remote))
        self.write_commit("shared.txt", "initial\n", "initial")
        self.git("push", "origin", "main")
        self.git("switch", "-c", "feat/test")
        self.write_commit("feature.txt", "feature\n", "feature")
        self.expected = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "feat/test")
        self.git("switch", "main")

    def git(self, *args, cwd=None):
        result = subprocess.run(["git", *args], cwd=cwd or self.source, env=self.env,
                                capture_output=True, text=True, check=True)
        return result.stdout.strip()

    def write_commit(self, filename, content, message):
        (self.source / filename).write_text(content, encoding="utf-8")
        self.git("add", "--", filename)
        self.git("commit", "-m", message)

    def remote_tip(self):
        return self.git("ls-remote", "origin", "refs/heads/feat/test").split()[0]

    def advance_main(self):
        self.write_commit("base-next.txt", "new base\n", "advance main")
        self.git("push", "origin", "main")
        return self.git("rev-parse", "HEAD")

    def test_clean_rebase_preserves_feature_and_contains_new_main(self):
        base = self.advance_main()
        result, updated = automation.rebase_branch(str(self.remote), "feat/test", "main", self.expected)
        self.assertEqual(result, "rebased")
        self.assertNotEqual(updated, self.expected)
        self.assertEqual(self.remote_tip(), updated)
        self.git("fetch", "origin")
        self.git("merge-base", "--is-ancestor", base, updated)
        self.assertEqual(self.git("show", updated + ":feature.txt"), "feature")
        self.assertEqual(self.git("show", updated + ":base-next.txt"), "new base")
        self.assertEqual(self.git("branch", "--show-current"), "main")
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_current_branch_is_not_rewritten(self):
        result, updated = automation.rebase_branch(str(self.remote), "feat/test", "main", self.expected)
        self.assertEqual(result, "current")
        self.assertEqual(updated, self.expected)
        self.assertEqual(self.remote_tip(), self.expected)

    def test_snapshot_mismatch_does_not_push(self):
        result, updated = automation.rebase_branch(str(self.remote), "feat/test", "main", "0" * 40)
        self.assertEqual((result, updated), ("changed", None))
        self.assertEqual(self.remote_tip(), self.expected)

    def test_conflict_leaves_remote_branch_unchanged(self):
        self.git("switch", "feat/test")
        self.write_commit("shared.txt", "feature side\n", "feature conflict")
        expected = self.git("rev-parse", "HEAD")
        self.git("push", "origin", "feat/test")
        self.git("switch", "main")
        self.write_commit("shared.txt", "main side\n", "main conflict")
        self.git("push", "origin", "main")
        result, updated = automation.rebase_branch(str(self.remote), "feat/test", "main", expected)
        self.assertEqual((result, updated), ("conflict", None))
        self.assertEqual(self.remote_tip(), expected)
        self.assertEqual(self.git("status", "--porcelain"), "")

    def test_lease_does_not_overwrite_concurrent_contributor_push(self):
        self.advance_main()
        new_tip = []
        def contributor_push():
            self.git("switch", "feat/test")
            self.write_commit("concurrent.txt", "do not lose me\n", "concurrent work")
            new_tip.append(self.git("rev-parse", "HEAD"))
            self.git("push", "origin", "feat/test")
        with self.assertRaisesRegex(RuntimeError, "Lease-protected"):
            automation.rebase_branch(str(self.remote), "feat/test", "main", self.expected,
                                     before_push=contributor_push)
        self.assertEqual(self.remote_tip(), new_tip[0])

    def test_default_branch_cannot_be_rebased(self):
        with self.assertRaises(ValueError):
            automation.rebase_branch(str(self.remote), "main", "main", self.expected)

    def test_inherited_hook_configuration_is_not_executed(self):
        self.advance_main()
        hooks = self.root / "host-hooks"
        hooks.mkdir()
        marker = self.root / "hook-ran"
        hook = hooks / "post-checkout"
        hook.write_text("#!/bin/sh\nprintf x > '" + marker.as_posix() + "'\n", encoding="utf-8")
        hook.chmod(0o755)
        config = self.root / "host.config"
        config.write_text("[core]\n hooksPath = " + hooks.as_posix() + "\n", encoding="utf-8")
        with patch.dict(os.environ, {"GIT_CONFIG_GLOBAL": str(config)}):
            result, _ = automation.rebase_branch(str(self.remote), "feat/test", "main", self.expected)
        self.assertEqual(result, "rebased")
        self.assertFalse(marker.exists())


class RebaseNoteTests(unittest.TestCase):
    def test_existing_bot_note_is_not_duplicated(self):
        api = FakeAPI(existing=[{"id": 3, "body": "<!-- gaze-auto-rebase -->\nConflict",
                                 "user": {"login": "github-actions[bot]"}}])
        automation.rebase_note(api, "team/repo", 7, "Conflict")
        self.assertEqual(api.writes, [])

    def test_contributor_comment_is_never_overwritten(self):
        api = FakeAPI(existing=[{"id": 3, "body": "<!-- gaze-auto-rebase --> Human evidence",
                                 "user": {"login": "contributor"}}])
        automation.rebase_note(api, "team/repo", 7, "Conflict")
        self.assertEqual(len(api.writes), 1)
        self.assertEqual(api.writes[0][0], "/repos/team/repo/issues/7/comments")
        self.assertIsNone(api.writes[0][2])


class RebaseCoordinatorTests(unittest.TestCase):
    def setUp(self):
        summary = patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": ""})
        summary.start()
        self.addCleanup(summary.stop)

    def test_fork_is_never_rewritten(self):
        class ForkAPI(FakeAPI):
            def pages(self, path):
                return [{"number": 1}]
            def request(self, path, data=None, method=None):
                if path.endswith("/pulls/1"):
                    return {"state": "open", "base": {"ref": "main"},
                            "head": {"repo": {"full_name": "someone/fork"}}}
                return {"default_branch": "main"}
        with patch.object(automation, "rebase_branch") as rebase:
            automation.rebase_prs(ForkAPI(), "team/repo")
            rebase.assert_not_called()

    def test_rebased_branch_gets_new_ci_run(self):
        class SameRepoAPI(FakeAPI):
            def pages(self, path):
                return [] if path.endswith("/comments") else [{"number": 1}]
            def request(self, path, data=None, method=None):
                if data is not None:
                    self.writes.append((path, data, method))
                    return None
                if path.endswith("/pulls/1"):
                    return {"state": "open", "base": {"ref": "main"},
                            "head": {"ref": "feat/test", "sha": "a" * 40,
                                     "repo": {"full_name": "team/repo"}}}
                return {"default_branch": "main"}
        api = SameRepoAPI()
        with patch.object(automation, "rebase_branch", return_value=("rebased", "b" * 40)):
            automation.rebase_prs(api, "team/repo")
        self.assertEqual(api.writes, [("/repos/team/repo/actions/workflows/ci.yml/dispatches",
                                      {"ref": "feat/test"}, None)])


if __name__ == "__main__":
    unittest.main()

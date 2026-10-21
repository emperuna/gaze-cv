"""Bounded video acquisition preserves existing input and cleans partial output."""
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("gaze_prepare_video", Path(__file__).resolve().parents[1] / "scripts/prepare_video.py")
prepare_video = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare_video)


class VideoDownloadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_oversized_response_fails_before_commit_and_removes_partial(self):
        target = self.root / "clip.webm"
        with patch.object(prepare_video, "MAX_BYTES", 8), patch.object(
                prepare_video.urllib.request, "urlopen", return_value=io.BytesIO(b"0123456789")), redirect_stderr(io.StringIO()):
            self.assertEqual(prepare_video.main(["--output",str(target)]), 2)
        self.assertFalse(target.exists())
        self.assertFalse(target.with_suffix(".webm.part").exists())

    def test_existing_mismatched_file_and_partial_are_preserved(self):
        target = self.root / "clip.webm"
        target.write_bytes(b"local video must survive")
        with patch.object(prepare_video.urllib.request, "urlopen") as network, redirect_stderr(io.StringIO()):
            self.assertEqual(prepare_video.main(["--output",str(target)]), 2)
            network.assert_not_called()
        self.assertEqual(target.read_bytes(), b"local video must survive")
        partial = target.with_suffix(".webm.part")
        partial.write_bytes(b"another running download")
        with redirect_stderr(io.StringIO()):
            self.assertEqual(prepare_video.main(["--output",str(target)]), 2)
        self.assertEqual(partial.read_bytes(), b"another running download")

    def test_unicode_target_download_succeeds_with_legacy_console_encoding(self):
        target = self.root / "clip-\u03bb.webm"
        payload = b"small permitted fixture"
        raw = io.BytesIO()
        stream = io.TextIOWrapper(raw, encoding="cp1252", errors="strict")
        with patch.object(prepare_video, "SHA256", hashlib.sha256(payload).hexdigest()), patch.object(
                prepare_video.urllib.request, "urlopen", return_value=io.BytesIO(payload)), redirect_stdout(stream):
            result = prepare_video.main(["--output",str(target)])
        stream.flush()
        self.assertEqual(result, 0)
        self.assertEqual(target.read_bytes(), payload)
        self.assertIn(b"\\u03bb", raw.getvalue())


if __name__ == "__main__":
    unittest.main()

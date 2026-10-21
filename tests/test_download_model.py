"""Model acquisition must preserve existing files on failed bounded downloads."""
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location("gaze_model_download",Path(__file__).resolve().parents[1]/"scripts/download_model.py")
CLI=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLI)

class ModelDownloadTests(unittest.TestCase):
    def test_download_limit_preserves_existing_file_and_cleans_partial(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/"model.task"
            target.write_bytes(b"original")
            with patch.object(CLI,"MAX_BYTES",4),patch.object(CLI.urllib.request,"urlopen",return_value=io.BytesIO(b"oversized payload")):
                with self.assertRaisesRegex(ValueError,"limit"):
                    CLI.acquire_model(target)
            self.assertEqual(target.read_bytes(),b"original")
            self.assertEqual(list(Path(folder).glob("*.part")),[])

    def test_verified_unicode_path_prints_on_legacy_console_without_download(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/"model-\u65b9.task"
            content=b"verified fixture"
            target.write_bytes(content)
            stream=io.BytesIO()
            console=io.TextIOWrapper(stream,encoding="cp1252",errors="strict")
            with patch.object(CLI,"SHA256",hashlib.sha256(content).hexdigest()),patch.object(CLI.urllib.request,"urlopen") as network,redirect_stdout(console):
                code=CLI.main(["--output",str(target)])
            console.flush()
            self.assertEqual(code,0)
            network.assert_not_called()
            self.assertIn(b"Verified existing",stream.getvalue())
            self.assertEqual(target.read_bytes(),content)

if __name__=="__main__":unittest.main()

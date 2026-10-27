import hashlib
import io
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

from gaze.head_download import acquire_onnx


def archive_bytes(name, content):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode='w:gz') as archive:
        info = tarfile.TarInfo(name)
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))
    return result.getvalue()


class HeadDownloadTests(unittest.TestCase):
    def test_verifies_only_selected_model_and_preserves_existing_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)/'model.onnx'
            body = b'reviewed model'
            digest = hashlib.sha256(body).hexdigest()
            with patch('gaze.head_download.urllib.request.urlopen', return_value=io.BytesIO(archive_bytes('model.onnx', body))):
                acquire_onnx('https://example.org/model', 'model.onnx', output, digest, 10240, 100)
            self.assertEqual(output.read_bytes(), body)
            with patch('gaze.head_download.urllib.request.urlopen', return_value=io.BytesIO(archive_bytes('model.onnx', b'wrong'))):
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    acquire_onnx('https://example.org/model', 'model.onnx', output, '0'*64, 10240, 100)
            self.assertEqual(output.read_bytes(), body)
            self.assertEqual(list(Path(folder).glob('*.part')), [])

    def test_rejects_oversized_member_and_missing_or_traversing_member(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)/'model.onnx'
            for member, limit in [('model.onnx', 1), ('../model.onnx', 100)]:
                with self.subTest(member=member), patch('gaze.head_download.urllib.request.urlopen', return_value=io.BytesIO(archive_bytes(member, b'data'))):
                    with self.assertRaises(ValueError):
                        acquire_onnx('https://example.org/model', 'model.onnx', output, '0'*64, 10240, limit)
            self.assertFalse(output.exists())

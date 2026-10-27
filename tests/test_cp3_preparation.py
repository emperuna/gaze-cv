"""A versioned manifest must allow fresh-checkout reconstruction without rewriting it."""
import hashlib
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import numpy as np


class Capture:
    pixels = np.random.default_rng(4).integers(0, 255, (1080, 2048, 3), dtype=np.uint8)
    def __init__(self, *args): pass
    def set(self, *args): pass
    def read(self): return True, self.pixels.copy()
    def release(self): pass


class PreparationTests(unittest.TestCase):
    def test_existing_manifest_can_reconstruct_and_changed_pixels_are_rejected(self):
        path = Path(__file__).resolve().parents[1]/'scripts/prepare_cp3.py'
        spec = importlib.util.spec_from_file_location('prepare_cp3_test', path)
        command = importlib.util.module_from_spec(spec); spec.loader.exec_module(command)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); (root/'data/raw/cp3').mkdir(parents=True); (root/'data/annotations').mkdir()
            sources = {}
            for name in command.SOURCES:
                source = root/f'data/raw/cp3/{name}.mp4'; source.write_bytes(b'pinned test source')
                sources[name] = {'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
            with patch.object(command, 'ROOT', root), patch.object(command, 'SOURCES', sources), patch.object(command.cv2, 'VideoCapture', Capture):
                command.main()
                manifest = root/'data/annotations/cp3.json'; before = manifest.read_bytes()
                shutil.rmtree(root/'data/processed/cp3')
                command.main()
                self.assertEqual(manifest.read_bytes(), before)
                self.assertEqual(len(list((root/'data/processed/cp3').glob('*.png'))), 63)
                shutil.rmtree(root/'data/processed/cp3')
                with patch.object(Capture, 'pixels', np.zeros_like(Capture.pixels)), self.assertRaisesRegex(ValueError, 'manifest'):
                    command.main()
                self.assertEqual(manifest.read_bytes(), before)

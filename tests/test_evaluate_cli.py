"""CLI integration must share decoding and identify code separately from data."""
from contextlib import redirect_stdout
import io
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import cv2
import numpy as np

from gaze.preprocessing import write_image

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("gaze_evaluate_cli", ROOT/"scripts/evaluate.py")
CLI = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLI)


class FakePipeline:
    metadata = {"backend": "unit-test injection"}
    def __init__(self, **kwargs):
        pass
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def process(self, image):
        if image.shape != (20, 30, 3):
            raise AssertionError("Decoded image shape changed")
        face = SimpleNamespace(direction="forward", unavailable_reason=None)
        return SimpleNamespace(detections=[face], to_dict=lambda: {"injected": True})


class EvaluateCLITests(unittest.TestCase):
    def run_case(self, corrupt=False):
        with tempfile.TemporaryDirectory(prefix="gaze-eval-") as directory:
            root = Path(directory)/"Jos\u00e9-\u65b9"
            root.mkdir()
            image = root/"pose\u00e9.png"
            if corrupt:
                image.write_bytes(b"not an image")
            else:
                write_image(image, np.full((20,30,3),127,dtype=np.uint8))
            manifest = root/"manifest.json"
            manifest.write_text(json.dumps({"schema_version":1,"dataset":"synthetic-cli-test","samples":[{
                "id":"v1","image":image.name,"subject":"s1","source":"source1","split":"validation",
                "label":"forward","yaw":0,"pitch":0,"sha256":hashlib.sha256(image.read_bytes()).hexdigest()
            }]}),encoding="utf-8")
            output=root/"result.json"
            with patch.object(CLI,"ImagePipeline",FakePipeline), redirect_stdout(io.StringIO()):
                CLI.main(["--manifest",str(manifest),"--root",str(root),"--output",str(output)])
            report=json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(report["data_root"],str(root.resolve()))
            self.assertEqual(report["source_root"],str(ROOT))
            self.assertEqual(report["implementation_sha256"]["src/gaze/pipeline.py"],
                             hashlib.sha256((ROOT/"src/gaze/pipeline.py").read_bytes()).hexdigest())
            return report

    def test_unicode_data_root_decodes_and_does_not_change_source_provenance(self):
        report=self.run_case()
        self.assertEqual(report["metrics"]["correct"],1)
        self.assertEqual(report["metrics"]["coverage"],1)

    def test_corrupt_image_is_counted_unknown_without_dropping_denominator(self):
        report=self.run_case(corrupt=True)
        self.assertEqual(report["metrics"]["eligible"],1)
        self.assertEqual(report["metrics"]["unavailable"],1)
        self.assertEqual(report["records"][0]["unavailable_reason"],"unreadable_image")


if __name__=="__main__":
    unittest.main()

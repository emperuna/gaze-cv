"""Check color, geometry, validation, and evidence using generated inputs."""
from pathlib import Path
import tempfile
import unittest
import cv2
import numpy as np
from gaze.preprocessing import prepare_image, read_image, write_image, save_preprocessing_evidence

class PreprocessingTests(unittest.TestCase):
    def test_bgr_rgb_and_no_input_mutation(self):
        image=np.zeros((12,24,3),dtype=np.uint8)
        image[:]=(11,22,33)
        prepared=prepare_image(image)
        self.assertEqual(prepared.rgb[0,0].tolist(),[33,22,11])
        self.assertEqual(image[0,0].tolist(),[11,22,33])
        self.assertTrue(prepared.rgb.flags.c_contiguous)
    def test_shrink_preserves_aspect_and_never_upscales(self):
        image=np.zeros((100,200,3),dtype=np.uint8)
        self.assertEqual(prepare_image(image,50).rgb.shape,(25,50,3))
        self.assertEqual(prepare_image(image,400).rgb.shape,(100,200,3))
    def test_reject_invalid_images(self):
        for image in (None,np.zeros((2,2)),np.zeros((0,3,3),dtype=np.uint8),np.zeros((1,2,3),dtype=np.uint8)):
            with self.subTest(image=type(image)),self.assertRaises(ValueError):
                prepare_image(image)
    def test_unicode_roundtrip_and_preprocessing_evidence(self):
        with tempfile.TemporaryDirectory() as folder:
            original=Path(folder)/"face-Ã¦â€“Â¹.png"
            evidence=Path(folder)/"comparison.png"
            image=np.full((40,80,3),(10,20,30),dtype=np.uint8)
            write_image(original,image)
            np.testing.assert_array_equal(read_image(original),image)
            metadata=save_preprocessing_evidence(image,evidence,40)
            self.assertEqual(metadata["prepared_size"],[40,20])
            self.assertEqual(read_image(evidence).shape[1],960)
            self.assertEqual(metadata["model_color"],"RGB")
            with self.assertRaises(ValueError):
                read_image(Path(folder)/"absent.png")


class ImageIoRegressionTests(unittest.TestCase):
    def test_empty_corrupt_and_decoder_errors_are_value_errors(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as folder:
            for name,contents in [("empty.jpg",b""),("corrupt.jpg",b"not an image")]:
                path=Path(folder)/name
                path.write_bytes(contents)
                with self.subTest(name=name),self.assertRaisesRegex(ValueError,"Cannot decode"):
                    read_image(path)
            # OpenCV can also raise for malformed nonempty decoder payloads.
            with patch("gaze.preprocessing.cv2.imdecode",side_effect=cv2.error("decoder assertion")):
                with self.assertRaisesRegex(ValueError,"Cannot decode"):
                    read_image(path)

    def test_predict_empty_image_has_clean_cli_error(self):
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as folder:
            image=Path(folder)/"empty.jpg"
            output=Path(folder)/"output.png"
            image.write_bytes(b"")
            command=Path(__file__).resolve().parents[1]/"scripts/predict.py"
            process=subprocess.run([sys.executable,"-B",str(command),"--input",str(image),"--output",str(output)],capture_output=True,text=True,check=False)
            self.assertEqual(process.returncode,2,process.stderr)
            self.assertIn("Cannot decode",process.stderr)
            self.assertNotIn("Traceback",process.stderr)
            self.assertFalse(output.exists())
            self.assertFalse(output.with_suffix(".json").exists())

    def test_contact_sheet_reads_and_writes_unicode_paths(self):
        import hashlib
        import importlib.util
        import json
        import sys
        from unittest.mock import patch
        from gaze.data import read_manifest
        script=Path(__file__).resolve().parents[1]/"scripts/make_contact_sheet.py"
        spec=importlib.util.spec_from_file_location("contact_sheet_unicode_test",script)
        module=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            source=root/"face-\u65b9.png"
            output=root/"evidence-\u65b9"/"sheet-\u65b9.png"
            write_image(source,np.full((40,60,3),(10,20,30),dtype=np.uint8))
            sample={"id":"one","image":source.name,"subject":"person01","source":"recording01","split":"validation","label":"forward","yaw":0,"pitch":0,"sha256":hashlib.sha256(source.read_bytes()).hexdigest()}
            manifest=root/"manifest.json"
            manifest.write_text(json.dumps({"schema_version":1,"samples":[sample]}),encoding="utf-8")
            with patch.object(module,"read_manifest",side_effect=lambda path:read_manifest(path,root=root)),patch.object(sys,"argv",[str(script),"--manifest",str(manifest),"--output",str(output)]):
                module.main()
            result=read_image(output)
            self.assertEqual(result.shape,(292,1024,3))
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),sample["sha256"])


    def test_contact_sheet_unicode_cli_survives_legacy_windows_console(self):
        import hashlib
        import json
        import os
        import subprocess
        import sys
        repository=Path(__file__).resolve().parents[1]
        scratch=repository/".work"/"tmp"
        scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch,prefix="unicode-cli-") as folder:
            root=Path(folder)
            source=root/"face-\u65b9.png"
            output=root/"sheet-\u65b9.png"
            write_image(source,np.full((40,60,3),(10,20,30),dtype=np.uint8))
            sample={"id":"one","image":source.relative_to(repository).as_posix(),"subject":"person01","source":"recording01","split":"validation","label":"forward","yaw":0,"pitch":0,"sha256":hashlib.sha256(source.read_bytes()).hexdigest()}
            manifest=root/"manifest.json"
            manifest.write_text(json.dumps({"schema_version":1,"samples":[sample]}),encoding="utf-8")
            env=dict(os.environ,PYTHONIOENCODING="cp1252",PYTHONDONTWRITEBYTECODE="1")
            process=subprocess.run([sys.executable,"-B",str(repository/"scripts/make_contact_sheet.py"),"--manifest",str(manifest),"--output",str(output)],capture_output=True,env=env,check=False)
            self.assertEqual(process.returncode,0,process.stderr.decode("cp1252",errors="replace"))
            self.assertEqual(read_image(output).shape,(292,1024,3))
            self.assertNotIn(b"Traceback",process.stderr)

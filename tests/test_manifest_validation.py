"""Malformed annotation inputs must fail clearly before scoring or split filtering."""

import json
from contextlib import redirect_stdout
import io
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

from gaze.data import contained_path, direction_from_angles, read_manifest


class ManifestValidationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.path = self.root / "manifest.json"
        self.sample = {"id": "a", "image": "face.jpg", "subject": "subject-a",
                       "source": "series-a", "split": "validation", "label": "forward",
                       "yaw": 0, "pitch": 0, "sha256": "a" * 64}

    def read(self, document):
        self.path.write_text(json.dumps(document), encoding="utf-8")
        return read_manifest(self.path, root=self.root, check_files=False)

    def test_top_level_and_samples_require_json_objects(self):
        for document in (None, [], True, 12, "manifest", {}, {"schema_version": True, "samples": []},
                         {"schema_version": 1, "samples": {}},
                         *({"schema_version": 1, "samples": [entry]} for entry in (None, [], True, "sample", 42))):
            with self.subTest(document=document), self.assertRaises(ValueError):
                self.read(document)

    def test_angles_reject_non_numeric_boolean_nonfinite_and_overflow(self):
        for value in (None, "0", True, [], {}, float("nan"), float("inf"), 10 ** 1000):
            for field in ("yaw", "pitch"):
                with self.subTest(value=type(value).__name__, field=field), self.assertRaises(ValueError):
                    self.read({"schema_version": 1, "samples": [dict(self.sample, **{field: value})]})
        self.assertEqual(direction_from_angles(0.0, 0), "forward")

    def test_strings_are_required_before_membership_or_checksum_checks(self):
        for field in ("id", "image", "subject", "source", "split", "label", "sha256"):
            for value in (None, [], {}, True):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    self.read({"schema_version": 1, "samples": [dict(self.sample, **{field: value})]})
        for field in ("id", "image", "subject", "source"):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.read({"schema_version": 1, "samples": [dict(self.sample, **{field: " "})]})
        with self.assertRaises(ValueError):
            contained_path(self.root, None)

    def test_alias_paths_cannot_duplicate_the_same_image_in_metrics(self):
        duplicate = dict(self.sample, id="b", image="./face.jpg")
        with self.assertRaisesRegex(ValueError, "Duplicate sample"):
            self.read({"schema_version": 1, "samples": [self.sample, duplicate]})

    def test_malformed_test_record_is_validated_before_validation_filter(self):
        self.path.write_text(json.dumps({"schema_version": 1, "samples": [
            self.sample, dict(self.sample, id="b", image="test.jpg", subject="subject-b",
                              source="series-b", split="test", sha256="b" * 64, yaw="30"),
        ]}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "Pose angles"):
            read_manifest(self.path, split="validation", root=self.root, check_files=False)

    def test_prepare_status_survives_legacy_console_with_unicode_project_path(self):
        script = Path(__file__).resolve().parents[1] / "scripts/prepare_data.py"
        manifest = self.root / "\u9879\u76ee" / "pointing04.json"
        buffer = io.BytesIO()
        output = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
        with patch("gaze.data.prepare_data", return_value=manifest), patch.object(sys, "argv", [str(script)]), redirect_stdout(output):
            runpy.run_path(str(script), run_name="__main__")
        output.flush()
        self.assertIn("\\u9879\\u76ee", buffer.getvalue().decode("cp1252"))
        output.detach()


if __name__ == "__main__":
    unittest.main()

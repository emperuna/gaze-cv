"""Check source label rules, split leakage, integrity, and archive safety offline."""

import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import runpy

from gaze.data import (DATASET_SHA256, contained_path, direction_from_angles,
                       extract_images, load_manifest, read_manifest)


class DataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.image = self.root / "face.jpg"
        self.image.write_bytes(b"sample contents")
        self.sample = {
            "id": "pose1", "image": "face.jpg", "subject": "person01",
            "source": "recording01", "split": "validation", "label": "forward",
            "yaw": 0, "pitch": 0,
            "sha256": hashlib.sha256(self.image.read_bytes()).hexdigest(),
        }

    def manifest(self, samples):
        output = self.root / "manifest.json"
        output.write_text(json.dumps({"schema_version": 1, "samples": samples}), encoding="utf-8")
        return output

    def test_subject_relative_angles_and_down_precedence(self):
        self.assertEqual(direction_from_angles(30, 0), "left")
        self.assertEqual(direction_from_angles(-30, 0), "right")
        self.assertEqual(direction_from_angles(60, 30), "down")
        self.assertEqual(direction_from_angles(-15, -15), "forward")
        self.assertIsNone(direction_from_angles(0, -30))
        self.assertIsNone(direction_from_angles(20, 0))
        with self.assertRaises(ValueError):
            direction_from_angles(float("nan"), 0)

    def test_manifest_preserves_object_and_resolves_image(self):
        path = self.manifest([self.sample])
        self.assertEqual(load_manifest(path, root=self.root)["samples"], [self.sample])
        self.assertEqual(read_manifest(path, root=self.root)[0]["image_path"], self.image)

    def test_corrupt_pixels_are_rejected(self):
        path = self.manifest([self.sample])
        self.image.write_bytes(b"modified")
        with self.assertRaisesRegex(ValueError, "checksum"):
            read_manifest(path, root=self.root)

    def test_missing_pixels_have_reproduction_hint(self):
        self.image.unlink()
        with self.assertRaisesRegex(ValueError, "prepare_data"):
            read_manifest(self.manifest([self.sample]), root=self.root)

    def test_wrong_ground_truth_mapping_rejected(self):
        self.sample["label"] = "right"
        with self.assertRaisesRegex(ValueError, "source pose"):
            read_manifest(self.manifest([self.sample]), root=self.root)

    def test_duplicate_id_rejected(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            read_manifest(self.manifest([self.sample, self.sample]), root=self.root)

    def test_subject_source_and_pixel_leakage_rejected_before_filtering(self):
        for shared in ("subject", "source", "sha256"):
            with self.subTest(shared=shared):
                other = dict(self.sample, id="pose2", image="other.jpg", subject="person02",
                             source="recording02", split="test", sha256="a" * 64)
                other[shared] = self.sample[shared]
                with self.assertRaisesRegex(ValueError, f"Cross-split {shared}"):
                    read_manifest(self.manifest([self.sample, other]), split="validation",
                                  root=self.root, check_files=False)

    def test_unsafe_paths_rejected(self):
        for value in ("../secret.jpg", "C:/secret.jpg", "/secret.jpg", "dir\\secret.jpg"):
            with self.subTest(path=value), self.assertRaises(ValueError):
                contained_path(self.root, value)

    def test_archive_requires_pinned_integrity(self):
        archive = self.root / "bad.tar.gz"
        archive.write_bytes(b"not reviewed archive")
        with self.assertRaisesRegex(ValueError, "checksum"):
            extract_images(archive, self.root / "output")

    def test_archive_traversal_and_links_rejected_without_escape(self):
        for name, link in (("../escape.jpg", False), ("face.jpg", True)):
            archive = self.root / "unsafe.tar.gz"
            with tarfile.open(archive, "w:gz") as handle:
                member = tarfile.TarInfo(name)
                if link:
                    member.type = tarfile.SYMTYPE
                    member.linkname = "../escape.jpg"
                    handle.addfile(member)
                else:
                    member.size = 1
                    handle.addfile(member, io.BytesIO(b"x"))
            with patch("gaze.data.sha256", return_value=DATASET_SHA256), self.assertRaises(ValueError):
                extract_images(archive, self.root / "output")
            self.assertFalse((self.root / "escape.jpg").exists())

    def test_contact_sheet_cannot_overwrite_source_or_manifest(self):
        script = Path(__file__).resolve().parents[1] / "scripts/make_contact_sheet.py"
        validate = runpy.run_path(str(script), run_name="contact_sheet_test")["validate_output_path"]
        manifest = self.root / "manifest.json"
        for output in (self.image, manifest, self.root / "bad.extension"):
            with self.assertRaises(ValueError):
                validate(output, manifest, [{"image_path": self.image}])
        validate(self.root / "sheet.jpg", manifest, [{"image_path": self.image}])


if __name__ == "__main__":
    unittest.main()

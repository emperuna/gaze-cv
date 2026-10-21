"""Metric denominators and unknown observations must not inflate results."""
import unittest
from types import SimpleNamespace
from gaze.evaluation import score_records, direction_for_image, validate_report_output
from pathlib import Path
from tempfile import TemporaryDirectory


class MetricsTests(unittest.TestCase):
    def test_unknown_is_false_negative_and_reduces_coverage(self):
        records = [dict(expected=label, predicted=label) for label in ("forward", "left", "right", "down")]
        records += [dict(expected="left", predicted="unknown", unavailable_reason="no_face")]
        result = score_records(records)
        self.assertEqual(result["accuracy"], 0.8)
        self.assertEqual(result["coverage"], 0.8)
        self.assertEqual(result["conditional_accuracy"], 1.0)
        self.assertAlmostEqual(result["macro_f1"], (3 + 2 / 3) / 4)
        self.assertEqual(result["confusion_matrix"]["left"]["unknown"], 1)
        self.assertEqual(result["per_class"]["left"]["false_negative"], 1)

    def test_wrong_direction_counts_both_classes(self):
        result = score_records([dict(expected="left", predicted="right")])
        self.assertEqual(result["per_class"]["right"]["false_positive"], 1)
        self.assertEqual(result["per_class"]["left"]["false_negative"], 1)
        self.assertEqual(result["macro_f1"], 0)

    def test_all_missing_is_zero_accuracy_and_no_conditional_score(self):
        result = score_records([dict(expected="down", predicted="unknown")])
        self.assertEqual(result["accuracy"], 0)
        self.assertEqual(result["coverage"], 0)
        self.assertIsNone(result["conditional_accuracy"])

    def test_bad_or_empty_labels_fail(self):
        for records in [[], [dict(expected="cheating", predicted="left")], [dict(expected="left", predicted="invalid")]]:
            with self.assertRaises(ValueError):
                score_records(records)

    def test_report_cannot_overwrite_inputs_even_with_explicit_flag(self):
        with TemporaryDirectory() as folder:
            manifest = Path(folder) / "manifest.json"
            manifest.write_text("source", encoding="utf-8")
            with self.assertRaises(ValueError):
                validate_report_output(manifest, [manifest], overwrite=True)
            report = Path(folder) / "report.json"
            report.write_text("old", encoding="utf-8")
            with self.assertRaises(ValueError):
                validate_report_output(report, [manifest])
            self.assertEqual(validate_report_output(report, [manifest], overwrite=True), report)
            with self.assertRaises(ValueError):
                validate_report_output(Path(folder)/"image.jpg", [])
            self.assertEqual(manifest.read_text(encoding="utf-8"), "source")

    def test_multiple_faces_are_unknown_not_best_match(self):
        face = SimpleNamespace(direction="left", unavailable_reason=None)
        self.assertEqual(direction_for_image([face, face]), ("unknown", "multiple_faces"))
        self.assertEqual(direction_for_image([]), ("unknown", "no_face"))
        self.assertEqual(direction_for_image([face]), ("left", None))


if __name__ == "__main__":
    unittest.main()

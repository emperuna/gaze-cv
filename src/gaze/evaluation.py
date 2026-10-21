"""Validation metrics with explicit missed-observation accounting."""

from collections import Counter

DIRECTIONS = ("forward", "left", "right", "down")
PREDICTIONS = DIRECTIONS + ("unknown",)


def score_records(records):
    """Score one prediction per eligible labeled image; unknowns count as misses."""
    records = list(records)
    if not records:
        raise ValueError("At least one labeled validation observation is required")
    matrix = {label: {prediction: 0 for prediction in PREDICTIONS} for label in DIRECTIONS}
    reasons = Counter()
    for record in records:
        expected, predicted = record["expected"], record["predicted"]
        if expected not in DIRECTIONS or predicted not in PREDICTIONS:
            raise ValueError("Unexpected direction label in evaluation record")
        matrix[expected][predicted] += 1
        if predicted == "unknown":
            reasons[record.get("unavailable_reason") or "unknown"] += 1
    per_class = {}
    for label in DIRECTIONS:
        tp = matrix[label][label]
        fp = sum(matrix[other][label] for other in DIRECTIONS if other != label)
        support = sum(matrix[label].values())
        fn = support - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / support if support else 0.0
        f1 = 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else 0.0
        per_class[label] = dict(support=support, true_positive=tp, false_positive=fp,
                                false_negative=fn, precision=precision, recall=recall, f1=f1)
    count = len(records)
    unknown = sum(matrix[label]["unknown"] for label in DIRECTIONS)
    predicted_count = count - unknown
    correct = sum(matrix[label][label] for label in DIRECTIONS)
    return {
        "eligible": count, "predicted": predicted_count, "unavailable": unknown,
        "correct": correct, "accuracy": correct / count,
        "macro_f1": sum(v["f1"] for v in per_class.values()) / len(DIRECTIONS),
        "coverage": predicted_count / count,
        "conditional_accuracy": correct / predicted_count if predicted_count else None,
        "confusion_matrix": matrix, "per_class": per_class,
        "unavailable_reasons": dict(reasons),
        "definitions": {
            "accuracy": "correct / all eligible labeled images; unknown predictions are incorrect",
            "macro_f1": "unweighted mean over all four fixed direction classes; zero-denominator F1 is zero",
            "coverage": "usable direction predictions / all eligible labeled images",
            "conditional_accuracy": "correct / usable direction predictions; supplementary only",
            "confusion_matrix": "rows: ground truth; columns: prediction, including unknown",
            "unit": "one annotated subject per image; multiple faces are ambiguous, not cherry-picked",
        },
    }


def direction_for_image(detections):
    """Single-subject pose datasets require exactly one face, never best-face selection."""
    if len(detections) == 0:
        return "unknown", "no_face"
    if len(detections) > 1:
        return "unknown", "multiple_faces"
    face = detections[0]
    direction = face.direction
    if direction not in DIRECTIONS:
        return "unknown", face.unavailable_reason or "unusable_landmarks"
    return direction, None


def validate_report_output(output, protected_paths, overwrite=False):
    """Preflight every source path before inference; explicit overwrite is report-only."""
    from pathlib import Path
    output = Path(output).resolve()
    if output.suffix.lower() != ".json":
        raise ValueError("Evaluation output must be a .json report")
    if output in {Path(path).resolve() for path in protected_paths}:
        raise ValueError("Evaluation output must not overwrite an input, manifest, or model")
    if output.exists() and not overwrite:
        raise ValueError("Report already exists; choose a new path or explicitly pass --overwrite")
    return output

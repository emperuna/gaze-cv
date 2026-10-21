"""Measure the image baseline on validation data; held-out test scoring stays locked."""

import argparse
from dataclasses import asdict, is_dataclass
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

from gaze.data import load_manifest
from gaze.baseline import Thresholds
from gaze.evaluation import direction_for_image, score_records, validate_report_output
from gaze.landmarks import DEFAULT_MODEL
from gaze.pipeline import ImagePipeline
from gaze.preprocessing import read_image


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--split", choices=["validation"], default="validation")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing report only; never overwrite source inputs")
    parser.add_argument("--model", type=Path)
    parser.add_argument("--method", choices=["baseline", "pose"], default="baseline")
    parser.add_argument("--yaw-threshold", type=float, default=Thresholds().yaw)
    parser.add_argument("--down-threshold", type=float, default=Thresholds().down)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    source_root = Path(__file__).resolve().parents[1]
    try:
        manifest = load_manifest(args.manifest, root=root, check_files=False)
        samples = [sample for sample in manifest["samples"] if sample["split"] == args.split]
        if not samples:
            raise ValueError("Manifest has no validation samples")
        validate_report_output(args.output, [args.manifest, args.model or DEFAULT_MODEL] +
                               [root / sample["image"] for sample in manifest["samples"]], args.overwrite)
        versions = {}
        for package in ["numpy", "opencv-contrib-python", "mediapipe"]:
            try:
                versions[package] = importlib.metadata.version(package)
            except importlib.metadata.PackageNotFoundError:
                pass
        records = []
        with ImagePipeline(model_path=args.model, method=args.method,
                           thresholds=Thresholds(yaw=args.yaw_threshold, down=args.down_threshold)) as pipeline:
            started = time.perf_counter()
            for sample in samples:
                image_path = root / sample["image"]
                if sample.get("sha256") and image_path.is_file() and sha256(image_path) != sample["sha256"]:
                    raise ValueError(f"Input checksum mismatch: {sample['id']}")
                observation = None
                try:
                    image = read_image(image_path)
                except (OSError, ValueError):
                    prediction, reason = "unknown", "unreadable_image"
                else:
                    observation = pipeline.process(image)
                    prediction, reason = direction_for_image(observation.detections)
                records.append({
                    "id": sample["id"], "image": sample["image"], "subject": sample["subject"],
                    "source": sample["source"], "expected": sample["label"], "predicted": prediction,
                    "unavailable_reason": reason,
                    "observations": observation.to_dict() if observation else None,
                })
            elapsed = time.perf_counter() - started
            metadata = getattr(pipeline, "metadata", {})
            if callable(metadata):
                metadata = metadata()
            if is_dataclass(metadata):
                metadata = asdict(metadata)
        revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=source_root, text=True,
                                  capture_output=True, check=False).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=source_root, text=True,
                                    capture_output=True, check=False).stdout.strip())
        implementation = {str(p.relative_to(source_root)).replace("\\", "/"): sha256(p)
                          for folder in [source_root / "src", source_root / "scripts"]
                          for p in sorted(folder.rglob("*.py"))}
        result = {
            "schema_version": 1, "split": "validation", "method": args.method, "dataset": manifest.get("dataset"),
            "manifest_sha256": sha256(args.manifest), "pipeline": metadata,
            "data_root": str(root), "source_root": str(source_root),
            "source_revision": revision, "working_tree_dirty": dirty,
            "implementation_sha256": implementation,
            "environment": {"python": sys.version, "platform": platform.platform(),
                            "processor": platform.processor(), "dependencies": versions},
            "command": subprocess.list2cmdline(sys.argv),
            "timing": {"seconds": elapsed, "images_per_second": len(samples) / elapsed if elapsed else None,
                       "scope": "image reads, checksum verification, preprocessing, detection and prediction; excludes model load and report writing"},
            "metrics": score_records(records), "records": records,
            "limitations": ["Single-subject image validation does not validate seats or temporal events",
                            "The default baseline down threshold was selected on this validation set; report metadata records any explicit override. Scores are development results, not final test estimates",
                            "No locked test images were processed"],
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2), encoding="utf-8", newline="\n")
        print(json.dumps(result["metrics"], indent=2))
        print(f"Saved validation report to {str(args.output)!a}")
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(2, f"Evaluation failed: {error}\n")


if __name__ == "__main__":
    main()

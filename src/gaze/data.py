"""Source-grounded Pointing04 preparation and subject-separated manifests."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import tarfile
import urllib.request


DATASET_URL = "http://crowley-coutaz.fr/HeadPoseDataSet/HeadPoseImageDatabase.tar.gz"
DATASET_SHA256 = "5629cb428f38c65ba0220f480ea53ba859f56fbfc5a34e7396a981f0485ed209"
DATASET_PAGE = "http://crowley-coutaz.fr/Head%20Pose%20Image%20Database.html"
MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024
LABELS = ("forward", "left", "right", "down")
NAME = re.compile(r"person(?P<subject>\d{2})(?P<series>[12])(?P<index>\d{2})(?P<tilt>[+-]\d+)(?P<pan>[+-]\d+)\.jpg$")


def project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def contained_path(root: Path, relative: str) -> Path:
    """Reject absolute, traversing, Windows-drive, or symlink-escaping paths."""
    if not isinstance(relative, str):
        raise ValueError("Data paths must be strings")
    value = PurePosixPath(relative)
    if not relative or "\\" in relative or ":" in relative or value.is_absolute() or ".." in value.parts:
        raise ValueError(f"Unsafe data path: {relative!r}")
    result = (root / Path(*value.parts)).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError(f"Data path escapes project: {relative!r}")
    return result


def direction_from_angles(yaw: float, pitch: float) -> str | None:
    """Map source angles; down wins mixed poses, upward-only poses are excluded.

    Angles are subject-relative: positive yaw means their left, positive pitch
    means down. These ground-truth bin edges are fixed, not detector thresholds.
    """
    for value in (yaw, pitch):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Pose angles must be finite numbers, not strings or booleans")
        try:
            finite = math.isfinite(value)
        except OverflowError:
            finite = False
        if not finite:
            raise ValueError("Pose angles must be finite numbers")
    if pitch >= 30:
        return "down"
    if pitch < -15:
        return None
    if yaw >= 30:
        return "left"
    if yaw <= -30:
        return "right"
    if abs(yaw) <= 15 and abs(pitch) <= 15:
        return "forward"
    return None


def read_manifest(path: str | Path, split: str | None = None, *, root: Path | None = None,
                  check_files: bool = True) -> list[dict]:
    """Validate the entire manifest before filtering; return resolved image_path."""
    root = (root or project_root()).resolve()
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(document, dict) or type(document.get("schema_version")) is not int or document.get("schema_version") != 1 or not isinstance(document.get("samples"), list):
        raise ValueError("Expected schema_version 1 with a samples list")
    if split is not None and split not in {"validation", "test", "train"}:
        raise ValueError("Unknown split")
    identifiers, paths, hashes, subjects, sources = set(), set(), {}, {}, {}
    result = []
    for original in document["samples"]:
        if not isinstance(original, dict):
            raise ValueError("Each manifest sample must be a JSON object")
        sample = dict(original)
        for field in ("id", "image", "subject", "source", "split", "label", "yaw", "pitch", "sha256"):
            if field not in sample:
                raise ValueError(f"Missing sample field: {field}")
        if not isinstance(sample["label"], str) or not isinstance(sample["split"], str) or sample["label"] not in LABELS or sample["split"] not in {"validation", "test", "train"}:
            raise ValueError("Invalid label or split")
        if any(not isinstance(sample[k], str) or not sample[k].strip() for k in ("id", "image", "subject", "source")):
            raise ValueError("Sample identifiers and paths must be nonempty strings")
        if not isinstance(sample["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", sample["sha256"]):
            raise ValueError("Expected a SHA256 image checksum")
        image_path = contained_path(root, sample["image"])
        if sample["id"] in identifiers or image_path in paths:
            raise ValueError("Duplicate sample id or image path")
        identifiers.add(sample["id"])
        paths.add(image_path)
        for group, mapping in (("subject", subjects), ("source", sources), ("sha256", hashes)):
            value = sample[group]
            if value in mapping and mapping[value] != sample["split"]:
                raise ValueError(f"Cross-split {group} leakage: {value}")
            mapping[value] = sample["split"]
        if direction_from_angles(sample["yaw"], sample["pitch"]) != sample["label"]:
            raise ValueError(f"Label disagrees with source pose: {sample['id']}")
        if check_files:
            if not image_path.is_file():
                raise ValueError(f"Missing image {sample['image']}; run scripts/prepare_data.py")
            if sha256(image_path) != sample["sha256"]:
                raise ValueError(f"Image checksum mismatch: {sample['image']}")
        if split is None or sample["split"] == split:
            sample["image_path"] = image_path
            result.append(sample)
    if not result:
        raise ValueError("Manifest selection contains no samples")
    return result


def acquire_archive(destination: Path) -> None:
    """Download a bounded archive, verifying pinned bytes before extraction.

    The author host's HTTPS certificate is invalid, so its original HTTP URL
    is explicit. Integrity is pinned to the reviewed archive, not authenticated
    transport. Never disable TLS certificate verification globally.
    """
    if destination.exists() and sha256(destination) == DATASET_SHA256:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    try:
        total = 0
        with urllib.request.urlopen(DATASET_URL, timeout=60) as response, partial.open("wb") as handle:
            for block in iter(lambda: response.read(1024 * 1024), b""):
                total += len(block)
                if total > MAX_DOWNLOAD_BYTES:
                    raise ValueError("Dataset archive exceeds the 40 MiB download limit")
                handle.write(block)
        if sha256(partial) != DATASET_SHA256:
            raise ValueError("Dataset archive checksum differs from the reviewed version")
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)


def load_manifest(path: str | Path, *, root: Path | None = None,
                  check_files: bool = True) -> dict:
    """Return the JSON object after complete label, group, and path validation."""
    read_manifest(path, root=root, check_files=check_files)
    return json.loads(Path(path).read_text(encoding="utf-8"))


def extract_images(archive: Path, destination: Path) -> None:
    """Extract JPEG regular files only, without trusting tar paths or links."""
    if sha256(archive) != DATASET_SHA256:
        raise ValueError("Dataset archive checksum mismatch")
    total = 0
    with tarfile.open(archive, "r:gz") as handle:
        for member in handle:
            # Validate even ignored names, and reject links rather than following them.
            output = contained_path(destination, member.name)
            if member.issym() or member.islnk():
                raise ValueError("Dataset archive contains links")
            if not member.isfile() or not member.name.lower().endswith(".jpg"):
                continue
            total += member.size
            if member.size > 2 * 1024 * 1024 or total > 100 * 1024 * 1024:
                raise ValueError("Dataset archive exceeds extraction limits")
            output.parent.mkdir(parents=True, exist_ok=True)
            stream = handle.extractfile(member)
            if stream is None:
                raise ValueError("Unreadable archive member")
            with stream, output.open("wb") as target:
                target.write(stream.read())


def build_manifest(root: Path) -> dict:
    """Choose 6 poses per direction per subject without consulting predictions."""
    original = root / "data/raw/pointing04/original"
    selected = []
    for image in sorted(original.rglob("*.jpg")):
        if image.parent.name == "Front":  # duplicate convenience copies
            continue
        match = NAME.fullmatch(image.name)
        if not match:
            raise ValueError(f"Unrecognized Pointing04 image name: {image.name}")
        values = {key: int(value) for key, value in match.groupdict().items()}
        yaw, pitch = -values["pan"], -values["tilt"]
        # A documented moderate-angle subset; neither detector success nor test
        # outputs can influence inclusion. Both series stay with their subject.
        keep = (pitch == 0 and abs(yaw) in (0, 15, 30, 45, 60)) or (
            values["series"] == 1 and pitch in (30, 60) and abs(yaw) <= 15)
        if not keep:
            continue
        label = direction_from_angles(yaw, pitch)
        if label is None:
            continue
        subject = f"person{values['subject']:02d}"
        selected.append({
            "id": f"pointing04-{image.stem}", "image": image.relative_to(root).as_posix(),
            "subject": subject, "source": f"pointing04/{subject}/series{values['series']}",
            "split": "validation" if values["subject"] <= 10 else "test",
            "label": label, "yaw": yaw, "pitch": pitch, "sha256": sha256(image),
        })
    if len(selected) != 360:
        raise ValueError(f"Expected 360 prepared poses, got {len(selected)}")
    return {
        "schema_version": 1, "dataset": "pointing04-cp2-moderate-v1",
        "source_url": DATASET_PAGE, "archive_sha256": DATASET_SHA256,
        "direction_convention": "Subject-relative, unmirrored: positive yaw left, positive pitch down",
        "label_policy": {"down_pitch_min": 30, "turn_yaw_min": 30,
                         "forward_max_abs_yaw": 15, "forward_max_abs_pitch": 15,
                         "mixed_pose_precedence": "down", "source_to_canonical": "yaw=-pan; pitch=-tilt"},
        "samples": selected,
    }


def prepare_data(root: Path | None = None, *, download: bool = True) -> Path:
    root = (root or project_root()).resolve()
    archive = root / "data/raw/pointing04/HeadPoseImageDatabase.tar.gz"
    if download:
        acquire_archive(archive)
    extract_images(archive, root / "data/raw/pointing04/original")
    document = build_manifest(root)
    # Publish 20 validation examples (5 subjects x 4 directions). Test pixels
    # remain local; the complete test manifest is locked without scoring it.
    examples = []
    for subject_number in range(1, 6):
        for label in LABELS:
            sample = next(s for s in document["samples"] if s["subject"] == f"person{subject_number:02d}" and s["label"] == label)
            source = root / sample["image"]
            target = root / "data/samples/pointing04" / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read_bytes())
            # Use the checked-in copies in every command for these same records.
            sample["image"] = target.relative_to(root).as_posix()
            examples.append(dict(sample))
    annotation = root / "data/annotations"
    annotation.mkdir(parents=True, exist_ok=True)
    for name, records in (("pointing04.json", document["samples"]), ("samples.json", examples)):
        output = dict(document, samples=records)
        (annotation / name).write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8", newline="\n")
    spike = [examples[index]["id"] for index in (0, 1, 2, 3, 4)]
    (annotation / "spike_ids.json").write_text(json.dumps(spike, indent=2) + "\n", encoding="utf-8", newline="\n")
    manifest = annotation / "pointing04.json"
    read_manifest(manifest, root=root)
    return manifest

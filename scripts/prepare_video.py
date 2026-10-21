"""Acquire the pinned public-domain Xiph FourPeople multi-person video proxy."""
import argparse
import hashlib
from pathlib import Path
import sys
import urllib.error
import urllib.request

URL = "https://media.xiph.org/video/derf/webm/FourPeople_1280x720_60.webm"
MAX_BYTES = 16 * 1024 * 1024
SHA256 = "1e4a5df7e67ae985370321cc2c91b8595f7e3433ad8ee1e84da7a26ff5254deb"


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("data/raw/video/FourPeople_1280x720_60.webm"))
    args = parser.parse_args(argv)
    target = args.output
    partial = target.with_suffix(target.suffix + ".part")
    created_partial = False
    try:
        if partial.exists():
            raise ValueError("A partial download already exists; choose another path or inspect it first.")
        if target.exists():
            if digest(target) != SHA256:
                raise ValueError("Existing video checksum differs; choose another output path.")
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            request = urllib.request.Request(URL, headers={"User-Agent": "GAZE-course-prototype/0.1"})
            with urllib.request.urlopen(request, timeout=60) as source, partial.open("xb") as destination:
                created_partial = True
                total = 0
                while block := source.read(1024 * 1024):
                    total += len(block)
                    if total > MAX_BYTES:
                        raise ValueError(f"Video response exceeds the {MAX_BYTES}-byte download limit.")
                    destination.write(block)
            if digest(partial) != SHA256:
                raise ValueError("Downloaded video checksum differs; source needs review.")
            partial.replace(target)
        print(f"Ready: {str(target)!a}\nSHA256: {SHA256}")
        print("Xiph lists this sequence as public domain: https://media.xiph.org/video/derf/")
        print("Office meeting proxy only; no classroom, direction, seat or event labels.")
        return 0
    except (ValueError, OSError, urllib.error.URLError) as error:
        print(f"Video acquisition failed: {str(error)!a}", file=sys.stderr)
        return 2
    finally:
        if created_partial and partial.exists():
            partial.unlink()


if __name__ == "__main__":
    raise SystemExit(main())

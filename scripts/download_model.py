"""Download Google's versioned FaceLandmarker asset; verify exact bytes."""
import argparse
import hashlib
from pathlib import Path
import sys
import tempfile
import urllib.request

URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
SHA256="64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
MAX_BYTES=10*1024*1024
DEFAULT_PATH=Path(__file__).resolve().parents[1]/"models"/"downloads"/"face_landmarker.task"

def acquire_model(destination):
    destination=Path(destination)
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest()==SHA256:
        return False
    destination.parent.mkdir(parents=True,exist_ok=True)
    partial=None
    try:
        # Explicit model-directory temp keeps all new file writes on destination drive.
        with tempfile.NamedTemporaryFile(dir=destination.parent,prefix="face_landmarker-",suffix=".part",delete=False) as output:
            partial=Path(output.name)
            digest=hashlib.sha256()
            total=0
            with urllib.request.urlopen(URL,timeout=60) as response:
                for block in iter(lambda:response.read(1024*1024),b""):
                    total+=len(block)
                    if total>MAX_BYTES:
                        raise ValueError("Face model exceeds expected 10 MiB limit.")
                    digest.update(block)
                    output.write(block)
        if digest.hexdigest()!=SHA256:
            raise ValueError("Face model checksum differs from the reviewed version.")
        partial.replace(destination)
        return True
    finally:
        if partial is not None:
            partial.unlink(missing_ok=True)

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,default=DEFAULT_PATH)
    args=parser.parse_args(argv)
    try:
        downloaded=acquire_model(args.output)
        print(f"{'Downloaded' if downloaded else 'Verified existing'} model: {str(args.output)!a}; SHA256 {SHA256}")
        return 0
    except (OSError,ValueError) as error:
        print(f"Model acquisition failed: {error}",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())

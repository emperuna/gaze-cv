"""Bounded extraction of selected, checksum-pinned model bytes; no archive paths written."""
import hashlib
from pathlib import Path
import tarfile
import tempfile
import urllib.request


class LimitedReader:
    def __init__(self, stream, limit):
        self.stream, self.remaining = stream, limit

    def read(self, size=-1):
        chunk = self.stream.read(min(1024*1024, size if size >= 0 else 1024*1024, self.remaining+1))
        self.remaining -= len(chunk)
        if self.remaining < 0:
            raise ValueError('Head model archive download exceeds limit')
        return chunk


def acquire_onnx(url, member_name, destination, expected_hash, archive_limit, model_limit):
    destination = Path(destination)
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == expected_hash:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = None
    try:
        with urllib.request.urlopen(url, timeout=60) as response:
            with tarfile.open(fileobj=LimitedReader(response, archive_limit), mode='r|gz') as archive:
                for member in archive:
                    if member.name != member_name:
                        continue
                    if not member.isfile() or not 0 < member.size <= model_limit:
                        raise ValueError('Unsafe or oversized head model archive member')
                    digest = hashlib.sha256()
                    with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.part', delete=False) as output:
                        partial = Path(output.name)
                        with archive.extractfile(member) as source:
                            total = 0
                            while block := source.read(1024*1024):
                                total += len(block)
                                if total > model_limit:
                                    raise ValueError('Head model size exceeds limit')
                                digest.update(block)
                                output.write(block)
                    if total != member.size or digest.hexdigest() != expected_hash:
                        raise ValueError('Head model checksum mismatch')
                    partial.replace(destination)
                    return True
        raise ValueError('Expected model member not found within archive')
    finally:
        if partial is not None:
            partial.unlink(missing_ok=True)

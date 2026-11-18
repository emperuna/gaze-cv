"""Read bounded report JSON from stdin and write a PDF to stdout (no media files)."""
import json
import sys

from gaze.incident_pdf import render_incident_pdf


def main():
    body = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
    if len(body) > 4 * 1024 * 1024:
        raise ValueError('Report data exceeds 4 MB')
    pdf = render_incident_pdf(json.loads(body))
    if len(pdf) > 48 * 1024 * 1024:
        raise ValueError('Generated PDF exceeds 48 MB')
    sys.stdout.buffer.write(pdf)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'PDF generation failed: {error}', file=sys.stderr)
        sys.exit(1)

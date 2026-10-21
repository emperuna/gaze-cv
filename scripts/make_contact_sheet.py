"""Create a labeled validation contact sheet from source-grounded samples."""

import argparse
from pathlib import Path

import cv2
import numpy as np

from gaze.data import read_manifest
from gaze.preprocessing import read_image, write_image


def validate_output_path(output: Path, manifest: Path, samples: list) -> None:
    """Never overwrite an input image or the source-grounded manifest."""
    protected = {manifest.resolve(), *(sample["image_path"].resolve() for sample in samples)}
    if output.resolve() in protected:
        raise ValueError("Contact-sheet output must differ from the manifest and all source images")
    if output.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
        raise ValueError("Contact-sheet output requires a .jpg, .jpeg, or .png extension")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=Path("data/annotations/samples.json"))
    parser.add_argument("--output", type=Path, default=Path("outputs/evidence/contact-sheet.jpg"))
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 100:
        parser.error("--limit must be between 1 and 100")
    try:
        records = read_manifest(args.manifest)
        validate_output_path(args.output, args.manifest, records)
        samples = [sample for sample in records if sample["split"] == "validation"][:args.limit]
        if not samples:
            raise ValueError("Contact sheet requires validation examples")
        columns, cell_width, cell_height = 4, 256, 238
        content_height = (len(samples) + columns - 1) // columns * cell_height
        sheet = np.full((content_height + 54,
                         columns * cell_width, 3), 245, dtype=np.uint8)
        for index, sample in enumerate(samples):
            image = read_image(sample["image_path"])
            # Display-only resizing; these pixels are never an evaluation input.
            resized = cv2.resize(image, (256, 192), interpolation=cv2.INTER_AREA)
            row, column = divmod(index, columns)
            y, x = row * cell_height, column * cell_width
            sheet[y:y + 192, x:x + 256] = resized
            lines = [f"{sample['subject']} | {sample['label']}",
                     f"yaw {sample['yaw']:+} pitch {sample['pitch']:+} | validation"]
            for line_index, line in enumerate(lines):
                cv2.putText(sheet, line, (x + 5, y + 210 + 18 * line_index),
                            cv2.FONT_HERSHEY_SIMPLEX, .43, (20, 20, 20), 1, cv2.LINE_AA)
        for line_index, line in enumerate((
            "Pointing04 | N. Gourier, D. Hall, J. L. Crowley (2004) | Subject-relative; unmirrored",
            "Source: crowley-coutaz.fr/Head%20Pose%20Image%20Database.html | Used with attribution",
        )):
            cv2.putText(sheet, line, (8, content_height + 21 + 22 * line_index),
                        cv2.FONT_HERSHEY_SIMPLEX, .47, (20, 20, 20), 1, cv2.LINE_AA)
        write_image(args.output, sheet)
    except (ValueError, OSError, cv2.error) as error:
        parser.exit(2, f"Contact sheet failed: {error}\n")
    print(f"Saved {len(samples)} source-labeled validation examples to {str(args.output)!a}")


if __name__ == "__main__":
    main()

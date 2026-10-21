"""Run the shared CPU image baseline and save annotated output plus JSON."""
import argparse
import json
from pathlib import Path
import sys
from gaze.baseline import Thresholds
from gaze.pipeline import ImagePipeline
from gaze.preprocessing import read_image, write_image
from gaze.visualization import annotate

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--method",choices=["baseline","pose"],default="baseline")
    parser.add_argument("--max-faces", type=int, default=10)
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--mirrored", action="store_true", help="Input pixels are mirrored; preserve subject-relative labels.")
    parser.add_argument("--yaw-threshold", type=float, default=Thresholds().yaw)
    parser.add_argument("--down-threshold", type=float, default=Thresholds().down)
    args = parser.parse_args(argv)
    try:
        inputs = {args.input.resolve()}
        if args.model is not None:
            inputs.add(args.model.resolve())
        if inputs & {args.output.resolve(), args.output.with_suffix(".json").resolve()}:
            raise ValueError("Input and output must be different paths.")
        image = read_image(args.input)
        with ImagePipeline(args.model, args.max_faces, Thresholds(args.yaw_threshold,args.down_threshold), args.max_width,args.mirrored,method=args.method) as pipeline:
            result = pipeline.process(image)
            write_image(args.output, annotate(image,result))
            report = {"input": str(args.input), "pipeline": pipeline.metadata, "result": result.to_dict()}
        args.output.with_suffix(".json").write_text(json.dumps(report,indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"Saved {str(args.output)!a}; faces={len(result.detections)}; processing_ms={result.processing_ms:.2f}")
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Prediction failed: {error}", file=sys.stderr)
        return 2

if __name__ == "__main__":
    raise SystemExit(main())

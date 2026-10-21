"""Run five permitted validation images through the shared CPU baseline."""
import argparse
import json
from pathlib import Path
import sys
from gaze.data import read_manifest
from gaze.pipeline import ImagePipeline
from gaze.preprocessing import read_image, write_image
from gaze.visualization import annotate

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest",type=Path,default=Path("data/annotations/samples.json"))
    parser.add_argument("--output-dir",type=Path,default=Path("outputs/evidence/spike"))
    parser.add_argument("--model",type=Path)
    args=parser.parse_args(argv)
    try:
        records=read_manifest(args.manifest)
        samples=[sample for sample in records if sample["split"]=="validation"]
        if len(samples)<5:
            raise ValueError("The feasibility spike requires at least five validation images.")
        protected={args.manifest.resolve()} | {sample["image_path"].resolve() for sample in records}
        if args.model is not None:
            protected.add(args.model.resolve())
        planned=[args.output_dir/f"{index:02d}-{Path(sample['image']).stem}.png" for index,sample in enumerate(samples[:5],1)]
        planned.append(args.output_dir/"report.json")
        if any(path.resolve() in protected for path in planned):
            raise ValueError("Spike outputs would overwrite an input image, manifest, or model.")
        reports=[]
        with ImagePipeline(model_path=args.model) as pipeline:
            for index,sample in enumerate(samples[:5],1):
                output=args.output_dir/f"{index:02d}-{Path(sample['image']).stem}.png"
                if output.resolve()==sample["image_path"].resolve():
                    raise ValueError("Output would overwrite input image.")
                image=read_image(sample["image_path"])
                result=pipeline.process(image)
                write_image(output,annotate(image,result))
                reports.append({"id":sample["id"],"image":sample["image"],"expected":sample["label"],"output":str(output),"result":result.to_dict()})
            report={"pipeline":pipeline.metadata,"manifest":str(args.manifest),"split":"validation","samples":reports}
        args.output_dir.mkdir(parents=True,exist_ok=True)
        (args.output_dir/"report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8", newline="\n")
        print(f"Saved five-image feasibility spike in {str(args.output_dir)!a}")
        return 0
    except (OSError,ValueError,RuntimeError) as error:
        print(f"Spike failed: {error}",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())

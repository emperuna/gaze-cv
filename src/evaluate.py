"""Freeze and score the CP4 held-out set using the shared GAZE pipelines."""
import argparse
from pathlib import Path
import sys

from gaze.checkpoint_evaluation import evaluate_protocol, freeze_protocol


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    for action in ('freeze', 'run'):
        command = commands.add_parser(action)
        command.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
        command.add_argument('--output', type=Path, required=True)
        command.add_argument('--manifest' if action == 'freeze' else '--protocol', type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.action == 'freeze':
            protocol = freeze_protocol(args.manifest, args.output, args.root)
            print(f"Frozen {len(protocol['sample_ids'])} held-out samples without test inference: {args.output}")
        else:
            report = evaluate_protocol(args.protocol, args.output, args.root)
            for method, result in report['methods'].items():
                m = result['metrics']
                print(f"{method}: {m['correct']}/{m['eligible']}; accuracy={m['accuracy']:.4f}; "
                      f"macro-F1={m['macro_f1']:.4f}; coverage={m['coverage']:.4f}")
            print(f'Saved held-out results: {args.output}')
        return 0
    except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        print(f'CP4 evaluation failed: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())

"""Retrieve the pinned Pointing04 archive and create reproducible manifests."""

import argparse

from gaze.data import prepare_data


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Use the already downloaded, checksum-verified archive")
    args = parser.parse_args()
    try:
        manifest = prepare_data(download=not args.offline)
    except (ValueError, OSError) as error:
        parser.exit(2, f"Data preparation failed: {error}\n")
    print(f"Prepared {str(manifest)!a}: 240 validation and 120 locked test samples; no test predictions made.")


if __name__ == "__main__":
    main()

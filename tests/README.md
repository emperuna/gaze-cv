# Application verification

Run `python -m unittest discover -s tests -v` with the project environment and F:-local cache/TEMP settings described in [README](../README.md). Tests use synthetic arrays, injected detectors, temporary manifests, and short generated video; they do not require a camera, private data, model downloads, or full datasets.

Covered behavior includes subject-relative directions and mirroring, baseline boundaries, approximate-pose signs/projection failures, image preparation and coordinates, source data integrity and split leakage, input/output collision protection, metric denominators and unknown predictions, frame timestamps, ambiguous seats, missing observations, source-time histories, and sustained/repeated movement rules.

Model/data integration evidence is separate: permitted labeled images, recorded validation results, saved-video overlays/FPS, and clean-folder reproduction. Synthetic tests cannot establish classroom generalization or real temporal-event accuracy. Another human member's reproduction, target-laptop performance, final held-out scoring, and personal code contributions remain explicit checkpoint obligations.

Repository automation tests live in .github/tests/; The updated CI definition runs both suites once this branch is published. Keep generated artifacts and temporary environments out of ordinary commits.

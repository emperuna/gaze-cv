# Application verification

Run `python -m unittest discover -s tests -v` with the project environment and F:-local cache/TEMP settings described in [README](../README.md). Tests use synthetic arrays, injected detectors, temporary manifests, and short generated video; they do not require a camera, private data, model downloads, or full datasets.

Covered behavior includes subject-relative directions and mirroring, baseline boundaries, approximate-pose signs/projection failures, image preparation and coordinates, source data integrity and split leakage, input/output collision protection, metric denominators and unknown predictions, frame timestamps, ambiguous seats, missing observations, source-time histories, and sustained/repeated movement rules.

`test_camera.py` also checks bounded/corrupt JPEG frames, increasing elapsed
capture timestamps, per-frame counts, and persistent worker protocol reuse.
Frontend camera tests run separately from `frontend/` with `npm test` using
Node.js 22.18 or newer. They cover inference exclusion, response correlation,
sequential capture, cancellation, idle/frame timeouts, and worker shutdown.
See [camera verification](../docs/superpowers/specs/2026-10-29-live-camera-verification.md)
for real-model and synthetic-browser integration checks. These do not establish
physical-camera behavior or the authorized three-seat demonstration.

`test_session_review.py` checks saved-review exports/provenance, source-time
alignment, missing/ambiguous gaps, invalid settings, protected output paths,
corrupt media, mirroring consistency and frame/output budgets. Frontend
`review.test.mjs` checks seat validation, frame selection, mirrored coordinates,
media ranges and cancellation during completed-manifest publication. See
[saved-review checks](../docs/superpowers/specs/2026-10-29-saved-review-verification.md)
and the [CP4 test-case table](../docs/checkpoints/cp4-test-cases.md).

`test_review_setup.py` covers quantized constant cadence, inconsistent/unavailable
timestamps, actual CFR decoding, persistent detections, no-head manual fallback,
and keeping nearby heads distinct when suggested padding would overlap.

Model/data integration evidence is separate: permitted labeled images, recorded validation results, saved-video overlays/FPS, and clean-folder reproduction. Synthetic tests cannot establish classroom generalization or real temporal-event accuracy. Another human member's reproduction, target-laptop performance, final held-out scoring, and personal code contributions remain explicit checkpoint obligations.

Repository automation tests live in .github/tests/; The updated CI definition runs both suites once this branch is published. Keep generated artifacts and temporary environments out of ordinary commits.

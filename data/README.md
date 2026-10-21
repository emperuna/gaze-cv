# Project data

The CP2 image baseline uses an acquired, source-labeled subset of the **Pointing04 Head Pose Image Database**, replacing the unverified BIWI acquisition plan for this checkpoint. The [data card](../docs/evaluation/data-card.md) records permissions, labels, limits, and exact counts. No training is performed.

| Location | Contents |
| --- | --- |
| `samples/pointing04/` | Twenty permitted validation images with attribution, five subjects and all four directions. |
| `annotations/pointing04.json` | Reproducible 360-image manifest: 240 validation and 120 locked test images. |
| `annotations/samples.json` | The twenty checked-in examples, using the same IDs and labels. |
| `annotations/spike_ids.json` | Five validation IDs for the feasibility demonstration. |
| `raw/pointing04/` | Ignored original archive and extracted dataset; retrieve with the preparation command. |

From the repository root after installing the project:

```powershell
.\.venv\Scripts\python.exe scripts/prepare_data.py
.\.venv\Scripts\python.exe scripts/make_contact_sheet.py
```

Preparation downloads 28.5 MB, verifies a pinned SHA256, extracts JPEG regular files with size and path limits, and recreates manifests and the twenty sample copies deterministically. Use `--offline` to reuse the verified local archive. It never runs code from the dataset. The original author host serves HTTP and currently has a mismatched HTTPS certificate; the downloader uses the explicit original HTTP URL and verifies the reviewed archive hash rather than disabling TLS checks.

Validation contains persons 01-10 and both available series; locked test contains persons 11-15 and both series. No person, series, or identical image crosses these groups. The manifest validator checks this before selecting a split. Detector failure never determines sample inclusion. Keep test results out of threshold tuning; test labels are available for reproducibility but aggregate test predictions are deferred until final frozen evaluation.

Angles and labels are subject-relative in an **unmirrored** image: positive yaw means the person's left (toward image right), and positive pitch means down. Source filenames provide the prescribed target pose: `yaw = -pan`, `pitch = -tilt`. These are nominal target annotations, not measured precise 3D rotations. Upward-only poses have no project class and are excluded. The data card details the moderate-angle subset and down-first mixed-pose policy.

Contact sheets are display evidence, not extra independent evaluation samples. Saved multi-person footage has separate provenance and limitations in [the video notes](../docs/evaluation/video.md). Pointing04 images cannot validate classroom behavior, seat identity, or movement events. Keep full datasets, private footage, and generated runs out of Git.

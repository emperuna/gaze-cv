# Project data

This folder is boilerplate only. No dataset, sample images, or labels have been acquired through the scaffold.

## Initial organization

```text
data/
    README.md
    samples/
        .gitkeep
    annotations/
        .gitkeep
```

| Location | Purpose |
| --- | --- |
| `samples/` | A small selection of real images for the five-image spike and labeled contact sheet. Publish only samples with redistribution permission. |
| `annotations/` | Labels describing the samples, followed by subject split manifests when evaluation begins. Choose the label format after inspecting the actual dataset. |

The empty `.gitkeep` files preserve the folders in Git; they contain no project data. Generated contact sheets and annotated screenshots belong in `outputs/evidence/`, rather than among the input samples.

## Data acquisition and evaluation

Before evaluation, record the source, access date, permissions, annotation meanings, class counts, conditions, and subject splits. BIWI is the planned pose-data source in the PRD; access remains unverified. LFW smoke-test images do not provide direction ground truth. Multi-person and temporal evaluation require separately authorized labeled video.

Create `raw/` only when original datasets or footage are acquired. Create `processed/` only if derived inputs need to be saved. Both folders are absent from the initial scaffold, and their existing Git ignore rules remain in place for future local use. Keep private footage and full datasets out of the public repository; check permissions before publishing samples or annotations.

## CP2 data card and split evidence

Prepare a one-page data card here when data is acquired; these notes are requirements, not a completed card. Include:

- Sources, dataset versions/access dates, licences, redistribution limits, and acquisition instructions.
- Acquired sample counts per direction class and per split, plus subject and recording/source counts.
- How ground-truth labels were derived, checked, and corrected, including mixed poses and unknown observations.
- Image dimensions and relevant capture conditions; known coverage gaps such as lighting, angles, and occlusion.
- Applied preprocessing and references to permitted before/after evidence.

Store reproducible validation and locked test manifests in annotations/; add a training manifest if training is introduced. Each subject and recording/source must stay within one split, including frames from the same video. Record the split rationale and verify no group overlap; the guide's 70/15/15 example is optional. Use validation data for tuning and CP2 results. Do not use test results for tuning; reserve aggregate test scoring for the final frozen evaluation. A class demonstration may process a teacher-selected test image without changing settings from its output.

No train/val/test folder duplication is required if manifests suit the chosen tools. Keep full data and private footage out of Git and record how a permitted fresh clone can obtain the required inputs. See [the evaluation plan](../docs/evaluation/README.md).

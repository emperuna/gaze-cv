# CP3 initial evaluation evidence

See the [submission index](../../../docs/checkpoints/cp3-hand-in/README.md), [data card](../../../docs/checkpoints/cp3-hand-in/data-card.md) and [test log](../../../docs/checkpoints/cp3-hand-in/test-log.md). These are head-direction predictions, not misconduct labels.

[Comparison JSON](comparison.json) contains full predictions, metrics, versions, timing and implementation hashes. [Initial run](initial-comparison.json) is retained; no tuning followed it. [Confusion matrices](confusion-matrices.png) show reference rows and predicted columns, including unknown.

## Failures by assigned input condition

Counts include every failed image, not just the gallery. Conditions are not proven causal diagnoses.

| Condition | Baseline failures | Main failures |
| --- | ---: | ---: |
| blur | 9 | 12 |
| clean_pose | 0 | 5 |
| low_light | 6 | 12 |
| mask_and_classroom_clutter | 2 | 2 |
| occlusion | 6 | 10 |
| profile_angle | 5 | 0 |
| small | 6 | 9 |

Baseline: 34/63 failures; main: 50/63 failures. Main unknowns: 21 no detections, 13 blur rejections and 5 estimates outside the supported range. Unknowns count against accuracy. Original portrait profile directions improve (6/6 versus 1/6), while aggregate accuracy does not.

## Twelve recorded main-model failures

Selection is deterministic round-robin across conditions, retaining distinct sample IDs. Variants and adjacent frames remain correlated. [Gallery JSON](gallery.json) includes observations and reasons.

### blur

- 1. [5474326-0000-blur](gallery/01-5474326-0000-blur.jpg): forward → unknown; reason: head_blurry.
- 7. [5474326-0289-blur](gallery/07-5474326-0289-blur.jpg): forward → unknown; reason: head_blurry.

### clean_pose

- 2. [5474326-0000-original](gallery/02-5474326-0000-original.jpg): forward → unknown; reason: no_detection.
- 8. [5474326-0636-original](gallery/08-5474326-0636-original.jpg): forward → unknown; reason: no_detection.

### low_light

- 3. [5474326-0000-low_light](gallery/03-5474326-0000-low_light.jpg): forward → unknown; reason: no_detection.
- 9. [5474326-0289-low_light](gallery/09-5474326-0289-low_light.jpg): forward → unknown; reason: no_detection.

### mask_and_classroom_clutter

- 4. [8363848-0135-original](gallery/04-8363848-0135-original.jpg): right → forward; reason: usable but wrong direction.
- 10. [8363848-0202-original](gallery/10-8363848-0202-original.jpg): right → forward; reason: usable but wrong direction.

### occlusion

- 5. [5474326-0000-occlusion](gallery/05-5474326-0000-occlusion.jpg): forward → unknown; reason: head_pose_outside_supported_range.
- 11. [5474326-0289-occlusion](gallery/11-5474326-0289-occlusion.jpg): forward → unknown; reason: head_pose_outside_supported_range.

### small

- 6. [5474326-0000-small](gallery/06-5474326-0000-small.jpg): forward → unknown; reason: no_detection.
- 12. [5474326-0289-small](gallery/12-5474326-0289-small.jpg): forward → unknown; reason: no_detection.

Image sources: cottonbro studio, Nicola Barts and RDNE Stock project via Pexels. Source links and permissions are in the data card. Selected images are annotated model-evaluation illustrations, with no endorsement implied.

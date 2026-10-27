# CP3 fixed-set data card

Prepared 27 October 2026 before either method was run on these sources. Manifest: [cp3.json](../../../data/annotations/cp3.json). Preparation: [prepare_cp3.py](../../../scripts/prepare_cp3.py). This set is separate from the existing Pointing04 validation and final locked test split.

## Sources, permissions and access

| Pexels ID | Creator | Material | Pinned download |
| --- | --- | --- | --- |
| [5474326](https://www.pexels.com/video/a-man-turning-his-head-sideways-5474326/) | cottonbro studio | Portrait head turns; 2048×1080, 25 FPS | [MP4](https://videos.pexels.com/video-files/5474326/5474326-hd_2048_1080_25fps.mp4) |
| [7924513](https://www.pexels.com/video/bald-man-looking-down-7924513/) | Nicola Barts | Downward portrait; 1080×1920, 240 frames at approximately 23.976 FPS | [MP4](https://videos.pexels.com/video-files/7924513/7924513-hd_1080_1920_24fps.mp4) |
| [8363848](https://www.pexels.com/video/kids-having-a-class-8363848/) | RDNE Stock project | Masked classroom; 1920×1080, 30 FPS | [MP4](https://videos.pexels.com/video-files/8363848/8363848-hd_1920_1080_30fps.mp4) |

Access checked and all three downloads completed. The [Pexels license](https://www.pexels.com/license/) allows free use and modification. Do not imply endorsement or portray identifiable people offensively. Examples describe model outputs and visible pose only, never misconduct. Original videos and full prepared data remain ignored local research files; selected annotated failure examples are included in the report with attribution. Source SHA256 values and URLs are pinned in the manifest and preparation script.

BIWI's official archive returned HTTP 403 and UPNA access could not be verified; neither is relied on. New Pexels 37744763 could not be acquired and is excluded. Downloaded 7171048 was visually inspected but excluded before inference because its head pose was less clear for this label contract. Earlier trial clips 8419341, 6672299 and 7092229 are development material, not part of this set.

## Counts and separation

No local training is performed. This CP3 set is for initial held-out testing only; it must not be used to select settings. Model weights are externally pretrained. All three target people/recordings differ from the project's previously evaluated material by visual/source inspection; identity recognition is not used. Complete upstream pretraining overlap cannot be audited.

| Class | Original frames | Synthetic variants | Total |
| --- | ---: | ---: | ---: |
| forward | 4 | 12 | 16 |
| left | 3 | 12 | 15 |
| right | 5 | 12 | 17 |
| down | 3 | 12 | 15 |
| Total | 15 | 48 | 63 |

There are only **three target subjects and three recordings**, not 63 independent observations. Adjacent frames and transformations are correlated. Report aggregate and original-only metrics; do not infer statistical confidence from the image count.

## Labels and preprocessing

An agent visually assigned ordinal head directions before model inference, using the complete head pose rather than eye position or a video title. Strong portrait profiles are subject-left when the face points image-right, and vice versa. Down labels describe visible downward head tilt. Classroom targets at frames 0/135/202 are labeled forward/right/right. These are not measured angles; borderline down/side definitions are a known uncertainty. A human cross-check is pending and is not claimed.

Select portrait head-turn frames 0/289/636 (forward), 115/173/231 (left), 404/462/520 (right); downward frames 0/95/191. Portraits shrink to 640 pixels wide, preserving aspect ratio. Classroom images use a fixed source crop [870,400,1070,600] around one subject; the crop is an evaluation preparation step, not an automatic full-classroom localization result.

Each of the 12 portrait bases has four deterministic stress variants: brightness ×0.18; Gaussian blur kernel 31, sigma 8; gray occluder covering normalized x=.32–.68/y=.48–.63; and image dimensions reduced by five. Reference labels are inherited from the unmodified frame, since these transforms do not rotate the head. Original images include natural strong angles and masked classroom clutter. Image sizes and exact checksums are recorded per sample. Both methods receive identical prepared pixels, then use their own documented model-specific preprocessing.

The set is a small portrait/classroom stress proxy. It does not establish multi-person detection recall, seat continuity, eye gaze, event precision/recall, or general classroom accuracy. Do not tune on its failures. Use a distinct development set for proposed changes and acquire a new held-out set to measure improvements.

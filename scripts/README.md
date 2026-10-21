# Script entry points

These two command-line placeholders support the initial CP1 feasibility work. Run either with `--help` to read its intended purpose. Running without `--help` reports that the feature is unimplemented and exits unsuccessfully.

| Script | Planned responsibility |
| --- | --- |
| `spike.py` | Load five real images, run a project-relevant operation, and save visible results. |
| `make_contact_sheet.py` | Arrange at least 20 real samples into a labeled grid showing the dataset's variety. |

The contact sheet will show the input data; the spike will show that it can be processed. Neither script currently loads images, creates output, downloads assets, or supplies checkpoint evidence.

```powershell
python scripts/spike.py --help
python scripts/make_contact_sheet.py --help
```

When implementation begins, the spike will handle image loading and result saving while reusing the planned landmark extraction, baseline direction prediction, and annotation behavior in `src/gaze/`. Keep reusable processing in that package. See the [package organization](../README.md#initial-package-organization) for its current responsibilities.

Image prediction, video processing, and evaluation commands are deferred until CP2. The image prototype must accept one input image and save annotated baseline output through shared preprocessing under src/gaze. Its validation measurements do not wait for video integration; the three-face video task carries FPS evidence. Document the actual commands when implemented, without adding empty entry points now. Live-camera support is planned for CP4. Add those entry points when the corresponding work begins; whether video and camera share a command can be decided then. Their removal from the scaffold does not remove the roadmap requirements.

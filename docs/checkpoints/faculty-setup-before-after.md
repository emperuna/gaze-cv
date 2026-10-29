# Faculty setup — before and after

Comparison with the initial integrated review form, including the two sections
shown in the user's screenshots. The user requested a table only.

| Area | Before | After | Practical limit |
| --- | --- | --- | --- |
| Main flow | Upload, manually define regions, inspect technical settings, confirm frame rate, process. | Upload → Suggest seats → review/correct boxes → Confirm seats & process → review results. | Faculty still confirm the layout; suggestions are optional. |
| Seat setup | Every seat had a name plus four percentage inputs in the default view. | Default view shows boxes/names with Add seat, Edit region and Remove. | A missed head can be added manually; boxes remain fixed afterward. |
| Automatic suggestions | No automatic setup aid. | Repeated detections from up to five sampled frames propose nonoverlapping fixed regions. | Not person tracking or guaranteed coverage; missed/false suggestions need correction. |
| Existing edits | All configuration was manual. | Suggestion results preserve current boxes until Replace current seats is explicitly selected. | Keep my seats retains manual corrections. |
| Visual adjustment | Draw new regions; exact changes mainly used coordinates. | Edit region redraws an existing box while preserving its name and seat count. | Camera/layout changes require confirming regions again. |
| Exact coordinates | Large percentage form shown for every seat. | Collapsed Advanced seat editing; numeric controls remain available. | Keyboard-accessible exact setup is retained. |
| Analysis and movement settings | Model, mirror checkbox and five rule inputs were shown by default. | Collapsed Advanced settings with the same optional controls. | Defaults are experimental, not misconduct indicators. |
| Rule explanation | Users had to interpret duration, dwell and window fields. | Plain-language summary explains the currently active duration/repetition rules. | Missing observations still reset continuity. |
| Video timing | Faculty had to assert constant frame rate via checkbox. | Decoder timestamps are checked automatically during setup and again during processing. | Up to 240 FPS; recorded 1.1–2 ms quantization tolerance. Unsupported timing needs conversion. |
| Failed suggestions | No dedicated suggestion fallback. | No-head results explain manual setup without inventing seats. | Automatic seat accuracy remains unvalidated on classrooms. |
| Stored results | Saved sessions, event seeking and downloads. | Existing review features remain; timing diagnostics are also stored. | Historical sessions retain their original metadata and settings. |
| Faculty/CCTV context | Technical prototype configuration was prominent. | Faculty-facing defaults; fixed-camera exports can use video upload. | Direct CCTV/RTSP/ONVIF connection, camera movement and identity matching are not implemented. |

Verification: [saved-review evidence](../superpowers/specs/2026-10-29-saved-review-verification.md).
No implementation percentage or checkpoint acceptance is inferred from this table.

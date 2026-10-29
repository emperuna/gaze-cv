# Saved-video review — before and after

Before: the website at `5bac2b3`, with the separate Python seat/event workflow.
After: the local `feat/saved-video-review` implementation. No screenshots are
included, as requested. Technical checks are linked below; 80% completion is not claimed.

| Area | Before implementation | After implementation | Remaining boundary |
| --- | --- | --- | --- |
| Video workflow | Website ran automatic directions; seat/history/events required separate commands. | Saved video offers Seats & movement review and preserves Directions only. | Browser review accepts CFR MP4/WebM; generic formats remain in Directions only. |
| Seat setup | Seat regions were supplied through JSON/CLI. | Suggest fixed regions from sampled frames, review/rename/redraw/remove them, or add missed seats. Exact coordinates are under Advanced seat editing. | Suggestions require faculty confirmation; seats are positions, not identities; real consistency needs labeled footage. |
| Movement configuration | Duration/repetition/gap settings were CLI arguments. | Active default rules are explained in plain language; Advanced settings retains customization and saved provenance. | Defaults are experimental, not classroom-validated thresholds. |
| Pipeline integration | Seat/history/event modules existed but web uploads did not call them. | Web review reuses the shared image/video, seat-association, history and movement modules. | Automatic head labels remain camera-relative; no new neutral calibration is claimed. |
| Playback | Annotated AVI was downloadable; browser showed the original input. | Browser playback has synchronized overlays/notices; setup and processing inspect decoded timestamp cadence automatically. | Unsupported timing/codecs require conversion; quantization tolerance is recorded. |
| Event review | Events were separate JSON records. | Filterable event table shows source start/end and trigger time; clicking seeks to the source moment. | Real movement-event precision/recall is unmeasured. |
| Histories and gaps | Histories existed only in configured-run exports. | Per-seat intervals can be inspected/searched by seat and selected to seek; missing/ambiguous states remain explicit. | Gaps do not establish what happened while unobserved. |
| Saved sessions | Upload results had run directories/downloads but no integrated seat-review library. | Completed sessions appear in a local list and reopen by saved URL after reload without inference. | Latest 50 are listed; older bookmarked sessions remain addressable. No cloud/database/automatic cleanup. |
| Exports and provenance | Low-level raw exports existed in the CLI workflow. | UI exposes settings, events, histories, observations, summary, compact review JSON and annotated AVI; records retain source hash and timing. | Stored source and records need an agreed manual access/retention policy. |
| Stop and failure handling | Upload processing had a timeout; no dedicated seat-review cancellation UI. | Stop/navigation cancels review processing; completed manifests are not published for cancelled/failed work. Slot is held until child exit. | Partial ignored output folders can remain and require manual cleanup. |
| Input and output bounds | Generic upload had a 64 MB limit. | Review adds seat/settings validation, automatic timestamp checks, decoded media limits, output budget and contained media-range access. | These are operational bounds, not performance guarantees. |
| Verification | Camera/image tests and historical saved-video tests existed. | New rule/export/API/browser tests cover upload→seat setup→process→seek→reopen, gaps, cancellation and artifact access. | Human three-seat/laptop/classroom checks and held-out evaluation remain. |
| CP4 readiness | Requirements and remaining work were spread across backlog/checkpoint files. | [CP4 checklist](cp4-checklist.md) maps all seven supplied hand-in items to evidence or pending work. | Report/slides, held-out results, representative laptop measurements, backup recording and actual hand-in tag are still needed. |

[Verification record](../superpowers/specs/2026-10-29-saved-review-verification.md)
· [Actual technical test cases](cp4-test-cases.md).

See the [faculty setup before/after table](faculty-setup-before-after.md) for the
subsequent simplification of the initially exposed coordinate/settings forms.

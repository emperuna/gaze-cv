# Final hand-in verification

19 November 2026 · Windows, fresh F: clone of application source `5698166` with the final Next.js patch applied. Initial setup used Python 3.12.10 and Node 24.11.1. The measured CP4 ASUS Ryzen 5 7520U laptop results remain the source of the throughput figures in the report.

| Check | Result |
| --- | --- |
| Python environment and model assets | Pinned base and head requirements installed into a new virtual environment. Main face and optional learned models matched their published checksums. |
| Pointing04 preparation | The upstream request timed out. Using the existing pinned archive with `prepare_data.py --offline` verified 240 validation and 120 test images. |
| Results-table command | Both methods reproduced all reported metrics, including accuracy, macro F1, coverage and confusion matrices. Baseline 99/120; head 92/120. The test set was previously exposed in CP4. |
| Python tests | 190 passed. |
| Frontend | 138 tests passed. Production build succeeded after the Next.js 16.4.6 dependency update. npm audit reported zero vulnerabilities on this run. The build still reports Turbopack file-tracing warnings for local camera session storage. |
| Real sample input | The bundled Pointing04 example processed through the CPU baseline CLI. The bundled 120-frame video produced a four-seat review and one movement record with the reference settings. |
| Production saved review | The local application processed the included clip using the reference four-seat Baseline configuration. The browser reopened the 120-frame session and showed its one movement record. The real PDF export was checked for the seat-3 observation. |
| Hand-in files | The report has seven pages and a 171-word abstract. The deck has twelve pages. The captioned saved-review backup matches the verified H.264 recording, 198.16 seconds. |

The fixed [reproduction protocol](reproduction-protocol.json) records the final image evaluator and both model configurations. It was created before the repeat scoring and uses the existing unchanged selection and settings from the original experiment. The CP4 recording reflects the older interface. The current website links to saved review from the camera workspace.

The team still needs to rehearse on the exact laptop with its charger, projector adapter, prepared weights and inputs. Verify the teacher-input path and fallback in the lab. Physical-camera verification, agreement on classroom data handling, labeled classroom alert accuracy, each member's live participation and actual course hand-in remain team responsibilities. GitHub Issues #31, #32, #33 and #37 still carry the academic acceptance checks. Their status and the Project board were not changed.

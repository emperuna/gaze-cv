# Independent fresh-folder verification

On **22 October 2026**, a separate agent verified the CPU image prototype in a new source-copy folder with its own virtual environment. The copied inputs omitted the existing virtual environment, downloaded models, raw datasets, generated outputs, and Git metadata. Model and dataset assets were independently retrieved from the documented source URLs and passed their pinned checksums. This establishes technical source-folder reproduction; **it is not a fresh Git clone, a second human member's verification, or evidence of individual member contributions**.

The [verification record](../../outputs/evidence/reproduction.json) stores the exact copied source-file hashes, dependency-file hash, model/data hashes, command exit codes, and output hashes. It describes the working source snapshot tested at that time; later documentation or code changes need their own appropriate checks. Local full logs and generated outputs remain under ignored `.work/verification/` on drive F.

| Check | Actual result |
| --- | --- |
| Environment | Windows 10 build 19045, Python 3.12.10, CPU execution; independent `.venv`. |
| Install | `pip install -r requirements.txt` completed in the new environment. Runtime/transitive pins and isolated build requirement used. |
| Dependency integrity | `pip check` passed with no broken requirements. |
| Model acquisition | Independently downloaded 3,758,596 bytes; SHA256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. |
| Data acquisition | Independently downloaded 28,512,828-byte Pointing04 archive; pinned SHA256 verified; recreated 240 validation and 120 locked test records. No test predictions were made. |
| Image baseline | Saved an annotated JPEG and JSON for checked-in `person01145+0-15.jpg`; one face, forward. |
| Pose method | Saved a separate annotated JPEG and JSON for the same image; one face, forward. This is a smoke result, not aggregate accuracy. |
| Contact sheet | Saved twenty source-labeled validation examples with attribution. |
| Application tests | All 70 tests present in the verified source snapshot passed. These include model-free geometry, preprocessing, data, seats, histories, events, and video mechanics. |
| Write locations | New folder, virtual environment, downloads, temporary files, pip cache, matplotlib cache, XDG cache, and Python bytecode cache were configured on drive F. No global packages or OS settings were changed. |

The copied source had final mirror/overwrite fixes refreshed after initial environment setup; prototypes and the complete suite were rerun against the refreshed file hashes. A final source refresh added the video/event history-gap guard and evaluation CLI flags; the complete suite and both CLI help checks passed again in the same independent environment. Existing dependencies or downloaded model/data from the original workspace were never copied into this environment. Reusing the new environment for that final source refresh is recorded explicitly in the local logs.

## Commands checked

From the independent source-copy root, after configuring all temporary/cache locations under drive F:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe scripts/download_model.py
.\.venv\Scripts\python.exe scripts/prepare_data.py
.\.venv\Scripts\python.exe scripts/make_contact_sheet.py
.\.venv\Scripts\python.exe scripts/predict.py --input data/samples/pointing04/person01145+0-15.jpg --output outputs/evidence/final-baseline.jpg
.\.venv\Scripts\python.exe scripts/predict.py --input data/samples/pointing04/person01145+0-15.jpg --method pose --output outputs/evidence/final-pose.jpg
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The actual setup used the installed Python interpreter to create the new environment and set process-local `TEMP`, `TMP`, `PIP_CACHE_DIR`, `MPLCONFIGDIR`, `XDG_CACHE_HOME`, `PYTHONPYCACHEPREFIX`, and `PYTHONNOUSERSITE` before running commands. It removed inherited `PYTHONPATH` so imports came from the newly installed editable package. The archive download took approximately 101 seconds on this run; a fresh environment can need network access and source availability.

## Remaining checkpoint verification

A collaborator still needs to follow the reviewed README from an actual fresh Git clone on the agreed laptop CPU, record their own commands/output and hardware, and explain their own contribution during class. This agent-run smoke check does not substitute for that personal requirement. The full video measurements were performed separately in the original working environment and are documented in [the video evidence](../evaluation/video.md); their performance is not attributed to this fresh-folder run. Checkpoint hand-in/tagging, instructor acceptance, and held-out aggregate evaluation are separate steps.

## Post-review source refresh

The reviewed source revision `827679e` was copied into the same independent environment on 22 October 2026. The existing independently installed dependencies and separately acquired model/data were retained. All **96 application tests**, `pip check`, both real model image methods, and the twenty-image contact sheet passed. The [new verification record](../../outputs/evidence/review-verification.json) records source hashes, command results, and the source revision. The original 70-test record remains historical evidence of its earlier source snapshot. This refresh is still not a fresh Git clone or another human member's verification.


## Actual fresh-clone five-image spike

On **22 October 2026**, the coding agent assisting @emperuna completed the separate #8 verification from an actual Git clone of main at bf6002fe4b3a47fe9c8abb649543065d91093e5e into a previously unused folder on F:. A new Python 3.12.10 environment installed the pinned requirements, passed dependency checks, downloaded the model again and verified its checksum. The documented spike command saved five new annotated validation outputs.

The [fresh-clone evidence package](../../outputs/evidence/spike-fresh-clone/README.md) contains the five PNGs, a gallery screenshot, raw report, full command logs, runtime provenance and file checksums. All five inputs produced a face and landmarks; one direction is incorrect and one is unknown. These failures remain visible. No held-out inference or new aggregate validation scoring was performed.

**#8's feasibility execution and saved-output/screenshot criteria passed.** This desktop agent run does not complete #5 or #41, another human member's intended-laptop reproduction, individual contribution explanations, or the academic hand-in. The earlier source-copy and 96-test refresh records above remain historical evidence; those tests were not rerun as part of this five-image run.

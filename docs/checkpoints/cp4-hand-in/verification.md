# CP4 verification record

**12 November 2026, Windows demo laptop.** All environments, downloads and caches are project-local in the user-authorized C: checkout. No global packages, drivers or Windows settings were changed.

| Check | Actual result |
| --- | --- |
| Pinned Python 3.12.10 install, both requirements files | Passed; local `.venv` |
| Pointing04 archive and selected input checksums | Passed; 240 development, 120 held-out images |
| Face/head/pose model checksum downloads | Passed |
| `python -m unittest discover -s tests -v` | 164 passed |
| `python .github/automation.py check` | Passed |
| `python -m unittest discover -s .github/tests -v` | 16 passed with access for project-local temporary Git fixtures |
| `npm test` | 26 passed |
| `npm run build` | Production build passed |
| `npm run typecheck` | Passed |
| `src/evaluate.py freeze` then `run` | Both methods scored all 120 held-out images |
| Repeated integrated review benchmark | Three runs/method, 120 frames/run; timing scopes recorded |
| Real browser workflow | 120 frames, 4 configured seats; no page JavaScript errors |
| Browser range access and reopening | 206 with 32 requested bytes; saved session restored |
| Responsive browser | 390px without horizontal overflow |

The initial sandboxed production build stalled; it passed after rerunning with worker filesystem access. Initial automation tests could not push to their temporary local bare-repository fixtures in the sandbox; all 16 passed with scoped access. These were environment restrictions, not ignored test failures.

Raw local logs: `.work/cp4-install.log`, `.work/cp4-tests-final.log`, `.work/cp4-frontend-tests.log`, `.work/cp4-automation-tests.log`, `.work/cp4-build.log`, `.work/cp4-typecheck.log` and `.work/cp4-benchmark.log`. These ignored logs are supporting local records; the committed JSON reports and source-linked test cases provide portable evidence.

GitHub Issues 26/28/29/30 were read live and were open/unassigned. The authenticated account has repository push permission. Project queries were rejected for missing `read:project` scope; no live Project status or update is claimed. Task dependencies and human acceptance remain visible in TASK.md; no blocked task is marked Done here.

Recording duration, final link/hash checks and publication status are recorded in the package index after final verification. Classroom event accuracy, writing false-alert rates, independent member reproduction and instructor acceptance remain unverified.

Final package checks passed: local inline/reference links, 16 fresh test-case
rows, 12 Markdown slide sections and 12 PPTX slides, exact frozen implementation
hashes, three 120-frame benchmark runs per method and the fully decoded recording.

## Final artifact checks

The backup H.264 MP4 decoded all 4954 frames at 25 FPS, duration **198.16 seconds** (3 minutes 18 seconds), 1440 × 1000. Representative image/setup/review/seek/reopen frames were visually inspected. [Recording verification](../../../outputs/evidence/cp4/recording-verification.json).

All 12 slide previews were inspected, including rerenders after the results/test updates. The PPTX finalizer passed package integrity, layout/heading fit, Arial font policy, four editable native tables and first-party reimport checks, with no findings. This does not certify native PowerPoint playback; the deck remains a draft.

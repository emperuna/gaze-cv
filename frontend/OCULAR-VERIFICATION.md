# Ocular interface refresh

Logo revision: the user-selected ring-and-dot mark with a butter-yellow accent
replaces the aperture monogram in the shared brand component and page icons.
The generated transparent asset is `public/brand/ocular-logo-yellow.png`; the
original artwork is retained. The final prompt is recorded in the asset notes.

Logo revision checks: transparent alpha was confirmed in the 1254 × 1254 PNG.
HTTP checks against the existing development server at `127.0.0.1:3000` passed:
both `/` and `/analyze` use the yellow-logo path in branding and icons, and the
new asset is served successfully. No browser visual check was performed for
this asset-reference-only revision. The existing development server was retained.

Scope: user-requested rebrand and Samfund-inspired interface, based on the latest
remote `main` (`ce39c08`) on `feat/ocular-rebrand`. The working tree was clean
before work. The old remote landing-page branch was no longer available, so local
`main` was fast-forwarded from `origin/main` before the new branch was created.

Implemented: Ocular wordmark and generated O monogram, metadata and favicon,
centered hero, pastel feature cards, workflow, generated classroom imagery,
interactive fictional observations, FAQ, responsive layouts, and matching styles
for the image, live camera, and saved-video review workspaces. Source links and
backend/package identifiers retain the existing repository names. The frontend
npm package is now `ocular-website`; dependencies are unchanged.

Landing input links support `?mode=image`, `?mode=video`, and `?mode=camera`.
An existing `?session=` still opens video review with precedence over `mode`.
Opening Camera mode does not automatically start capture or request permission.

## Checks

- `npm run build`: passed, including Next.js TypeScript and static rendering.
- `npm run typecheck`: passed.
- `npm test`: all 26 existing regression tests passed.
- `node .work/design/verify-ocular.mjs`: passed production HTTP checks for homepage
  metadata and heading, anchors, four FAQ items, illustration disclosures,
  accessibility markup, 12 linked static assets, all three workspace URLs, local
  setup-required readiness, expected 404, and local documentation links.
- `git diff --check`: passed. No conflict markers found in changed source/docs.

Windows sandboxing initially rejected the test/build subprocesses with `EPERM`.
Both checks passed when rerun with the requested execution permission. All
application commands use the existing project-local cache/temp wrapper.

## Unperformed checks

Visual and browser-interaction verification is blocked: the in-app browser host
was unavailable, and automatic Computer Use review stopped native Chrome because
it could not establish the current URL confidently enough to enforce policy.
No further UI automation was attempted. See [design QA](../design-qa.md).
HTTP checks do not establish interaction or visual correctness. Check desktop and
390px/320px mobile layouts, navigation, mode selection, the timestamp example,
FAQ, keyboard focus, reduced motion, image crops, contrast, and browser console.

Python tests and actual model inference were not run. No Python processing code
changed; this checkout has no project `.venv` or downloaded models. The workspace
continues to report missing setup instead of simulating inference results.

The user authorized this C: checkout as the exception to AGENTS.md's F:-only
session rule. No GitHub Issue or Project state was changed. No commit, push,
publication, or checkpoint-completion claim is part of this work.

## Sample-output card revision

The user requested a generated image of sample website output instead of a
decorative portrait. The card now shows a compact Ocular output panel containing
an AI-generated wide classroom preview, with four seat regions and illustrative
head-detection boxes. The room and multiple seats are the focus. Sample counts
and time are fictional and the card states “AI-generated mockup · not model
output.” No inference was rerun. Other sections remain as implemented above.

Revision checks passed: production build (including TypeScript), production HTTP
checks, generated-image delivery, mockup disclosures, removal of portrait/recorded
sample references from the homepage, local asset/documentation links, and
`git diff --check`. The 1672 × 941 generated image was visually inspected on
generation; on-page browser visual verification remains unperformed.

## Reference-based hero portrait revision

Scope: user's supplied education poster reference, second hero card only.
The former sample-output panel is replaced by an overhead portrait of one adult
student writing at a wooden desk. The built-in ImageGen tool generated the asset;
the image was inspected and encoded as 1024 x 1536 WebP (181,952 bytes).
The responsive card uses full-card cover framing, a heading overlay, a link to
the workspace, descriptive alt text, and a visible illustration disclosure.
The generation prompt and asset provenance are in [ASSETS.md](public/ASSETS.md).
The user explicitly confirmed the current C: checkout for this request.

Checks passed: `NEXT_DIST_DIR=.next-verify node scripts/run.mjs build --webpack`,
`node scripts/run.mjs typecheck`, all 26 existing tests via
`node scripts/run.mjs test`, and `git diff --check`. Windows blocked build/test
subprocesses in the sandbox with `EPERM`; both passed with execution permission.
`node .work/design/verify-portrait.mjs` passed production HTTP checks for the
portrait card, workspace link, disclosure, removed mock output, all three linked
image/brand assets, WebP dimensions/content type/size, and asset-note links.

Browser visual verification remains unperformed: the browser access host was
unavailable in this session. Desktop/mobile crop, wrapping, and keyboard focus
still need rendered checks. No Python processing changed; Python tests and
model inference were not rerun, and this checkout has no project interpreter.
No Issue/Project update, commit, push, or publication was made.

## Image label removal

At the user's request, removed visible AI-generated labels from all three image
placements (hero portrait, session example, and care section) and their unused
CSS. Alt text still describes the illustrations, and the session retains its
fictional-observation wording. Image provenance remains in `public/ASSETS.md`.
`node scripts/run.mjs typecheck` and `git diff --check` passed; a source search
found no remaining AI-generated labels or disclosure CSS in `frontend/src`.
No Python or runtime processing changed; browser verification was not rerun.

## Hydration error investigation

The development log identifies a version mismatch in `SessionPreview`: server
HTML has the label removed while the browser rendered the older alt text and
`image-disclosure` span. HTTP inspection of the running development server at
`127.0.0.1:3000` confirms both current HTML and its served `src_*.js` client chunk
contain the updated alt text and neither contains the old label or overlay.
No nondeterministic initial rendering was found in this component. No application
code workaround or hydration-warning suppression was added. The affected tab
needs a full reload to replace its old client code. Native browser inspection
timed out awaiting tool approval, so browser hydration recovery remains unverified.

## Hero Crosshair integration

Scope: user's supplied React Bits JavaScript + CSS component, confined to the
hero heading, feature cards, and principles. `HeroCrosshair` owns the container
ref; the rest of the page remains server-rendered content. The canvas begins
empty on both server and client, with browser APIs accessed only after mount.
Muted charcoal `#626b76`, 0.65 opacity, 1px lines, 0.35 smoothing, faded edges,
coordinates, target locking, and click pulses match the existing palette.
The native cursor stays visible and the canvas cannot intercept clicks.

The supplied component was adapted to external CSS, scoped stacking, live
reduced-motion changes, clearing on blur/scroll outside the hero, and settling
target height changes. Event listeners, ResizeObserver, and animation frames
are released on unmount. No package/dependency change was needed.

Passed: TypeScript; isolated production build via
`NEXT_DIST_DIR=.next-verify node scripts/run.mjs build --webpack`; homepage HTTP
200 with exactly one hero canvas; `git diff --check`.
`node .work/design/verify-crosshair.mjs` passed deterministic SSR, initial blank
canvas, container coordinates, target locking/resizing, click pulses, reduced
motion, scroll/blur exit, idle settling, and unmount cleanup with simulated
canvas/events. Build subprocesses required execution permission after sandbox
`EPERM`. These checks do not establish browser-rendered appearance or interaction.
Browser visual checks remain unavailable following the earlier approval timeout.
Python tests/inference were not rerun: no Python behavior changed and this
checkout has no project interpreter. No GitHub status change, commit, or push.

## Hero TargetCursor replacement

Replaced the previous Crosshair integration at the user's request with the
supplied React Bits JavaScript + CSS TargetCursor. `HeroTargetCursor` provides
the hero-only container. All six feature articles and all four principle labels
explicitly use `cursor-target`, including static containers; hero links also
lock the reticle. No button roles or keyboard tab stops were added to static
content. The overlay ignores pointer events, preserves existing links, and
restores the normal cursor outside the hero. No dependency changes were needed.

Kept the supplied spin, snap, parallax, radius matching, and press behavior.
Adaptations add typed optional props for the TypeScript wrapper, stable spring
substeps for short hover durations/delayed frames, live reduced-motion handling,
and scope rechecking on scroll/resize. Touch devices keep native behavior.
Reduced motion disables spin, leaning, spring movement, and press animation.
Listeners, injected cursor CSS, scope attributes, and frames clean up on unmount.

Passed: `NEXT_DIST_DIR=.next-verify node scripts/run.mjs build --webpack`
(subprocess access required after sandbox `EPERM`),
`node scripts/run.mjs typecheck`, homepage HTTP 200 with six card targets,
four label targets and no old canvas, and `git diff --check`.
`node .work/design/verify-target-cursor.mjs` passed deterministic empty SSR,
descendant hover, target geometry/resizing, short-duration spring stability,
press behavior, reduced motion, touch fallback, scroll/blur cursor restoration,
idle settling, and cleanup with a simulated DOM/event loop.

Rendered appearance remains unverified: the browser access host was unavailable,
and native Computer Use stopped because it could not verify the current browser
URL confidently enough to enforce its policy. Python tests/model runs were not
performed: processing is unchanged, and this checkout has no project interpreter.
No Issue/Project claim, commit, push, or publication was made.

### Hero kicker and clickable cursor follow-up

Added `cursor-target` to the existing “A new perspective on classroom review”
kicker. The injected cursor stylesheet now restores `cursor: pointer` on hero
links, enabled buttons, and available button-role controls, including their
nested icons/text. The reticle still locks onto these controls; static targets
retain the custom cursor without a pointing hand. Outside the hero, native
cursor behavior remains unchanged.

Passed: `node scripts/run.mjs typecheck`, the existing
`node .work/design/verify-target-cursor.mjs` simulation, `git diff --check`, and
homepage HTTP 200 confirming the kicker target plus all six card and four
principle targets. Browser appearance was not rechecked following the recorded
Computer Use URL-verification blocker. No Python processing changed; Python
tests, model inference, and the production build were not rerun for this small
markup/CSS-rule adjustment. No commit, push, or GitHub status change was made.

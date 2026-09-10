# Status

## Current milestone: Production basmalah timing diagnostics

Complete:

- Added a production-safe basmalah diagnostic mode gated only by `?debugBasmalah=1`. It exposes **Copy basmalah diagnostics** only when the current editable captions contain an acoustic `basmalah-prelude`; normal production use has no new control or console logging.
- The copied JSON intentionally contains only the canonical basmalah, logical token indexes, optional-prelude and resulting caption word timings, display/presentation mappings, highlight mode, counts, final-word stage flags, and representative shared highlight evaluations. It excludes media, URLs, transcripts, account/auth/billing data, storage data, and filesystem details.
- Captured the raw FastConformer optional-prelude timing summary in memory for the current recognition run, then compare it to the exact `CaptionSegment` used by preview/export. No recognition decision, timing, split, layout, or highlight behavior changed.
- Added focused coverage for the query gate, four-word fixture, privacy boundary, fourth-word loss localization, shared presentation evaluation, and non-mutating diagnostic construction.

Verification: `npm run regression:quran` passes production invariant probes; its optional real Quran alignment benchmark remains unavailable/failing in this workspace, and its generated evidence was not retained. `npm test` (343 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and optional TikTok configuration reminder.

## Current milestone: End timeline scrubbing on pointer release

Complete:

- Replaced the playhead's stale boolean drag flag with an explicit primary-pointer scrub session that is bound to its initiating pointer ID. Timeline movement now requires both that session and the held primary button; ordinary hover has no seek path.
- Centralized timeline interaction cleanup for captured pointer release, pointer cancellation, lost pointer capture, window blur, and editor unmount. Cleanup releases capture when still held, clears caption/media-edit interaction state, removes the scrub session, and leaves the media clock as the normal playhead authority.
- Kept one-shot empty-background pointerdown seeking while preventing caption blocks, media blocks, trim handles, and the waveform from bubbling into background seeking. Existing pointer capture retains outside-the-timeline dragging and bounds mapping.
- Added focused pointer-session and component-wiring regression coverage for hover, pointer identity, defensive missing-button cleanup, all termination paths, independent repeated drags, click-to-seek isolation, paused behavior, playback following, and listener cleanup.

Verification: `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace and its generated report was not retained. `npm test` (338 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the optional TikTok posting credential reminder.

## Current milestone: Make composed preview controls discoverable

Complete:

- Moved the Quran detection result, confidence, and other existing status messages from the absolute notice overlay into the editor flow between the composed preview controls and timeline.
- Refined the single always-visible composed-preview control bar with familiar play/pause, mute/unmute, and enter/exit fullscreen icons while retaining elapsed/total time, seek, volume, and composed-only fullscreen behavior.
- Kept fullscreen capability-gated: unsupported browsers display no disabled or duplicate fullscreen affordance.

Verification: targeted fullscreen/player tests (11 passing), `npm test` (333 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace, and its generated report was not retained. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the optional TikTok posting credential reminder.

## Current milestone: Fix fullscreen UX regression

Complete:

- Replaced browser-native video/audio controls with one compact Quran AutoCaption preview control bar: play/pause, elapsed/total time, seek, mute/volume, and fullscreen. This removes Chrome's misleading disabled native fullscreen glyph instead of trying to style browser shadow DOM.
- The only fullscreen control is conditionally rendered after the mounted composed-preview wrapper confirms standard or WebKit container fullscreen support. It uses the normal lower-right player position, exact Enter/Exit fullscreen labels, and is omitted on unsupported browsers.
- The control bar is inside the composed fullscreen wrapper, so its Enter/Exit button, video or audio visual canvas, captions, translations, transliteration, word highlighting, basmalah, and verse ornament all remain in the same fullscreen subtree. Playback and seeking retain the existing trim-aware media-clock behavior.
- Preserved neutral letterboxing and centered 9:16, 16:9, and 1:1 framing while reserving room for the product controls in fullscreen.

Verification: `npm test` (332 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace and its generated report was not retained. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the configuration reminder for optional TikTok posting credentials.

## Current milestone: Highlight final detected basmalah word

Complete:

- Corrected the shared read-so-far predicate to use an authoritative word onset. A word's acoustic end remains required only for current-word mode, while all caption segments remain half-open.
- Added a realistic Uthmani basmalah regression fixture whose final forced-aligned word ends exactly at the prelude segment end. It verifies every canonical word is retained, the final word is unhighlighted before its real start, becomes read at that start, remains read through the segment, and clears at the exact half-open end.
- Preserved the numberless `basmalah-prelude` representation (`verseKeys: []`), canonical Quran text, ordinary ayah final-word highlighting, and ayah-end ornaments. Preview, composed fullscreen preview, and export all use this same presentation path.

Verification: `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace and its generated report was not retained. `npm test` (330 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the configuration reminder for optional TikTok posting credentials.

## Current milestone: Restore fullscreen control availability

Complete:

- Restored fullscreen capability detection from the mounted composed-preview wrapper, rather than from raw media. The client-safe callback-ref lifecycle starts disabled during SSR, then enables the control as soon as the wrapper mounts in a browser that supports it.
- Standard `requestFullscreen` and practical WebKit container fallbacks are supported; an explicitly disabled browser capability or missing wrapper remains correctly disabled. The raw video/audio element is still never the fullscreen target.
- Preserved the composed caption subtree, canvas centering, audio-only preview, fullscreen-change state handling, and native video fullscreen suppression. A rejected request logs a development diagnostic, shows a small retry message, and leaves the control usable.
- Added focused coverage for standard/WebKit/unsupported capability detection, initial null-ref recovery, composed-only targeting, rejection retryability, and existing fullscreen caption invariants.

Verification: `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace and its generated report was not retained. `npm test` (330 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the configuration reminder for optional TikTok posting credentials.

## Current milestone: Highlight detected basmalah word by word

Complete:

- Preserved the explicit numberless `basmalah-prelude` model (`verseKeys: []`) while carrying complete FastConformer forced-alignment boundaries for its four canonical display words.
- Retained the safe fallback: partial, malformed, or unavailable prelude word alignment creates the detected prelude without word highlighting and never fabricates timings.
- Routed the existing shared word-presentation model through the same preview, fullscreen, and export segment snapshot; read-so-far remains the default Electric Lime highlight behavior and no basmalah-specific renderer or style setting was added.
- Added focused forced-alignment, canonical-target ownership, read-so-far, numberless-prelude, fallback, and export-snapshot regression coverage while preserving ordinary ayah highlights and end ornaments.

Verification: `npm run regression:quran` passes its production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace and its generated report was not retained. `npm test` (326 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning and the configuration reminder for optional TikTok posting credentials.

## Current milestone: Preserve captions in fullscreen preview

Complete:

- Diagnosed the caption loss as browser-native fullscreen acting on the raw video element while the authoritative Quran caption layer is its sibling in the preview canvas.
- Added a dedicated fullscreen action that requests fullscreen on a wrapper around the existing composed preview. The existing video/audio element, caption renderer, Arabic/translation/transliteration layers, word highlights, verse ornament, and basmalah all retain their single rendering path and media clock.
- Added fullscreen-change state cleanup, legacy WebKit container support, native-control fullscreen suppression where `controlsList` is supported, and double-click routing to the composed-preview action. The fullscreen canvas centers the existing 9:16, 16:9, or 1:1 composition with neutral letterboxing; audio-only projects use the same canvas.
- Added focused mocked Fullscreen API coverage for target/exit state, caption-subtree and no-duplicate-renderer structure, caption content/word highlighting, native-control handling, all formats, and audio-only validity.

Verification: `npm test` (324 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes production invariant probes; its optional local real Quran alignment benchmark remains unavailable/failing in this workspace, and its generated evidence was not retained because no recognition code changed. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning.

## Current milestone: Restore export preflight flow

Complete:

- Fixed the warning-override loop: the initial Export action now captures one server-authorized, immutable local-render request, and **Export anyway** consumes that request directly rather than authorizing and re-running preflight.
- Preserved the authorized quality, watermark decision, source file, format, caption snapshot, trim, playback rate, and active asset through warning confirmation. The consumed request and the existing export coordinator prevent duplicate renderer starts.
- Grouped repeated word-highlighting, missing-translation, and translation-review warnings into concise caption-count findings while retaining all affected segment IDs and the existing first-caption Review action. Blocking preflight findings remain non-overridable.
- Added focused coverage for grouped warnings, every affected caption reference, blocking/ready override rejection, single-use override execution, authorized snapshot preservation, renderer-facing error copy, and existing entitlement/quality tests.

Verification: `npm test` (320 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes production invariant probes; its optional real Quran alignment benchmark remains unavailable/failing in this workspace and no recognition code or report was retained from this milestone. The build retains the existing non-fatal VAD/ONNX Runtime dynamic-require warning.

## Current milestone: Final pre-live production hardening

Complete:

- Restored live Stripe Checkout after the sandbox-to-live switch by mode-tagging `billing_customers` mappings. Existing mappings are explicitly sandbox; Checkout reuses a Customer only when it matches the configured key mode, otherwise Stripe creates the live Customer through the normal idempotent flow.
- Added secret-safe Checkout failure diagnostics (Stripe error type/code, status, request ID, billing mode, and mapping presence only), plus regression coverage for cross-mode customer rejection, same-mode reuse, live Price validation, entitlement safety, and log redaction.
- Added authenticated `/account` settings with identity, effective plan, available project usage, Stripe Customer Portal, sign-out, and an explicit `DELETE` confirmation flow.
- Added server-only account deletion ordered for recovery: cancel nonterminal Stripe subscriptions, persist a minimal Stripe-customer webhook tombstone, remove private media through Supabase Storage API, remove application data, then delete Supabase Auth last. Failures leave the account intact for a safe retry.
- Added `/privacy`, `/terms`, a production-safe route error boundary, a minimal 404 page, and `/api/health` readiness booleans. Legal pages identify Quran AutoCaption as operated by Mohammad Othman and provide the public privacy, Terms, and support contact email.
- Hardened Stripe environment separation with `STRIPE_BILLING_ENV`, Netlify/Vercel preview and local live-key rejection, and a server-side Price `livemode` check before Checkout. Stripe remains sandbox/test mode.
- Added `docs/LAUNCH_QA.md`, account-deletion policy/reset/live-switch documentation, monitoring handoff guidance, and the current Transformers.js → Sharp dependency/reachability assessment.

Verification: `npm test` (313 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the pre-existing non-fatal VAD/ONNX Runtime dynamic-require warning. Build configuration correctly reports that deployed billing needs `STRIPE_BILLING_ENV`; TikTok remains optional and configuration-gated. Live hosted/browser validation and applying the new Supabase migration remain manual launch steps.

## Current milestone: Netlify Supabase Google session persistence

Complete:

- Audited the deployed SSR flow: browser OAuth uses Supabase's cookie-backed PKCE client, `/auth/callback` exchanges the code on its redirect response, and `proxy.ts` refreshes cookie sessions. Safe continuation remains `/editor` for Account, with existing export/save one-time continuations restored from browser session storage.
- Updated both server adapters to the current `@supabase/ssr` `getAll`/`setAll(cookies, headers)` contract. Cookie writes and the library's no-store cache headers now attach to the same response that Next.js returns; the proxy also recreates its pass-through response after updating request cookies.
- Made the shared browser/server cookie policy explicit: HTTPS production cookies are Secure, SameSite=Lax, Path=/, browser-readable for the SSR client, and host-only (no Domain override). Supabase retains its managed session lifetime.
- Added targeted regression coverage for shared cookie policy, PKCE code exchange, response cookie persistence, cache headers, and the proxy response handoff.
- A live header probe on 2026-09-10 established that the currently deployed canonical callback is stale: `quran-autocaption.netlify.app/auth/callback?next=/editor` returns `307 Location: https://quran-video.netlify.app/editor?next=%2Feditor`. This old-host redirect is outside the current source and proves the hosted build/config has not yet adopted the canonical origin. Because Supabase session cookies are intentionally host-only, cookies written on the old host cannot persist on the canonical host.

Verification: focused auth/production tests and TypeScript checks pass. Before live verification, deploy this commit to Netlify with `NEXT_PUBLIC_APP_URL=https://quran-autocaption.netlify.app` available at build time and make that hostname the production/primary hostname. Confirm the callback's no-code response has `Location: https://quran-autocaption.netlify.app/editor` (no old-host redirect), then complete a real Google sign-in and confirm the returned `Set-Cookie` headers persist through refresh, `/projects`, Save, and Export.

## Current milestone: Netlify server-handler deployment repair

Complete:

- Diagnosed the production upload failure from Netlify/OpenNext output rather than applying an externalization setting. The `/editor` server trace reached Transformers.js through a client-page import used only for browser capability detection, which in turn traced the Transformers Node backend, `onnxruntime-node`, native libraries, and bundled Sharp assets.
- Isolated the editor behind a client-only `next/dynamic` boundary with `ssr: false`; the route now contains no recognition or export engine imports. Lightweight FastConformer metadata, browser recognition support, and browser export support have separate contracts/support modules.
- Kept the recognition engine lazy-loaded when detection begins and made the Mediabunny export inspection lazy-loaded for preflight/export. No model, timing, Quran, export, entitlement, or server-route behavior changed.
- Added `npm run analyze:netlify-server`, a dependency-free inspection of the generated handler, plus regression coverage that prevents browser runtimes from returning to the editor server graph. Documented the local Netlify build/inspection workflow in [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md).
- An isolated Netlify Runtime v5.15.13 baseline build at `8197eb3` produced an 82,295,803-byte ZIP / 222,482,799-byte unpacked handler. The repaired local build produces a 19,081,633-byte ZIP / 53,276,981-byte unpacked handler, a 76.8% packaged-size reduction. Browser VAD/WASM assets remain static deployment assets, not function files.

Verification: local Next build and Netlify offline production build pass. `npm run analyze:netlify-server` confirms the repaired handler has no Transformers, ONNX Runtime, VAD, or Mediabunny contributor. The existing non-fatal VAD dynamic-require warning remains limited to the browser client graph.

## Current milestone: Production deployment readiness

Complete:

- Added [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md), the single Vercel/Supabase/Google/Stripe sandbox/Storage/migration release checklist. It records the exact environment contract, the local-first browser architecture, Preview safety, dashboard URLs, manual validation sequence, future live-mode boundary, and the deliberately deferred CSP rollout.
- Made `NEXT_PUBLIC_APP_URL` the canonical safe origin for Stripe return URLs and Supabase authentication callbacks. Localhost remains the development fallback; production rejects missing, path-bearing, non-HTTPS, or otherwise unsafe origins instead of trusting a request host.
- Added startup/build configuration diagnostics that print missing variable names only, baseline security headers, explicit `server-only` guards for service-role billing/entitlement code, and a Vercel Preview guard that refuses `sk_live_…` Stripe keys.
- Kept cloud media browser-direct to private Supabase Storage; recognition/model/WASM loading and WebCodecs/Mediabunny export remain browser-local. The development-only yt-dlp control is now replaced by clear production copy, while the server route remains independently denied outside development. TikTok stays safely configuration-gated.
- Added production-readiness regression coverage for origins, configuration failure tolerance, Preview Stripe safety, service-role isolation, raw Node webhook handling, direct cloud media, development-only YouTube gating, and baseline headers.

Verification: `npm run regression:quran` passes production invariant probes; the optional local real-audio benchmark remains unavailable/failing in this workspace and refreshed `docs/regression/results/20260909.md` without recognition changes. `npm test` (305 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. `npm audit --omit=dev` reports two high-severity transitive `sharp` advisories through `@huggingface/transformers`, with no available fix; this is a release-risk decision, not changed by this milestone. Live dashboard/browser validation remains manual and Stripe stays test mode.

## Current milestone: Streamlined paid plan upgrades

Complete:

- Added an authenticated Pro-to-Premium Customer Portal deep link. It derives the paid subscription and Stripe Customer exclusively from server-side billing records, confirms the mapping belongs to the signed-in account, and starts Stripe's `subscription_update` flow without creating a second subscription.
- Preserved ordinary **Manage plan** as the general Customer Portal and preserved the paid-user Checkout rejection. Free users still use Checkout for either paid plan and the monthly/annual selector; Stripe's portal configuration owns paid-user plan/interval choices.
- Portal returns now revalidate the canonical entitlement projection and keep an updating state until the signed webhook has reported Premium. The redirect itself never grants access.
- Updated [STRIPE_SETUP.md](./STRIPE_SETUP.md) with the required Customer Portal subscription-switching configuration and Pro-to-Premium test step.

Verification: `npm test` (298 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. Live Stripe/Supabase validation remains a manual test-mode step.

## Previous milestone: Stripe subscription billing in test mode

Complete:

- Added test-mode Stripe-hosted Checkout for the canonical Free / Pro / Premium plans: Pro $9.99/month or $99/year, and Premium $19.99/month or $199/year. The server accepts only `{ plan, interval }`, resolves one of four server-only allowlisted Price IDs, and blocks duplicate paid Checkout sessions.
- Added server-only one-account/one-Stripe-Customer mapping, a verified Stripe subscription projection, safe Customer Portal sessions, and an additive restrictive-RLS billing migration. `account_entitlements` remains the single product-plan authority.
- Added raw-body signature verification and replay-safe webhook processing for Checkout completion plus subscription create/update/delete. Known `active`/`trialing` prices grant the matching plan; `past_due`, unpaid, canceled, incomplete, expired, paused, or unknown-price rows resolve Free. Checkout redirects merely poll the authoritative state.
- Replaced provisional plan actions with Monthly/Annual launch pricing, mathematically derived annual savings, real Checkout/Manage plan actions when configured, a precise unconfigured state in development, and current subscription status in the dialog.
- Added [STRIPE_SETUP.md](./STRIPE_SETUP.md) with Stripe Dashboard test-mode setup, Customer Portal/webhook configuration, Supabase verification, test cards, safe reset, and local Stripe CLI forwarding instructions.

Verification: focused Stripe tests pass; `npm test` passes (296 tests); `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes its production invariant probes; its optional real-audio benchmark still fails in this workspace and refreshes `docs/regression/results/20260909.md`, with no recognition changes. Live Stripe/Supabase delivery remains a manual test-mode setup step.

## Previous milestone: Polished account and upgrade experience

Complete:

- Redesigned the authenticated editor account menu as a compact account hub with profile identity, an entitlement-driven plan card, plan-specific export/watermark benefits, Projects, Billing & plans, and sign out. No account settings destination was added because no real settings surface exists.
- Free account usage reads the existing authenticated `listCloudProjectRecords()` path, which lists only completed saved cloud projects; local checkpoints and incomplete/failed saves remain excluded. Pro and Premium deliberately show no fabricated cloud-storage quota.
- Added a reusable, keyboard-accessible plan comparison dialog with Free, Pro, and Premium capability cards/matrix, active-tier Current plan treatment, no prices, and only “Upgrade available soon” paid actions. The dialog is presentation-only and cannot mutate entitlements.
- Added restrained Upgrade actions beside locked Standard/Ultra export qualities and routed account and export affordances to the same reusable comparison experience. The account popover now closes on outside interaction and Escape without leaking editor shortcuts.

Verification: `npm test` (290 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Production Free / Pro / Premium entitlement engine

Complete:

- Replaced the incompatible historical `Free/Creator/Pro` client entitlement layer with one canonical lowercase `free | pro | premium` model. Server-side resolution reads the new RLS-protected `account_entitlements` table, treats missing/unknown records as Free, and reauthorizes every supported new local render by exact requested quality.
- Free can render only Basic 720p and the existing export canvas watermark is forced into its immutable render snapshot. Pro can render unwatermarked Basic/Standard; Premium can additionally render Ultra 4K. The UI keeps all quality choices visible with restrained lock/Requires Pro/Requires Premium states, normalizes an unavailable selection after refresh, and defaults Free to Basic and paid accounts to Standard.
- Completed exports remain downloadable. TikTok now checks the actual completed export watermark state, keeping Free Basic blocked while allowing a paid Basic export without falsely treating it as watermarked.
- Added additive migration `20260908000002_account_entitlements.sql` with read-only user RLS, plan source/timestamps, historical active-subscription migration, and Free-only three-cloud-project RPC enforcement. Paid cloud/project policy is explicitly TBD rather than presented as unlimited.
- Retired the inactive historical Stripe checkout/portal/webhook and `/api/usage` paths so they cannot remain a competing authority or produce normal-workflow monthly-quota requests. Recognition and exports have no monthly count quota. `docs/ENTITLEMENTS.md` records the production matrix, local-render limitation, future Stripe boundary, and secure admin SQL tier-testing steps.

Verification: `npm test` (287 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes the production invariant probes; its optional local real-audio benchmark fails in this workspace, with generated evidence at `docs/regression/results/20260909.md`. The existing non-fatal VAD ONNX Runtime dynamic-require warning remains. Live validation requires applying the new Supabase migration and testing an authenticated account at each plan.

## Current milestone: Cloud project media cleanup and source restore

Complete:

- Replaced production RPC implementations that wrote directly to `storage.objects` with row-only project mutations in additive migration `20260908000001_storage_api_cloud_media_cleanup.sql`. Authenticated Storage API deletion now verifies the caller's exact `<user-id>/<project-id>/` source/thumbnail path before removal; the private bucket and owner DELETE policy are unchanged.
- Preserved update safety: replacement source and thumbnail upload first, project state commits second, and obsolete media cleanup is best-effort afterward. A cleanup failure is logged and classified as cleanup without reporting the durable save as lost. Expired incomplete reservations are reconciled through Storage API before their database row is removed.
- Cloud source restore now downloads the private bucket-relative object into the editor's normal `File` contract. It distinguishes no stored source, a missing object, denied access, and transient retrieval failures; only retrieval failures expose Try again, which retries the download rather than recognition. Restored completed recognition remains intact; undetected restores still run the existing one-time detection path.
- The observed historical relink message did not establish whether old media was absent or inaccessible: the previous loader appended “needs to be relinked” for every download error. The new classification makes that distinction visible without exposing signed URLs or tokens.

Verification: `npm test` (291 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes production invariant probes but its optional local real-audio benchmark fails in this workspace; no recognition code changed. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. Live Supabase/browser validation requires applying the new migration and an authenticated test account.

## Current milestone: Normalize cloud project format state

Complete:

- Diagnosed cloud-save validation failure as format-definition metadata leaking into runtime editor state: `projectFormatForSourceDimensions` returned a `PROJECT_FORMATS` catalog object containing `label` and `aspectRatio`, while the strict persisted schema correctly accepts only `preset`, `width`, and `height`.
- Established the canonical durable format shape as `{ preset, width, height }`. `label` and `aspectRatio` remain derived UI catalog data, reconstructed through `projectFormatDefinition`, and are not serialized into IndexedDB or cloud project state.
- Added an explicit cloud serialization/hydration boundary. Local and cloud persistence share the same legacy normalization: only historical `format.label` and `format.aspectRatio` are removed; any other unknown format property still fails strict validation.
- Reclassified pre-request project-state validation failures as `project-state`, rather than incorrectly reporting them as database failures. Source-aware dimensions now return the canonical runtime format directly.
- Preserved cloud save before detection and the c21732d automatic recognition/source-run behavior without modifying recognition, timing, export, or entitlement code.

Verification: `npm test` (288 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes production invariant probes; its optional ignored local real-audio benchmark fails in this workspace and records that evidence in `docs/regression/results/20260908.md`. No recognition algorithm changed. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Previous milestone: Cloud-save schema repair and automatic Quran detection

Complete:

- Diagnosed the live `GET /rest/v1/projects?...save_complete=eq.true` 400 as migration drift: the client and partial-save workflow require `save_complete`, but the live project has not applied `20260908000000_production_cloud_projects.sql`.
- Kept `save_complete` as the incomplete-upload safety boundary, documented the exact live migration, table schema, private `project-media` bucket, RLS, Storage policies, and RPC contract. The client now classifies schema drift with a safe database-stage diagnostic rather than a generic save failure.
- Made undetected cloud projects valid: Quran metadata and `auto_title` remain nullable, the default name is `My project`, custom names survive later detection, and `/projects` renders **Passage not detected yet**.
- Made initial local video, local audio, and YouTube media recognition automatic after source acceptance. A source identity controller prevents rerender duplicates and starts a fresh run for a genuinely new source. Restored completed cloud/local projects preserve their saved recognition; restored undetected media can detect once available. Retry/Detect again and Correct detection remain recovery paths.
- Cloud saves remain available before recognition, while it runs, after a failure, and while manual passage correction is unresolved. A later successful recognition simply dirties the existing project for an in-place update on the next save.

Verification: focused cloud/recognition tests and `npm test` (284 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` passes the production invariant probes; its optional ignored local real-audio benchmark fails in this workspace, with the generated evidence recorded in `docs/regression/results/20260908.md`. No recognition algorithm changed. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. Live Supabase/browser validation remains manual because this workspace has no configured cloud test account or browser automation.

## Previous milestone: Production cloud projects and project library

Complete:

- Evolved the existing user-owned `projects` table into a production cloud-project record with canonical Quran metadata, media/thumbnail paths, source bytes, duration, export metadata fields, and a private direct-to-Supabase Storage workflow.
- Added database RLS, private Storage path policies, authenticated owner-validating RPCs, transactional Free three-project enforcement, safe replacement cleanup, project deletion cleanup, and per-user storage aggregation. No service-role key is used in browser code.
- Made the editor's top Save an explicit cloud save while retaining IndexedDB checkpoints for local safety. First cloud saves confirm the suggested canonical name; guest saves survive passwordless auth and reopen that modal. Existing cloud projects save in place and retain dirty state on failure.
- Added the authenticated `/projects` dashboard with a dark original project library, private signed thumbnails, metadata/duration cards, search, rename, delete, and cloud-editor restore at `/editor?project=…`.
- Preserved export authentication, locally rendered exports, TikTok behavior, and all Quran recognition/timing behavior. Paid storage and export-quality restrictions remain intentionally deferred.

Verification: `npm test` (278 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. `npm run regression:quran` retained its production invariant pass but the optional ignored local real-audio benchmark reported FAIL in this workspace; no recognition code was changed and the pre-existing checked-in benchmark report remains the last passing baseline. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. Live Supabase/browser validation remains manual because this workspace has no configured cloud test account or browser automation.

## Previous milestone: Production authentication UX and export gate

Complete:

- Replaced the visible password form with a dark, accessible first-party sign-in modal: Google is the primary action and email uses Supabase passwordless magic links. Google configuration errors are actionable in development, and no service-role credential is exposed to the browser.
- Moved the browser client to Supabase SSR cookie sessions, added the safe `/auth/callback` code-exchange route, and added a Next 16 `proxy.ts` session refresh. Callback destinations are restricted to `/` or `/editor`.
- Kept landing, editor, import, recognition, caption editing, translation, highlighting, timeline, and preview public. Export now gates before settings, preflight, or render; authentication with the saved export continuation reopens Export Settings only, never starts a render.
- Before an OAuth or magic-link navigation, the editor checkpoints its metadata-only local project state in IndexedDB and stores only the local project id plus the `export` continuation in session storage. The return restores serializable captions/styles/timeline edits; source files are deliberately never claimed to survive a browser navigation and require relinking when unavailable.
- Logged-in users now receive a compact identity/account menu with avatar where supplied, email, Free plan, Manage account, and Sign out. Save is explicitly labelled local; cloud-save and plan enforcement remain deferred.

Verification: `npx tsc --noEmit`, `npm test` (268 passing), `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Previous milestone: Final pre-production QA and release readiness

Complete:

- Confirmed the intended public/editor route boundary through the production build and local HTTP smoke checks for `/` and `/editor`; no product defects were reproduced in structural, deterministic, or build validation.
- Re-ran Quran invariants and the fixed 45-fixture real-audio benchmark without retuning recognition: all 242 canonical words were timed exactly once; word starts measured 79ms median / 275ms p90 and transition-derived word ends 92ms median / 461ms p90.
- Added a focused 15–20 minute real-browser/manual walkthrough and a production-readiness report. The report distinguishes code-level passes from real media/browser/TikTok validation and operational launch work.

Verification: `npm run regression:quran`, `npm test` (264 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, `git diff --check`, and local production-server HTTP 200 smoke checks for `/` and `/editor` pass. The real benchmark was also run in bounded local batches and merged with the supplied metrics-only tool; production baselines were unchanged. The build retains the documented non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Pre-production TikTok Content Posting integration

Complete:

- Extended Export Complete with an independent **Post to TikTok** surface that uses the already-rendered `CompletedExport` Blob. Download remains available throughout and TikTok errors, retries, or cancellation never rerender, revoke, or alter the completed export.
- Added a self-contained `src/lib/tiktok/` boundary for deterministic Quran-based social captions, media validation, documented FILE_UPLOAD chunk planning, OAuth state comparison, TikTok status semantics, a browser transfer client, and a deterministic test mock. It imports no recognition pipeline.
- Added server-only Content Posting routes for connection state, OAuth start/callback, fresh creator info, Direct Post or draft initialization, publish status, and cancellation. Client secret, access token, and refresh token stay server-side; the encrypted HttpOnly connection cookie is deliberately separable from future Quran Video account persistence.
- Direct Post fetches current creator capabilities before rendering controls and again when confirming the post. Available privacy/options and interaction controls come from TikTok rather than hard-coded product assumptions. Unreviewed Direct Post is explicitly Only-you/private and server-enforced; draft upload is clearly labelled as a TikTok inbox handoff.
- Basic watermarked 720p exports cannot be posted. The dialog explains the TikTok watermark/content-sharing requirement and routes the user back to Export Settings with Standard selected; it never strips an existing watermark.
- Implemented direct browser-to-TikTok, sequential `FILE_UPLOAD` transfer with actual XHR byte progress and rate-safe publish-status polling. The application server handles lightweight OAuth/API calls only and never proxies or stores video bytes.
- Added `.env.example` placeholders and `docs/TIKTOK_SETUP.md` with current TikTok setup, Sandbox/URL verification, scope, audit, privacy, transfer, and compliance guidance.

Verification: `npm test` (264 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning. Browser/live TikTok validation remains manual because no credentials or browser automation are available in this workspace.

## Current milestone: First-party landing product visuals

Complete:

- Replaced the synthetic editor illustration and hero mockup cards with a static, sanitized first-party Quran Video Editor capture. It shows the real vertical preview, canonical captions with visible read-so-far highlighting, translation, waveform/timeline, media workflow, and Subtitles inspector without importing editor code on `/`.
- The supplied capture's source-media filename was changed to `Demo recitation.mp4` before it was added. It contains no account identity, email, filesystem path, project-specific name, or debugging control; the editor composition and Quran display remain visible.
- Added responsive detail crops of that same image for word highlighting, timeline/waveform, and subtitle controls. Desktop/tablet retain the complete editor composition; mobile shows a readable center-focused crop instead of an illegibly shrunken desktop UI.
- Reworked the showcase into distinct Minimal, Translation, Word Highlight, and Cinematic finished-video directions, each with its own composition, caption treatment, title, description, and concise feature chip. The canonical local Quran fallback remains intentionally temporary until first-party captures are supplied.
- Added automatic recognition of optional `public/landing/showcase/{minimal,translation,highlight,cinematic}.{webp,png,jpg,jpeg,avif}` assets. When supplied, those real finished-video captures replace only their matching fallback without changing landing code.

## Current milestone: Restore landing-page scrolling

Complete:

- Removed the editor-era global document scroll lock: `html` and `body` now use `min-height: 100%`, hide horizontal overflow, and allow normal vertical document scrolling. The landing page can therefore grow naturally through every section while keeping its sticky header.
- Retained the editor's dedicated desktop viewport containment on `.editor-shell` (`height: 100dvh; overflow: hidden`), its contained editor body, and independent sidebar scroll regions. Timeline geometry and resize behavior are unchanged.
- Added a focused route-layout regression that checks the scrollable global document contract, landing horizontal containment, editor viewport lock, independent sidebar scrolling, and center-only resizable timeline columns.

## Current milestone: Public Quran Video landing page

Complete:

- `/` is now a lightweight public marketing page; the editor implementation is preserved at `/editor`, which remains directly accessible without authentication. Landing CTAs route straight to a clean editor ready for local media or YouTube import.
- Added a dark, responsive creator-tool landing experience with canonical Quran-caption product mockups, a four-step workflow, before/after presentation, editor workspace illustration, focused feature set, fair generic-vs-Quran-aware comparison, showcase treatments, export-quality messaging, and final CTA.
- Every Arabic marketing demo resolves at render time from the same local canonical Quran corpus used by the editor. No external media, competing product assets, unsupported accuracy claims, fake testimonials, pricing, or authentication gate were added.
- Landing claims remain limited to shipped functionality: Quran-aware detection, canonical text, word synchronization/highlighting, translation, visual editing, local-first recognition, local/YouTube import, and 720p/1080p/4K export. Production auth, pricing, billing enforcement, cloud storage, and social posting remain intentionally deferred.
- Added route/model-isolation and canonical-marketing-text regressions. The public route does not import the editor, FastConformer, or recognition pipeline; those remain isolated to `/editor`.

## Current milestone: Resizable center-only editor workspace

Complete:

- Rebuilt the desktop workspace as left panel, center preview/timeline workspace, and right inspector. The timeline is now a child of the center column, so it no longer overlays either full-height sidebar.
- Made left and right panel content independently scrollable, retaining the sticky Settings/Subtitles switch in the right inspector so long subtitle controls remain reachable.
- Added subtle pointer-captured left/right column resize handles, keyboard arrow adjustments, and double-click defaults. The timeline height divider remains continuous, uses a row-resize affordance, and also restores its saved custom size after collapse.
- Added browser-local UI preferences for left-panel width, right-panel width, and timeline height. These values are clamped to keep a 440px desktop center workspace, do not enter project persistence or Undo/Redo history, and survive collapse/restore and reopen.
- Added focused layout regression coverage for center-only timeline bounds, sidebar exclusion, collapse/restore sizing, desktop width clamps, and continuous timeline-height clamps. Existing timeline tests continue to cover content-rect seeking, screen-space snapping, anchored pinch zoom, and waveform alignment.

Verification: focused workspace/timeline tests, `npx tsc --noEmit`, `npm run lint -- --quiet`, and `git diff --check` pass. Browser validation remains pending because this workspace has no browser automation or recognized-video fixture.

## Current milestone: Pre-production real-video Quran regression

Complete:

- Added `npm run regression:quran`, a development-only runner that executes the integrated Quran invariant probes and the ignored local quran-align/EveryAyah real-audio timing benchmark when media is available. It emits explicit PASS/FAIL/SKIPPED status and writes a dated report without private paths or source media.
- Registered the historical Al-Ma'arij, noisy Surah 74, 6:74-77, 69:19-32, 93:1-5, 3:33-35, 18:57, portrait, and audio-only cases in a typed evidence manifest. User-reviewed boundaries, external machine references, and historical diagnostics are kept distinct; unavailable original recordings remain manual retests.
- Corrected the benchmark harness to score the actual production FastConformer word-end policy instead of forcing the retired first-aligned-token ends. The real 45-ayah / 242-word run retained 100% canonical coverage, word starts of 79ms median / 275ms p90, and transition-derived word ends of 92ms median / 461ms p90.
- Added a compact 10–15 minute browser checklist for retained real clips, long-ayah splitting/translation/highlighting, portrait and audio-only behavior, safe zones, speed, 1080p download, and configuring another export version.

Verification: `npm run regression:quran`, `npx tsc --noEmit`, focused regression probes, `npm test`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. Original user recordings and browser-only export validation remain intentionally manual; no copyrighted/private media is committed.

## Current milestone: Cohesive editor UX polish

Complete:

- Refined the editor into a more consistent, compact workspace: Media, YouTube, Project Assets, and Canvas now use shared density and disclosure patterns; Project Assets remain collapsed by default, while the YouTube media choice remains contextual to the focused URL field.
- Clarified the sticky Settings/Subtitles inspector, including the selected segment/layer context, labelled segmented controls, a visible per-segment custom-style indicator, and a direct **Use global style** action. Settings retains media/canvas controls without duplicating subtitle controls.
- Improved the preview’s available-space behavior for vertical, square, and landscape projects while preserving contain/full-frame presentation and normalized caption geometry. Caption selection and resize affordances, safe-zone guides, timeline Arabic blocks, playhead, and panel restore rails now have more legible, restrained treatment.
- Tightened timeline controls and added discoverable tooltips for resizing, collapsing, zooming, fitting, and trim reset. Interactive controls have consistent hover, focus-visible, and disabled states.
- Simplified local-only YouTube copy, made generation/export status surfaces more cohesive, and fixed the error/success conflict: a previous export remains retained, but its success card does not coexist visually with an active export error.
- No recognition, passage-identification, canonical timing, caption segmentation, word-timing, or export-rendering algorithm changed. Browser walkthrough remains pending because this workspace has no browser automation or recognized-video fixture.

## Current milestone: Export settings before every render

- Export now opens an explicit settings step before each preflight/render, including **Export another version**. Quality is draft/session UI state until **Export video** is chosen; Standard remains the fresh default, while the latest chosen quality remains visible for another version.
- Settings show the three development quality levels, watermark result, the authoritative editable project playback rate, locked project format, actual export dimensions, and MP4 output. Ultra runs the existing capability-aware preflight before a render begins.
- The completed Blob stays downloadable while another version is configured and after a failed replacement. It is revoked only when a newly rendered result completes successfully. Completed metadata now identifies the exact quality, resolution, watermark state, speed, and file size.

## Current milestone: Completed-export download handoff and 720p / 1080p / 4K quality ladder

Complete:

- Fixed the post-render handoff: the local renderer already returned the rendered Blob, but the prior download control lived only in a preflight modal that automatically closed for healthy exports. A completed export now retains that exact Blob, one browser object URL, its filename/mime/dimensions/duration/playback rate/quality/file size/completion time, and the snapshot fingerprint it represents.
- The persistent completion card exposes **Download video** and **Export another version**, displays the real rendered output metadata, and supports repeated downloads without rerendering, preflight, or recognition. The object URL is retained until a successful replacement, source/new-project cleanup, or page cleanup; it is not revoked before the browser starts a download. Project edits preserve the existing file and mark it as older than the current project state.
- Replaced entitlement-coupled export selection with a centralized technical quality ladder available to every user during development: Basic = 720p with the existing watermark, Standard = default 1080p without watermark, and Ultra = real 4K without watermark. Aspect-ratio targets are shared across editor UI, export snapshot, preflight, validation, capability inspection, and the WebCodecs/Mediabunny renderer: 9:16 (720×1280 / 1080×1920 / 2160×3840), 16:9 (1280×720 / 1920×1080 / 3840×2160), and square (720 / 1080 / 2160).
- Ultra preflight now probes the actual 4K encoder configuration before rendering. The existing streaming frame/audio pipeline remains in place; it does not retain all 4K frames in memory. Future plan mapping remains documentation only: Free → Basic, Pro → Standard, Premium → Ultra.
- Export filenames now derive from recognized Quran passage metadata when available (for example, `al-kahf-57-58-1080p.mp4`) and fall back safely to `quran-video.mp4`.

Verification: `npx tsc --noEmit`, focused export tests, `npm test` (246 passing), `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning. Real 4K browser rendering remains device-dependent and was not exercised here because this workspace has no browser automation or recognized-video fixture.

## Current milestone: Export preflight UX and unified validation

Complete:

- Added one deterministic, browser-local `runExportPreflight(project, runtimeContext)` engine. It is read-only and separates persisted Quran/project validation from host-provided source, browser, measured-caption, exporter facts, and the immutable render configuration; it makes no recognition, timing, translation, geometry, or history mutation and has $0 API cost.
- Export silently preflights healthy projects and begins rendering immediately. Only warnings and blockers open the exception-focused preflight panel; warnings allow **Export anyway**, blockers do not. Unexpected renderer failures use a separate error state.
- Renderer and preflight now share export configuration validation. This fixes the Free-plan 720×1280 / 1280×720 / 720×720 targets being incorrectly rejected by the old unscaled-canvas validator.
- Blocking Quran safety checks cover an unresolved canonical passage, invalid verse keys/ranges, duplicate or incomplete automatic ownership, non-resolvable rendered Quran text, invalid basmalah/ornament state, invalid caption intervals, and malformed canonical word timings. Existing manual passage correction remains valid and no confidence is invented.
- Translation review metadata is surfaced only for visible `needs-review` fragments; manual translation remains valid. The preflight also validates active source availability/relink status, media metadata/trim, supported playback rate, browser WebCodecs/output capability, and playback-rate export capability. Audio-only media is accepted.
- Measured caption bounds can warn about canvas clipping, Arabic/translation overlap, and the currently selected social-platform safe zone only. Review selects the caption and opens Subtitles; safe-zone fixes reuse the existing move action; source relinking remains the existing Project Assets workflow.
- Future completion actions remain outside this milestone: the flow is intentionally Preflight → Render → existing download completion.

Verification: `npm test` (244 passing), `npx tsc --noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The build retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning. Real browser validation remains pending because this workspace has no browser automation or recognized-video fixture.

## Current milestone: Project playback-speed controls

Complete:

- Added a persisted project `playbackRate` presentation setting with 0.5x,
  0.75x, 1x, 1.25x, 1.5x, and 2x choices. New and migrated projects resolve
  to 1x; the settings-inspector control is Undo/Redo-aware and participates in
  the saved-project dirty signature.
- Playback still uses one shared HTML media source-time clock. Changing the
  rate does not seek, rebuild captions, or rerun recognition; browser preview
  sets pitch-preservation properties where supported. The editing timeline,
  trims, waveform, playhead geometry, Quran word timings, and captions remain
  in original source time.
- Local WebCodecs export maps output time to source time with
  `sourceTime = trimStart + outputTime * playbackRate`; output duration is the
  selected source trim duration divided by playback rate. Frames, transitions,
  translations, word highlights, and verse ornaments evaluate at that mapped
  source time. Safe-zone guides remain editor-only.
- Non-1x audio export uses a small browser-local streaming WSOLA-style tempo
  processor to retain sample rate/perceived pitch while matching video duration.
  It keeps a rolling PCM window rather than an entire expanded 0.5x recording;
  1x retains the existing direct-copy/re-encode path. Audio-only sources render
  their existing neutral canvas with the same local/$0 speed mapping.

Verification: `npm test` (237 passing), `npx tsc --noEmit`, `npm run lint --
--quiet`, `npm run build`, and `git diff --check` pass. The build retains the
pre-existing non-fatal VAD ONNX Runtime dynamic-require warning. Real browser
validation remains unavailable in this workspace because it has no browser
automation or recognized-video fixture.

## Previous milestone: Social-platform safe-zone previews

Complete:

- Added session-only platform preview choices for None, TikTok, Instagram Reels,
  and YouTube Shorts. The centralized, normalized canvas geometry is explicitly
  documented as approximate and remains outside saved project/export state and
  Undo/Redo history.
- The canvas renders restrained translucent obstruction zones and a dashed Safe
  Content Area above the preview, remains aligned through CSS canvas resizing,
  and gives a compact 9:16 optimization note for square/landscape projects.
- Active and selected caption layers now provide measured project-canvas bounds
  for Arabic (including its verse ornament), translation, and transliteration.
  Contextual collision warnings use those actual bounds rather than anchors.
- Move to safe area moves the linked Arabic/translation stack as one unit when
  applicable, preserves canvas bounds and widths, and writes one undoable shared
  position or property-level selected-segment override according to Apply to.
  Guides themselves are not imported by the export renderer.

Verification: `npm test` (232 passing), `npx tsc --noEmit`, `npm run lint --
--quiet`, `npm run build`, and `git diff --check` pass. Build retains the
pre-existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Real caption-generation progress

Complete:

- Added one centralized, monotonic caption-generation progress controller for
  the real browser-local pipeline: media preparation, VAD, model download,
  Quran-wide passage identification, accepted-span confirmation, canonical
  word alignment, caption construction, translation enrichment, and
  finalization.
- The editor now keeps the canvas visible and presents an accessible overall
  progress bar, concise current-stage copy, accurate FastConformer download
  bytes when an uncached model is fetched, and actual identification-window
  counts. Cached runs skip the download phase naturally.
- Quran identity is shown only after the production passage decision accepts a
  canonical span. Ambiguous identification exits loading into editable manual
  passage recovery; failures replace the progress UI with a clear retry path.
  Retry, clearing, and source replacement reset the controller and reject
  stale async updates.
- Recognition, passage decision, canonical timing, and caption segmentation
  are unchanged. Development builds retain concise stage timing diagnostics.

Verification: focused progress tests (5 passing), `npx tsc --noEmit`, `npm run
lint -- --quiet`, `npm run build`, and `git diff --check` pass. Build retains
the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Transactional editor Undo / Redo

Complete:

- Added bounded (120-operation) centralized project history for caption
  segments, timing, trim, global/segment styles, positioning, transitions,
  highlight settings, format, and verse-number presentation. Recognition and
  project loading establish a fresh baseline; canonical Quran/recognition data
  is never recomputed during Undo or Redo.
- Canvas drags, caption timing edges/bodies, media trim, sliders, color
  selection, and translation edit sessions use transactions: live previews
  update immediately while one completed gesture/edit produces one entry.
- Added compact disabled-aware toolbar Undo/Redo controls and Cmd/Ctrl+Z,
  Cmd/Ctrl+Shift+Z, and Ctrl+Y routing. Native input/textarea undo remains
  untouched while text controls are focused.
- Panel layout, inspector mode, selection, playback/playhead, and timeline
  zoom/pan remain session UI state and do not consume history. Undo/Redo safely
  resolves a selection if a structural operation restores/removes segment IDs.
- Save dirty state continues to use the exact persisted project signature, so
  undoing back to a save checkpoint returns the existing indicator to Saved.

Verification: focused history/style tests and `npx tsc --noEmit` pass. Full
test, lint, build, and browser validation are pending for this milestone.

## Current milestone: Two-mode right inspector

Complete:

- Added session-only `Settings` / `Subtitles` inspector mode state, kept
  entirely outside saved Quran project content and independent of panel layout.
- Caption canvas clicks, caption timeline actions, and basmalah selections use
  one centralized selection-to-mode rule and open Subtitles without seeking or
  changing timing; media and canvas selection open Settings.
- Moved the complete caption style, style-scope, translation-fragment, and
  timing inspector into Subtitles. Settings now retains subtitle selection as
  context and exposes canvas controls without clearing it. The compact toggle
  remains sticky while inspector content scrolls and also updates while the
  sidebar is collapsed.

Verification: focused selection tests, `npm test` (215 passing), `npx tsc
--noEmit`, `npm run lint -- --quiet`, `npm run build`, and `git diff --check`
pass. The build retains the pre-existing non-fatal VAD ONNX Runtime
dynamic-require warning. Real browser validation remains pending because this
workspace has no browser automation or recognized-video fixture.

## Current milestone: Segment-aware Quran translation display

Complete:

- `CaptionSegment` now preserves its immutable full parent translation and may
  carry separate, persisted `translationSegment` presentation metadata. Arabic
  ownership, canonical word ranges, recognition, timing, and transitions are
  unchanged.
- A deterministic, local reviewed Saheeh phrase-boundary table resolves
  18:57, 2:255, and 2:282 from owned Arabic word ranges to contiguous source
  substrings. Unreviewed or source-version-mismatched splits safely repeat the
  full source and report `needs-review`; there is no character/word/time ratio
  splitting and no runtime API/model cost.
- Translation edits are segment-local presentation text with manual review
  status and a reset action. Ownership-changing split/merge operations rerun
  resolution and never silently attach a manual fragment to different Arabic
  words. Preview and canvas export share the same display-fragment accessor.
- Reviewed licensing/data research is in `docs/TRANSLATION_SEGMENTATION.md`.
  Tanzil translations and unverified external word-by-word alignment assets
  were not bundled; only boundary markers are shipped.

Verification: targeted caption tests (47 passing), `npm test` (214 passing),
`npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`
pass. Lint retains four pre-existing unused recognition-helper warnings; build
retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning.
Real browser validation is pending because no recognized long-ayah browser
fixture or browser automation is available in this workspace.

## Previous milestone: Unified caption inspector, style scope, and workspace panels

Complete:

- Timeline and canvas now share one selected `CaptionSegment` plus selected visual layer. Timeline blocks select their exact segment's Arabic layer without seeking; Arabic and translation canvas clicks select the owning segment and keep the same segment timing controls visible.
- The inspector's empty state appears only when no valid caption selection exists. Quran/translation styling and Caption Segment timing, split, merge, and reset controls are available together, including independently selected split pieces and basmalah preludes.
- **All captions** is the default style scope. **This segment** writes only property-level, layer-specific presentation overrides; resolving a segment merges those properties with the global style, and **Use global style** removes only local presentation overrides.
- Preview and export share `resolveCaptionLayerStyle`, so Arabic and translation local overrides resolve equivalently in the editor and rendered output. Caption text, recognition evidence, canonical word ownership, and timing stay untouched by style changes.
- Left assets sidebar, right inspector, and bottom timeline are independently collapsible. The timeline retains zoom/pan/playhead/selection and supports a clamped drag resize with double-click reset; panel layout is session UI state and does not change project media time or caption content.
- The desktop shell remains `100dvh` with internal panel scrolling and fit/contain preview behavior.

Verification: `npm test` (209 passing), `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass. Lint retains four pre-existing unused legacy recognition-helper warnings; build retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require warning. Real recognized-video browser validation remains pending because this workspace has no browser automation or recognized-video fixture.

## Current milestone: Canonical Quran word highlighting

Complete:

- Added an optional persisted Quran caption setting with **Off** (the legacy
  default), **Current word**, and **Read so far** modes plus an accent-compatible
  highlight color. Built-in and existing saved styles remain off unless changed.
- Caption generation now carries the existing canonical FastConformer word
  start/end timings into each owned `CaptionSegment` display range. No model,
  recognition pass, interpolation, or text-length timing is used. Manual display
  timing clips the visible effect without rewriting acoustic word timestamps.
- Preview and canvas export call the same pure display-word/highlight helper.
  Current word uses `[wordStartMs, wordEndMs)`, so real acoustic gaps have no
  active word; Read so far retains completed words. The final verse ornament is
  a separate non-Quran presentation span and cannot highlight.
- Long-ayah pieces retain only their own canonical timings; manual split/merge
  transfers owned ranges without duplicating them. Basmalah preludes without
  precise per-word FastConformer timings stay normally rendered rather than
  receiving invented timing. Quran source strings remain immutable and the
  existing Uthmani display-cleaning path is used for every rendered span.

## Current milestone: Quran passage-identification disambiguation

Complete:

- Reworked FastConformer Quran-wide passage identification so Quran-wide
  lexical frequency/uniqueness, competing coherent surah paths, CTC target
  coverage, and coherent voiced-audio coverage are evaluated before the
  production evidence gate accepts a passage. Shared Quran language remains
  retrievable but cannot override stronger distinctive opening and continuity
  evidence.
- Added deterministic regressions for the Surah Al-Ma'arij opening versus the
  misleading shared Surah As-Sajdah 32:5 phrase, a genuine 32:5 sequence, and
  the existing noisy Surah 74 recovery. The implementation is general and
  contains no Surah 70 or 32:5 production special case.
- **USER-VALIDATED REAL BROWSER behavior:** the same recording that previously
  identified the beginning of Surah Al-Ma'arij as 32:5 now identifies as Surah
  70 through the normal development flow. Exact ayah-end and timing details
  were not asserted beyond the user-provided validation.
- Added concise development identification diagnostics with global hypotheses,
  per-window greedy decode/candidates, lexical uniqueness, CTC score/margin,
  target coverage, continuity, and coherent voiced coverage. Identification
  remains browser-local and deterministic with $0 per-video API cost.
- Timing behavior from `1ceea5d` remains unchanged: FastConformer word starts,
  transition-derived word ends, forced alignment, caption segments, and
  long-ayah splitting were not modified.

## Current milestone: Local Quran phonetics/DP audit and FastConformer transition-end promotion

Complete:

- Audited QuranCaption’s `quran-multi-aligner` before implementation. The
  public repository root is CC BY-NC 4.0; the embedded aligner README declares
  MIT but has no separate LICENSE in the source tree and its relevant files
  have no individual license headers. Its named phoneme ASR models use private
  Hugging Face token support with Python/Torch/Transformers/Cython runtime;
  permissive model licensing, ONNX export, size, and browser feasibility could
  not be verified. No upstream code, model, cache, or CC BY-NC asset was copied
  or shipped. Exact upstream paths and the qualification decision are in
  `tools/timing-benchmark/README.md`.
- Added an independent deterministic Hafs-oriented phonetic target and a
  global CTC/Viterbi phoneme DP engine in the development benchmark. Targets
  preserve reversible canonical word ownership and cover silent Uthmani signs,
  shadda, wasl, hamza carriers, sun-letter assimilation, vowels, and pauses.
  It is exercised on explicit frame-level phoneme scores but is not scored on
  real audio or shipped because a commercially clear browser phoneme acoustic
  model was not found; no synthetic acoustic evidence was substituted.
- Added `fastconformer-transition-boundary`, a real browser-local CTC endpoint
  policy using the existing global forced path’s current-terminal posterior,
  blank evidence, and next-word onset posterior. It keeps first lexical-frame
  starts and canonical order fixed, adds no inference pass and no model bytes,
  and is now production’s default word-end policy. Benchmark-only callers can
  still request the prior `first-aligned-token` ends for fixed baseline
  comparison.
- Ran the exact 45-ayah / 242-word quran-align benchmark in five deterministic
  contiguous batches and merged the metrics-only reports at
  `tools/timing-benchmark/results/20260907-quran-align-phoneme-dp.{json,md}`.
  The promoted transition policy retained 100% coverage and identical starts
  (79 ms median AE / 275 ms p90), while word ends improved from 300 ms median
  AE / 860 ms p90 / -386.56 ms bias to 92 ms / 461 ms / -83.70 ms. Per-reciter
  end medians are 92 ms Alafasy, 56 ms Hani Rifai, and 146 ms Husary Muallim;
  no start regression occurred. The promotion gate passed on material endpoint
  improvement with starts held within its 10 ms equivalence bound.

Verification: `npx tsc --noEmit`, targeted timing tests (10 passing), full
`npm test` (195 passing), `npm run lint -- --quiet`, `npm run build`, and
`git diff --check` pass. Build retains the pre-existing non-fatal VAD ONNX
Runtime dynamic-require warning.

## Current milestone: Quran word-timing benchmark and experimentation harness

Complete:

- Ran the real fixed quran-align benchmark using the `release-2016-11-24`
  CC BY 4.0 timing release (Collin Fair / quran-align; external
  machine-generated reference data, not human ground truth) against 45
  locally cached, filename-and-bitrate-matched EveryAyah recordings across
  Alafasy, Hani Rifai, and Husary Muallim. Each fixture checks the canonical
  Tanzil word count, reciter/audio filename contract, decoded duration, and
  timing-end duration bound; no recitation audio is committed. The malformed
  published Sudais JSON (an alignment crash log, not a JSON array) was
  excluded rather than guessed at.
- Saved the metrics-only report at
  `tools/timing-benchmark/results/20260907-quran-align-real.{json,md}`. The
  unchanged production `fastconformer-current` achieved 100% canonical word
  coverage (242/242), 79 ms median word-start AE, 275 ms p90, and +79.45 ms
  mean start bias. Its word ends are materially early (300 ms median AE,
  -386.56 ms bias), especially for Husary Muallim; this is reported separately
  and no artificial global offset was applied.
- The raw blank-to-lexical CTC interpretation is numerically identical to the
  current first-aligned-token start in this Viterbi path. The constrained
  +/-80 ms local RMS-rise refinement regressed starts (89 ms median, 299 ms
  p90) and regressed Husary Muallim, so neither candidate was promoted. The
  production timing architecture remains one FastConformer canonical forced
  CTC alignment with the existing frame-exact word boundary extraction.
- Added real-run/batch-merge commands, per-reciter scoring, duration and
  mapping validation, structural promotion gates, and a trivial-noise
  non-promotion regression. The original continuous-audio reviewed fixtures
  (6:74-77, 69:19-32, 93:1-5, 3:33-35) are retained but not falsely rerun
  against unrelated individual EveryAyah ayah clips; the previously supplied
  6:77 ~44.8 s continuous-clip behavior is therefore unchanged.

- Added a development-only `tools/timing-benchmark/` harness with deterministic
  references, normalized timing-engine contracts, JSON/Markdown reports,
  structural validity gates, word-start/end metrics, ayah-boundary metrics,
  coverage, error percentiles, bias, and per-word worst-boundary diagnostics.
  It is not imported by the application and production timing behavior is
  unchanged.
- Preserved the supplied 6:74–77, 69:19–32, 93:1–5, and 3:33–35 history.
  The available reviewed values are stored strictly as ayah-boundary evidence;
  no individual word labels were fabricated. The unchanged FastConformer output
  has an explicit `fastconformer-current` adapter for benchmark runs.
- Added raw CTC-path boundary experiments, token/posterior/frame diagnostics,
  local-only acoustic refinement, deterministic degradation helpers, and
  speed-reference mapping. Candidate methods retain the immutable canonical
  alignment and cannot affect passage identity or display segmentation.
- Documented the actual current CTC endpoint policy, frame conversion audit,
  external `cpfair/quran-align` source/data licensing boundary, and the
  phoneme-DP/MFA research feasibility. No external timing/audio was vendored;
  the real fixture-level recording checks are now automated in the benchmark.

Verification: `npx tsc --noEmit`, targeted `npm test --
tests/timing-benchmark.test.ts` (6 passing), full `npm test` (192 passing),
`npm run lint -- --quiet`, `npm run build`, and `git diff --check` pass. The
build retains the pre-existing non-fatal VAD ONNX Runtime dynamic-require
warning.

## Current milestone: Timeline caption labels and source-safe media fit

Complete:

- Text-track blocks now render the same display-cleaned Arabic from their
  authoritative `CaptionSegment` as preview and export. Each split piece keeps
  only its own Arabic range; basmalah preludes render their basmalah text.
  Labels are centered RTL, truncate within their exact timing geometry, and do
  not receive pointer events, preserving selection and edge-resize handling.
- Replaced the prior shared `cover` default with `contain` in both the preview
  and Mediabunny export paths. Source frames are centered on the existing black
  project canvas without stretching or automatic cropping; audio-only remains
  unchanged.
- New unspecialized projects select vertical, landscape, or square canvas
  defaults from the browser-decoded video dimensions. Explicit format choices,
  including saved-project formats, remain preserved. Browser `videoWidth` and
  `videoHeight` are used so phone rotation metadata follows browser display.
- Added timeline-display, split-piece, basmalah, Quran-annotation-cleaning,
  source-orientation, and contain-composition regressions. The caption timing
  array, manual edits, waveform, media trim, playback clock, and project asset
  model are unchanged.

Verification: `npm test` (186 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy timing-helper warnings; the build retains the existing non-fatal
VAD ONNX Runtime dynamic-require warning. Direct browser validation with the
reported portrait phone recording and a short exported sample remains pending:
that media fixture and browser automation are not available in this workspace.

## Current milestone: Project Assets and timeline interaction improvements

Complete:

- Added the metadata-only `ProjectAsset` registry with one persisted active
  media asset ID. Local video/audio and local-development YouTube imports add
  assets without replacing prior entries; the existing single active media
  pipeline remains authoritative. Persisted browser-local assets visibly
  require relinking rather than silently disappearing.
- Simplified the left sidebar with an initially collapsed Project Assets bin,
  compact active/relink/use/remove controls, and grouped Quran Caption,
  Translation, and Transliteration text entries. This is deliberately not
  multi-clip editing.
- Replaced the permanent YouTube mode dropdown with focus/pointer-revealed
  Video and Audio only chips. The source URL remains intact and Escape or
  focus-out dismisses the choices.
- Increased the responsive no-scroll timeline workspace and track heights.
  The native timeline wheel surface now consumes only Ctrl-wheel pinch events,
  uses shared pointer-anchored viewport geometry, and leaves ordinary trackpad
  scrolling untouched.

Verification: `npm test` (184 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy timing-helper warnings; build retains the existing non-fatal VAD
ONNX Runtime dynamic-require warning. Direct browser/trackpad validation is
pending because no browser automation is installed in this workspace.

## Current milestone: FastConformer Quran-wide identification primary

Complete:

- Promoted the browser-local FastConformer Quran-wide CTC identifier to the
  production passage authority. Audio/VAD preparation now defers Whisper; an
  accepted FastConformer result proceeds directly to canonical forced alignment
  in production, while development can still run Whisper for comparison.
- Added one documented deterministic evidence gate with structural hard gates,
  CTC fit and runner-up margin, VAD-explained-audio, and multi-window/surah
  agreement checks. Composite confidence remains diagnostic only. The supplied
  noisy Surah 74 shape (four agreeing windows, -0.233966 CTC, 0.183743 margin,
  fully explained voiced audio) is accepted as `fastconformer-quran`.
- Added the canonical-span adapter so FastConformer preserves mid-ayah word
  evidence while downstream alignment, display splitting, caption timing, and
  manual edits retain their established contracts. Whisper is now only the
  typed fallback (`whisper-fallback`), and both-engine failure remains manual
  correction/no confident passage.
- Replaced shadow diagnostics with `PASSAGE_IDENTIFICATION_DECISION`, including
  engine, evidence gate, spans, optional prelude evidence, fallback state,
  disagreement data, and FastConformer timing/performance fields. The two
  FastConformer passes are still intentionally separate; no mathematically
  unsafe acoustic-output reuse was introduced.

Verification: `npx tsc --noEmit`, `npm test` (182 passing), `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; build retains the existing non-fatal VAD
ONNX Runtime dynamic-require warning.

## Previous milestone: FastConformer Quran-wide identification shadow mode

Complete:

- Added a cached Quran-wide Tilawa lexical/CTC index and an independent FastConformer identification runner. It uses overlapping VAD-qualified audio windows, greedy CTC n-gram retrieval, forward-probability CTC reranking, optional basmalah alternatives, and a deterministic continuity Viterbi solver with an uncertain-window skip state.
- Kept Whisper as the sole production passage authority and left the established FastConformer forced-alignment/caption path unchanged. Shadow output is development diagnostics only and now explicitly highlights a FastConformer recovery candidate when Whisper finds no passage.
- Corrected the reported 73:20 -> 74 boundary failure: global indexing remains intact, but retrieval n-grams and candidate expansion cannot cross a surah boundary; a basmalah is excluded from coarse location evidence and then scored only as an optional prelude for a canonical surah-start candidate. Strong single-surah window consensus now constrains the final canonical span.
- Added regressions for the supplied Surah 74 boundary shape, optional-prelude present/absent CTC scoring, basmalah-only location suppression, anomalous-window rejection, and clean 93:1-5, 6:74-77, 69:19-32, and 3:33-35 retrieval shapes. The exact browser media clip is not stored in this workspace, so the supplied debug shape is covered deterministically but the browser rerun still requires that media input.

Verification: `npm test` (178 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; build retains the existing non-fatal VAD
ONNX Runtime dynamic-require warning. The exact browser media clip still needs
to be supplied for its direct rerun.

## Current milestone: Compact desktop editor redesign

Complete:

- Reworked the editor visual system around a restrained graphite palette, compact control sizing, subtle dividers, and one desaturated blue accent. The prior light, card-heavy treatment and oversized controls are removed.
- Locked the editor shell to `100dvh` with zero document overflow. The header, left media/source sidebar, center canvas, right contextual inspector, and full-width lower timeline remain accessible together at desktop viewport sizes; long side-panel content is contained within its own panel.
- Promoted the existing timeline to a compact full-width bottom workspace without changing its measured element or interaction callbacks. Ruler, centralized track-label gutter, waveform, stationary playhead, caption handles, trim handles, zoom, and pan continue to use the established geometry.
- Kept media import, YouTube import, recognition, caption rendering and manipulation, styling, export, and all editor state/event flows unchanged. Preview retains source aspect ratio and a black audio-only canvas.
- Browser screenshot automation is not installed in this workspace. The existing local development server responds at `http://localhost:3000`, but no supported headless browser binary is available to produce screenshots; manual visual viewport review remains pending.

Verification: `npx tsc --noEmit`, `npm test` (165 passing), `npm run lint`, `npm run build`, and `git diff --check` pass. Lint retains four existing unused legacy-timing helper warnings; the build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Local YouTube URL import

Complete:

- Added a development-only YouTube URL importer beside local media upload, including strict YouTube URL validation, video/audio-only selection, visible staged progress, cancellation, actionable local `yt-dlp` setup guidance, and failure-safe source replacement.
- The local route uses `spawn` argument arrays only, an app-owned temporary directory, a per-import UUID, cancellation cleanup, stale-import cleanup, and no cloud/Supabase/OpenAI media path. Temporary downloaded media is fetched into the existing browser `File`/object-URL pipeline, then removed when cleared or replaced.
- `MediaSource` now records durable provenance metadata (`youtube-import`, source URL, optional title) without persisting temporary bytes. Opening a saved URL-import project still requires a manual relink/re-import; it never silently downloads again. A future production/commercial version requires separate platform and compliance review.
- Added URL validation, argument-array safety, injection rejection, and normalized video/audio timeline regression coverage.
- Local end-to-end validation found that YouTube can expose separate AVC video and M4A audio streams instead of a pre-muxed MP4. The importer now selects that compatible pair first and lets yt-dlp merge it; a 44-second public Al-Fātiḥah import passed in both video and audio-only modes, including temporary-media streaming and cleanup.

Verification: `npx tsc --noEmit`, `npm test` (165 passing), `npm run lint`, `npm run build`, and `git diff --check` pass. Lint retains four existing unused legacy-timing helper warnings; the build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Previous milestone: Non-destructive media trimming

Complete:

- Added persisted absolute-source `mediaTrim` bounds with legacy full-duration migration, a 250 ms centralized minimum, source-bound clamping, reset action, and reset-on-new-source behavior.
- Video and Audio rows share the same trim state for video sources; audio-only projects expose the Audio trim only. Trim handles use the existing zoom/pan-aware pointer conversion and exact 8 CSS-pixel stationary-playhead snap without moving the playhead, preview, or caption timings.
- Normal playback begins at the trim start when necessary and stops cleanly at its end; direct seeking still inspects the full original source. Waveform data stays full-source. Video export renders the selected source interval and evaluates captions at absolute source time; audio-only export remains unavailable.
- Added trim, linked-track, bounds, snap, playback, persistence migration, and caption-invariance regressions. Browser validation remains pending because no media fixture is available in this workspace.

Verification: `npx tsc --noEmit` and `npm test` (160 passing) pass. Full lint/build checks are in progress.

## Previous milestone: Timeline zoom, navigation, and local waveform

Complete:

- Added one editor-only `TimelineViewport` (`zoom`, `visibleStartMs`, and
  `visibleEndMs`) shared by the ruler, Text / Video / Audio blocks, playhead,
  seek/drag pointer conversion, caption snap geometry, and waveform.
  Zoom is bounded from fit-project (1x) through 128x precision, anchors on a
  visible playhead, clamps at source bounds, supports a compact zoom control,
  a Fit project reset, and one shared horizontal pan control. Playback advances
  the viewport only when the playhead reaches the trailing region; caption-edge
  drags never auto-pan it.
- Ruler ticks now choose a compact nice interval from 10 ms through 10 min for
  the visible window and show millisecond labels for sub-two-second windows.
  All source clips and caption intervals are visually clipped rather than
  changing their authoritative times.
- Added entirely local asynchronous Web Audio decoding for both audio-only and
  video sources. PCM is immediately reduced to an in-memory 8,192 min/max peak
  cache; rendering downsamples only the current viewport. It never uploads,
  persists source PCM, blocks import/recognition/playback, or alters Quran
  recognition/timing. The next planned milestone is media trimming.
- Preserved stationary-playhead edge editing, the 8 CSS-pixel screen-space snap
  (now evaluated through the visible window), contiguous-boundary atomic edits,
  and the 100 ms minimum duration.

Verification: targeted timeline/waveform regressions and `npx tsc --noEmit`
pass. Full project checks are pending. No browser media fixture is present in
this workspace, so audio-only and video visual validation remain pending.

## Previous milestone: Precision caption-boundary editing

Complete:

- Added TEXT-only caption-edge resizing with a centralized 100 ms minimum
  duration. A contiguous ayah boundary now updates both neighboring display
  intervals atomically, preserving half-open timing with no gap or overlap;
  basmalah preludes retain their independent timing behavior.
- Kept the playhead and preview independent of caption editing. Beginning an
  edge drag pauses active playback at its current timestamp, and resizing does
  not seek media or change `currentTimeMs`.
- Added an 8 CSS-pixel, screen-space snap target for the stationary playhead,
  using the shared timed-content geometry. The playhead remains visually above
  caption blocks; resize handles appear on hover/selection and show a compact
  boundary tooltip, including its snap state.
- Added regressions for shared-boundary updates, exact no-gap/no-overlap
  semantics, stationary playhead behavior, and pixel-space snap/release.

Verification: `npm test` (153 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; the build retains the existing non-fatal
VAD ONNX Runtime dynamic-require warning. No browser media fixture is present
in this workspace, so the required final audio-only and video browser passes
remain pending.

## Current milestone: Timeline playhead content-origin alignment

Complete:

- Moved the ruler, playhead, timed tracks, width measurement, and pointer-time
  conversion into one timed-content viewport. The Text / Video / Audio label
  gutter is now a sibling and cannot offset the shared time origin or receive
  timeline seek interactions.
- Centralized the gutter width as an editor timeline layout token. At 0:00 the
  ruler, blocks, and playhead share the timed-content left edge; at midpoint
  and duration they share the corresponding content coordinates in both audio
  and video modes.
- Kept the playback clock, caption intervals, recognition, seeking authority,
  track data, and animation behavior unchanged.
- Added geometry regressions for origin, midpoint/end placement, ruler/block
  alignment, gutter-safe pointer conversion, and audio/video parity.

Verification: `npm test` (151 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; the build retains the existing non-fatal
VAD ONNX Runtime dynamic-require warning. No browser media fixture is present
in this workspace, so the required audio-only browser pass remains pending.

## Current milestone: Audio-only playback synchronization

Complete:

- Traced the runtime clock path: video and audio both previously updated the
  shared editor `currentTimeMs` only from native `timeupdate` and `seeked`.
  `CaptionPreview`, timeline playhead, active text blocks, and transition
  interpolation already consume that one state and the shared half-open
  `getActiveCaptionSegment` selector; no recognition or caption timing path
  participates in playback rendering.
- Added `MediaPlaybackClock`, a reusable media-clock sampler that reads the
  active `HTMLMediaElement.currentTime` on one `requestAnimationFrame` loop
  while playing. It is used for both audio and video, starts once on play,
  stops and takes a final authoritative sample on pause/end, and cancels on
  source replacement or unmount. Native `timeupdate` remains a synchronized
  fallback rather than the audio animation clock.
- Seeking through the timeline, native controls, caption selection, or code
  now samples the media element immediately. The existing `CaptionSegment`
  timing, active-interval semantics, text-track geometry, and transition
  definitions remain unchanged.
- Added playback-clock regressions for frame sampling, single-loop lifecycle,
  pause/end/replacement/unmount cleanup, immediate seeks, exact block edges,
  and the shared half-open caption transition.

Verification: `npm test` (150 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; the build retains the existing non-fatal
VAD ONNX Runtime dynamic-require warning. Browser media fixtures are not
present in this workspace, so the required final audio-only and video browser
passes remain pending.

## Current milestone: Media and multi-track timeline foundation

Complete:

- Added the local metadata-only `MediaSource` contract for browser-playable video and audio. Old `sourceVideo` records migrate safely into a video media source; no `File`, source bytes, or object URL is persisted.
- Audio-only selection now follows the existing File-to-PCM recognition path, plays through the shared transport, and renders Quran captions over the selected-aspect-ratio neutral canvas. Video sources continue to populate preview and recognition and now expose both Video and Audio timeline rows from the one file.
- Replaced the single caption strip with one shared Text / Video / Audio timeline, deterministic time ruler, full-height playhead, centralized time-position conversion, click seeking, and playhead dragging. Caption blocks still use the existing authoritative half-open `CaptionSegment[]` timing, including distinct long-ayah pieces and basmalah.
- Audio-only export remains intentionally unavailable with a clear message; no multi-clip, YouTube, waveform, cloud-media, trim, snapping, or zoom work was added.

Verification: `npm test` (147 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Lint retains four pre-existing unused legacy-timing helper warnings; the build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning. No browser media fixtures are present in this workspace, so the required video and audio-only browser passes remain pending.

## Current milestone: Clean Quran caption presentation and default stacked layout

Complete:

- Audited every Quran-specific annotation that appears in the bundled Tanzil
  corpus and could reach caption display. All are removed only by
  `cleanQuranArabicForDisplay` at preview/export composition, after canonical
  word ranges and waqf-aware splitting. The canonical corpus, recognition
  normalization, FastConformer targets, and split metadata are unchanged.
  - Split metadata still uses U+06D6 `ۖ` (1,682; continuation), U+06D7 `ۗ`
    (603; preferred), U+06D8 `ۘ` (22; preferred), U+06D9 `ۙ` (68; avoid),
    U+06DA `ۚ` (1,972; acceptable), U+06DB `ۛ` (12; acceptable), and U+06DC
    `ۜ` (7; avoid). Each is Unicode category `Mn` and is now display-hidden.
  - The remaining display-hidden annotations are U+06DF `۟` (3,988, `Mn`),
    U+06E0 `۠` (66, `Mn`), U+06E2 `ۢ` (510, `Mn`), U+06E3 `ۣ` (1, `Mn`),
    U+06E5 `ۥ` (1,257, `Lm`), U+06E6 `ۦ` (957, `Lm`), U+06E7 `ۧ` (38,
    `Mn`), U+06E8 `ۨ` (1, `Mn`), U+06EA `۪` (1, `Mn`), U+06EB `۫` (1,
    `Mn`), U+06EC `۬` (1, `Mn`), and U+06ED `ۭ` (99, `Mn`). None is used
    as splitter waqf metadata. U+06E1, U+06E4, U+06E9, and U+06DE have zero
    corpus occurrences and are not filtered speculatively.
- Ordinary Arabic letters and harakat, including U+0670 superscript alef, are
  retained. The app-generated final-piece Arabic-Indic verse number remains
  exactly once; intermediate pieces and basmalah remain numberless. Preview
  and export share the same Arabic composition function.
- Linked/default Arabic and translation now render as one measured vertical
  stack, so normal document flow always places translation below Arabic. The
  reusable normalized safe-area calculation is also used by canvas export to
  rebalance multi-line stacks across 9:16, 16:9, and 1:1. Dragging either
  caption still unlinks it immediately, preserving manual user authority.
- Added display-cleaning, canonical-immutability, final-ornament, actual
  18:57 waqf, and measured stack-layout regressions.

Verification: `npm test` (143 passing), `npx tsc --noEmit`, and `npm run
lint` pass. Lint retains four existing unused legacy-timing helper warnings.

## Current milestone: Apply long ayah segmentation in editor

Complete:

- Traced the real 18:57 production bypass to Tanzil's standalone `ۚ` and
  `ۖ` source tokens. FastConformer correctly excludes those non-spoken marks,
  which made the old exact source-token equality guard reject its otherwise
  valid canonical word timing and leave the whole ayah unsplit.
- The editor now associates only zero-visible standalone annotations with the
  preceding FastConformer lexical word for display planning, then slices the
  untouched original source-token ranges into the generated CaptionSegments.
  This keeps waqf marks, gives the planner the same 147-character count as
  `visibleArabicCharacterCount`, and keeps FastConformer next-word cut timing.
- Added a 18:57 -> 18:58 production-path regression with the actual corpus
  shape: 32 display tokens, 30 aligned lexical words, two 18:57 pieces,
  contiguous timing, same-verse ownership, exactly-once text coverage, waqf
  preservation, and final-piece-only Arabic-Indic verse-number composition.
- Expanded development debug to report source word ranges and the final
  generated project CaptionSegment array, so split pieces can be traced from
  FastConformer input through editor state.

Verification: `npm test` (141 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; the production build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning. The supplied browser media
fixture is not present in this workspace, so the exact recording still needs a
browser rerun before committing this milestone.

## Current milestone: Split long Quran ayahs for display

Complete:

- Added deterministic, display-only canonical-word segmentation with a central
  80 visible-Arabic-character default. Whole ayat remain one segment unless
  they exceed that limit; oversized ayat use globally planned waqf-aware cuts.
- Passed FastConformer canonical word timings into the existing display
  `CaptionSegment` authority. Each internal transition is exactly the next
  canonical word's FastConformer start, and the final piece alone owns the
  inline ayah ornament. Basmalah preludes remain whole and numberless.
- Audited the bundled Tanzil Uthmani stop signs and documented their attached
  word encoding and display-cut categories. Canonical source text, passage
  identity, recognition, and export timing semantics remain unchanged.
- Made verse numbers default on for new state and for missing legacy saved
  state while retaining every explicitly saved `false` preference.
- Added Unicode, planner, timing, manual-compatible display-array, and real
  corpus stress tests, including 4:3, 2:255, and 2:282.

Verification: `npm test` (140 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing unused
legacy-timing helper warnings; the production build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Remove duplicate inline ayah ornament

Complete:

- Traced the real browser result in the UthmanicHafs font: U+06DD renders the
  empty ayah frame and an Arabic-Indic digit renders its own numbered frame.
  The previous one-text-node preview therefore still visibly contained two
  ornaments even after legacy source markers were removed.
- The shared display composer now removes only the redundant U+06DD from its
  presentation number. It passes a single Arabic-Indic digit to preview and
  export, which UthmanicHafs visibly renders as one numbered ornament.
  Toggle-off ayah display remains unchanged; basmalah stays marker-free.
- Kept existing color, position, basmalah, recognition/timing, FastConformer,
  and `showVerseNumberAtEnd` behavior unchanged.

Verification: local headless Chrome with UthmanicHafs visibly renders exactly
one numbered ornament. The Arabic span has one text child ending in U+00A0
U+0664 and no generated `::before` or `::after` content. Full project checks
run with this milestone.

## Current milestone: Quran caption color and inline ayah ornaments

Complete:

- Reused the persisted `typography.textColor` Arabic caption style, clarified
  its editor control, and added the existing white default as a schema fallback
  for legacy project and “My Style” snapshots. Preview and export continue to
  consume that same style value.
- Replaced the detached verse-number label with shared presentation-only Arabic
  composition: canonical ayah text followed inline by U+06DD and Arabic-Indic
  digits. The ornament stays in the Arabic text flow, inherits Arabic styling,
  and is included in canvas wrapping/export from the same display helper.
- Added `showVerseNumberAtEnd` metadata so an intermediate split piece has no
  ornament; current complete ayah captions and legacy segments retain the
  expected behavior. `basmalah-prelude` always remains numberless.
- Recognition, FastConformer, passage identification, basmalah timing, and
  automatic whole-ayah timing were not changed.

Verification: `npm test` (130 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. Lint retains four existing
unused legacy-timing helper warnings; the production build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Display detected FastConformer basmalah prelude

Complete:

- Extended the shared editable `CaptionSegment` model with explicit Quran
  `contentKind` values. A `basmalah-prelude` has no fake ayah/verse key and
  uses canonical Hafs Arabic from the Quran content module.
- After valid FastConformer timing has been promoted, the editor creates that
  segment only when its optional prelude is available, acoustically selected,
  finite, positive-length, and strictly before the first canonical ayah. Ayah
  timing remains unchanged; an acoustic pause is left caption-free.
- A first canonical ayah that is itself the basmalah is recognized by canonical
  content semantics, so no second prelude is generated. An absent selection
  creates no placeholder.
- Preview, timeline, manual timing editing, and export consume the same
  segment. The timeline labels it “Basmalah”; it uses normal Quran caption
  styling and has no ayah-number label. Debug now reports `DISPLAY_PRELUDE`.

Verification: `npm test` (127 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning; lint retains four existing
unused legacy-timing helper warnings.

## Previous milestone: Remove legacy Quran timing pipeline

Complete:

- Removed the Darten CTC browser runner, its 355 MB model URL/cache path, the
  micro-ASR timing recovery runner, the timing-lab CTC debug path, and their
  dedicated tests. Shared CTC forced-alignment code remains because the live
  Tilawa FastConformer target/alignment path uses it.
- The editor now identifies the canonical passage with the unchanged
  whole-recording Whisper matcher, then runs FastConformer directly. Its
  structurally valid ayah timings are the only automatic `CaptionSegment[]`
  source. Whisper timestamps do not take part in authoritative timing.
- FastConformer failure now yields a typed recoverable `quran-timing` failure;
  the editor retains the selected video and existing manual state, generates no
  fallback or synthetic captions, and allows retry. Production debug contains
  `AUTHORITATIVE_TIMING_ENGINE`, `FASTCONFORMER_ALIGNMENT`,
  `AUTHORITATIVE_CAPTIONS`, and `ACTUAL_PREVIEW` only.
- Retained VAD for the FastConformer source-window constraint and retained the
  generic optional-prelude handling unchanged.

Verification: `npm test` (123 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning.

## Previous milestone: FastConformer primary Quran timing

Complete:

- Promoted Tilawa FastConformer from development shadow to the primary automatic timing engine after the unchanged Whisper passage matcher has produced the final canonical span. One central selector validates completed inference/alignment, exact canonical ayah coverage, finite contiguous monotonic intervals, source-duration outer boundaries, canonical ayah-one onset, and optional-prelude completion. It deliberately does not compare or vote against Darten, Whisper timestamps, evidence-weighted timing, or forced-alignment confidence scores.
- Preserved `legacy-fallback` as the existing production timing path for model/runtime/assets/target/inference/alignment or structural failures, with the exact failure reason recorded. Darten, Whisper timing, the global solver, micro-ASR, and legacy CTC remain present as fallback/diagnostic infrastructure.
- The browser runner applies FastConformer’s window start exactly once through forced alignment; FastConformer ayah timings remain absolute media timestamps. No legacy solver is re-run over a valid result. The selected boundaries generate exactly one whole-ayah `CaptionSegment[]`, which remains the shared and editable preview/timeline/export authority.
- Debug now exposes `AUTHORITATIVE_TIMING_ENGINE`, `FASTCONFORMER_RAW_ALIGNMENT`, `AUTHORITATIVE_CAPTIONS`, and `LEGACY_TIMING_DIAGNOSTIC` separately. Manual edits still modify only the editable segment array and are never overwritten by a later automatic result.
- Added production-path selector coverage for valid FastConformer promotion despite deliberately disagreeing legacy word/Darten timings, unavailable/incomplete fallback, optional absent basmalah ownership, one-time frame/crop offset behavior, contiguous no-`+1 ms` timing, and shared preview/timeline/export/manual-edit segments.
- Real-browser validation observations retained for the promoted recordings: 6:74–77 starts were approximately 9,600 / 21,668 / 31,978 / 44,765 ms against the supplied approximate references 9,660 / 21,696 / 32,064 / 44,832; 69:19–32 followed the user-edited/acoustic boundaries without collapsed ayat; 93:1–5 selected an absent optional prelude with canonical word one at 1,631 ms; and 3:33–35 produced 2,496 / 9,194 / 14,537 ms while Tilawa independently detected that range at 0.9772. These are validation observations, not asserted human ground truth where no manual labels exist.

Verification: `npm test` (174 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Optional FastConformer leading basmalah

Complete:

- Reclassified any lexical Tilawa-table prefix before the selected canonical
  Quran span as an explicit optional, non-canonical prelude. In the pinned
  93:1 table this is `بسم الله الرحمن الرحيم`; its five BPE tokens no longer
  receive canonical-word-one ownership.
- After one FastConformer inference, the shadow now evaluates canonical-only
  and prelude-plus-canonical forced targets. It compares their mean CTC
  forced-path log posterior per acoustic frame, rather than a raw summed path
  score, and exposes both diagnostics plus the selected prelude timing.
- Canonical ayah timing remains diagnostic-only and starts at the first
  canonical token in either candidate. No production timing, passage identity,
  Whisper, Darten, VAD, `VerseAlignment`, or `CaptionSegment` code changed.
- Added regression coverage for the pinned 93:1 token ownership and for a
  forced prelude path whose Quran word one begins after the prelude.

Verification: `npm test` (170 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: FastConformer Surah 93 target construction

Complete:

- Traced the pinned Tilawa `93:1:1` table: it intentionally begins with the
  basmalah (`بسم الله الرحمن الرحيم والضحي`), whereas the display ayah begins
  with `والضحي`. The lexical comparison now uses Tilawa's bundled `text_clean`
  source, retains every published target token, and assigns the sanctioned
  first-ayah prefix monotonically to canonical word one.
- Used that same source field for the `93:4` standalone hamza representation
  (`ء`), avoiding a broader application Arabic normalizer. The FastConformer
  shadow remains diagnostic-only and does not affect production timing,
  passage identification, `VerseAlignment`, or `CaptionSegment` generation.
- Added pinned-asset regression vectors for 93:1–5, including complete target
  construction, explicit 93:1 first/last word-one ownership, and non-empty
  target coverage. The existing 6:74–77 and 69:19–32 target constructions
  continue to succeed against the pinned assets.

Verification: `npm test` (169 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning. The requested
real-browser 93:1–5 rerun remains pending because this workspace contains no
affected recording fixture; it should confirm `fastConformerShadow.status ===
"complete"`, a positive target-token count, and a positive frame count.

## Current milestone: Quran acoustic-alignment research and FastConformer shadow

Complete:

- Preserved the first successful real-browser FastConformer shadow run for the
  66,083 ms Surah 6:74–77 recording: upstream Tilawa reports 6:74–77 at
  0.9754 and FastConformer ayah starts are 9,600 / 21,668 / 31,978 / 44,765 ms.
  It remains development-shadow-only and does not affect identity,
  `VerseAlignment`, `CaptionSegment`, preview, timeline, or export.
- Added a concise `REAL ALIGNMENT COMPARISON` debug section, explicit
  uncalibrated `forcedAlignmentMeanScore` naming, complete FastConformer run
  quality fields, and a development-only four-recording manual-label registry.
  Evaluation reports absolute-error and structural metrics only where manual
  truth exists; unknown fixtures remain unknown.

- Audited QuranCaption's noncommercial phoneme/VAD/n-gram/substring-DP
  architecture and separately audited Tilawa's public FastConformer BPE CTC
  contract, benchmark harness, and commercial license boundary. QuranCaption
  application code remains study-only; no code was copied or adapted.
- Added a lazy, cached, development-only FastConformer shadow using the public
  CC-BY-4.0 `acibZ/tilawa-quran-onnx` 88.3 MB model plus exact public Quran BPE
  targets. It runs against the same decoded 16 kHz mono PCM, returns logits
  metadata/greedy transcript/known range/explicit score semantics/runtime, and forces the
  already-known whole passage globally into frame-exact canonical word/ayah
  timings. It cannot modify passage identity, `VerseAlignment`, or
  `CaptionSegment` timing.
- Added target-round-trip and no-`+1 ms` frame-exact regression coverage, and
  expanded the real-evaluation tool to report FastConformer separately.
- Hardened the development-only FastConformer asset path: all public assets
  remain pinned to commit `0cd79471524bc9cfa1c9296055242a935a1873e4`, are
  byte-validated and stored under pinned Cache API keys, and use module-level
  single-flight loading. Cold resolver requests are serialized because a live
  Hugging Face resolver trace returned HTTP 429 with `maximum queue size
  reached` before the Xet CDN redirect. A 429 now honors `Retry-After` when
  present, otherwise retries twice with deterministic 1 s/2 s backoff, and
  reports host/status/attempt/retry/cache/byte/time diagnostics.
- Kept the real-fixture limitation explicit: one real browser run and
  approximate Surah 6 references do not justify promotion; the remaining
  recordings still require source audio and verified human labels.

Verification: `npm test` (168 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning. Real-browser
additional FastConformer execution and human-label evaluation remain required
before any promotion.

## Current milestone: Recognition/timing audit and evidence-weighted shadow

Complete:

- Audited every supplied real alignment export (6:74–77 and 69:19–32), all
  timing evidence paths, and the upstream Darten/base-Wav2Vec2 CTC contract.
  The CTC input/preprocessing/vocabulary/frame-rate implementation is
  compatible with upstream; the forced path is nevertheless too low-confidence
  to be a timing authority for these Quran recordings.
- Isolated the Surah 6 regression: late low-confidence CTC starts became hard
  corridors, excluding 21,696/32,064 ms lexical-VAD evidence. The 44,832 ms
  rejection message was misleading: VAD existed; the legacy coherence rule
  failed. Candidate acceptance and diagnostics now share one VAD-in-interval
  predicate.
- Added free greedy CTC decode diagnostics before target forcing, a local-only
  label/evaluation harness, and a deterministic evidence-weighted global
  shadow resolver. It is emitted in alignment debug but does not generate
  production captions. Replay of the supplied Surah 6 data changes median
  approximate boundary error from 7,608 ms to 160 ms; Surah 69 is comparison
  only pending human labels.

Verification: targeted CTC/boundary tests and `npx tsc --noEmit` pass.
Promotion is blocked on verified labels and fresh free-decode diagnostics for
the real recording suite; no authoritative timing behavior changed.

## Current milestone: Validate accepted Quran timing evidence

Complete:

- Replaced the impossible raw-CTC-span caption-containment assertion with a
  source-aware final-boundary trace. Each ayah now records its CTC baseline,
  final start/source, accepted evidence, and rejected or overridden evidence.
- CTC remains structurally validated before it can serve as the chunk-fallback
  scaffold. A local override still requires canonical order, a hard corridor,
  and VAD corroboration; rejected CTC proposals stay diagnostic only.
- Added the Surah 69:19–32 failure regression: a 14,148 ms CTC proposal for
  69:20 is validly refined to 9,504 ms, records the CTC proposal as
  overridden, keeps the raw 69:19 tail for diagnostics, and generates
  contiguous non-collapsed captions without collision repair.

Verification: `npm test` (160 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains
the existing ONNX Runtime dynamic-require warning.

## Previous milestone: Global chunk-fallback Quran boundary solver

Complete:

- Replaced independent chunk-fallback ayah transition selection and its
  `previous + 1 ms` collision repair with the pure deterministic
  `resolveGlobalAyahBoundaries` solver. It produces one ordered boundary
  vector, then the existing single `CaptionSegment[]` authority consumes it.
- A completed same-source CTC result is now re-analysed as the global scaffold
  only when Whisper lacks word offsets. CTC stays diagnostic for the protected
  word-timestamp mode.
- Micro-ASR is interval-only evidence. It can refine a CTC boundary only via a
  corroborating VAD onset within both its interval and the hard transition
  corridor; duplicate recovered coverage is deduplicated by canonical word.
- Added the permanent Surah 69:19–32 regression with duplicate micro-ASR
  evidence and an out-of-corridor candidate. It verifies deterministic,
  contiguous, non-collapsed boundaries. The existing 6:76–77 44,832 ms
  early-boundary fixture and the 93:1–5 / 3:33–35 timestamp regressions
  remain green.

Verification: focused recognition/boundary tests, full `npm test`, `npx tsc
--noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Current milestone: Deterministic Quran passage-boundary completion

Complete:

- Treat local passage matching as an identity anchor, then complete the final
  canonical span with a bounded monotonic scan of its adjacent ayat before any
  timestamped, forced-alignment, caption, or CTC input is built.
- Recover a missing current-ayah edge word contextually only when an unused
  adjacent ASR token and a strong local canonical run support it; extend into
  each neighbouring ayah only with at least two monotonic, sequential ASR
  anchors. The bounded search stops after six ayat and never re-searches the
  Quran corpus.
- Added separate identity, coverage, and boundary confidence diagnostics. A
  locally unique candidate with unexplained speech at a mid-ayah edge is now
  only plausible until boundary completion resolves it.
- Added the permanent timestamped 3:33–35 real-failure family. It verifies
  restored 3:33 display, contextual recovery of 3:34 word one before the
  word-two timestamp, contiguous automatic boundaries, and a CTC target that
  includes the completed passage.

Verification: focused recognition tests, full `npm test` (158 passing),
`npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`
pass. The production build retains the existing ONNX Runtime dynamic-require
warning.

## Current milestone: Verified first Quran onset in timestamped alignment

Complete:

- Separated the first visible Quran onset from the earliest timestamp in a
  merged Whisper token group. The shared pure resolver prioritizes corridor-
  bounded PCM onset, closely associated VAD onset, and acoustically plausible
  lexical timestamps while rejecting an implausible raw zero.
- Applied the verified onset to timestamped and fallback boundary generation
  without changing interior ayah transition timing, passage identification,
  CTC, or the fallback recovery architecture.
- Added the Surah 93 merged-token regression, including the raw diagnostic
  start at 0, verified onset at 1,640 ms, and preserved interior boundaries.

Verification: focused and full `npm test`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
ONNX Runtime dynamic-require warning.

## Current milestone: Deterministic timestamp-first Quran word alignment

Complete:

- Split recognition timing into explicit modes. When Whisper supplies real word
  timestamps, the selected canonical passage is aligned monotonically with a
  dedicated dynamic program; the no-word-timestamp VAD/micro-ASR fallback
  remains separate.
- The timestamped path supports one canonical word to one, two, or three ASR
  tokens and two short canonical words to one ASR token. Canonical starts use
  the first ASR token start and ends use the final ASR token end; Uthmani
  display text is never changed.
- Removed broad VAD rewind from timestamped ayah timing. A missing word one is
  recovered only inside the closed interval from the prior ayah's final
  aligned word end to this ayah's earliest aligned word. Timestamped runs do
  not schedule general transition or final micro-ASR windows.
- Added immutable analysis-run snapshots (source identity/object URL, decoded
  duration, sample rate, and PCM identity). Whisper, timing recovery, CTC,
  progress, captions, and debug state are discarded unless their run id still
  matches the active source. Core timing rejects evidence outside the decoded
  source duration (2 ms numeric tolerance).
- Added the real-shaped 93:1–5 fixture: `و + الضحى` begins at 1,640 ms,
  93:4 bounded recovery begins at 9,420 ms rather than the 5,952 ms VAD
  onset, 93:5 begins at 14,640 ms, and no result exceeds 20,362 ms. The
  existing 6:76–77 word-one regression remains green.

Verification: `npm test` (155 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass.

## Current milestone: Deterministic single-source Quran verse timing

Complete:

- Added pure `resolveVerseBoundaries`, which uses every `WordOccurrence` for
  each known next ayah and records accepted/rejected candidates explicitly.
  A credible 6:77 word one at 44,832 ms now deterministically wins over the
  later word-16/17/18 events at 55,584 ms.
- Automatic editor generation now follows `VerseBoundary[] -> CaptionSegment[]`
  directly. Preview imports the shared half-open `getActiveCaptionSegment`
  selector; timeline and export already consume the same segment array.
- Removed forced-alignment-to-caption generation and timing fields from
  diagnostic display-set plans. CTC remains shadow-only. Development debug now
  reports `AUTHORITATIVE_CAPTIONS`, `ACTUAL_PREVIEW`, and labelled legacy
  diagnostics.
- Added the actual 6:76–77 VAD/word-occurrence regression fixture covering
  resolver, generated captions, editor state, and the shared selector at
  44,831/44,832 ms.

Verification: `npm test` (154 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal `vad-web` critical-dependency warning.

## Current milestone: Trace the real editor timing flow

Complete:

- Removed `forcedAlignment.captionSets` as an authority for newly generated editor display timing. Automatic captions now always flow from the final `RecognitionMatch` / `VerseAlignment` values into `CaptionSegment`; forced-alignment remains available only as diagnostic metadata.
- Added a development-only build marker to **Copy Alignment Debug**, post-React-state editor/timeline timing traces for every ayah transition, exact preview decisions at `boundary - 1` and `boundary`, and generated-caption timing values. The trace includes the earliest candidate and selected recognition boundary already emitted by the timing analysis.
- Added a loud development invariant that every generated non-final `CaptionSegment` endpoint equals the final adjacent `VerseAlignment` boundary. A 6:76 → 6:77 regression now covers recognition alignment → automatic editor captions → half-open active-caption selection at 44,831/44,832 ms.

Verification: `npm test` (153 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning. Real-browser Copy Alignment Debug with the affected recording remains the final empirical check; it explicitly reports the CTC shadow result (`complete` is the successful status), target-token count, word-alignment count, and verse starts without making CTC authoritative.

## Previous milestone: Fix earliest ayah transition selection and CTC structural targets

Complete:

- Replaced the self-referential transition corridor with a candidate interval derived from previous-ayah evidence, all next-ayah evidence, VAD, and the known passage sequence. Direct credible next-ayah word-one evidence now wins chronologically over later internal-word matches.
- Added chronological transition diagnostics showing candidate timestamp, canonical word index, confidence, evidence type, nearby VAD speech onset, acceptance, and reason. The real-shaped 6:76 → 6:77 regression selects 44,832 ms, leaving 6:76 visible through the preceding breath; the later word-18 / 55,584 ms event remains inside 6:77.
- Made CTC canonical target construction use the same Arabic-word convention as display/editor construction, excluding standalone waqf, ayah-number, and annotation glyphs before acoustic indexing. Validation now reports verse, word, original Unicode, normalized target text, and unsupported characters for any real unencodable word.
- Added structural-token coverage and target validation for 6:74–77. The four ayat produce 14, 9, 15, and 18 real spoken target words respectively, each with a non-empty encodable token sequence. CTC remains shadow-only.

Verification: `npm test` (152 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning.

## Previous milestone: CTC forced-alignment shadow prototype

Implementation complete; real-recording acceptance validation pending:

- Replaced the inaccessible 2.93 GB model with the public Apache-2.0
  `Tidzo/darten-quran-asr` `model.int8.onnx`, pinned to an immutable revision.
  The exact artifact is 355,026,417 bytes, uses raw 16 kHz Wav2Vec2 PCM, and
  produces the verified 51-class character CTC output matching its public
  vocabulary. The smaller 63-class `hamza` artifact and the no-profit
  FastConformer mirror are intentionally rejected.
- Browser loading is client-only and lazy after passage identification/VAD. It
  uses Cache API storage and ONNX Runtime Web with WebGPU then WASM fallback;
  a real ONNX Runtime Web WASM session has loaded the selected artifact and
  produced logits in this environment.
- CTC target construction now records canonical Uthmani word -> target-only
  normalized character text -> exact CTC tokens -> aligned frames. Canonical
  display text is never altered; weak forced paths are explicitly marked low
  confidence.
- Expanded development Copy Alignment Debug with artifact/cache/backend and
  runtime timings, target tokenization, low-confidence words, verse deltas,
  and named pause boundaries. CTC remains shadow-only and cannot change
  `CaptionSegment` timing or manual edits.
- Added targeted normalization/tokenization/artifact regressions and updated
  commercial model research.

Verification: `npm test` (149 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The workspace has no real
6:74–6:77 recording and no browser performance trace, so the required
production-versus-CTC transition comparison and cold/warm browser metrics
remain the final acceptance blocker.

## Current milestone: Refine Quran ayah boundaries

Complete:

- Added a timing-only recovery pass for every selected ayah transition and for the final ayah. Passage identification still uses only the immutable primary transcript; canonical Quran text remains the display source.
- The next ayah's local canonical/ASR anchor now selects a bounded VAD corridor. When the first clean anchor is word 3 or later, timing recovers backward by local cadence inside that corridor instead of displaying the ayah at the late anchor. Each non-final ayah ends exactly at the recovered next-ayah onset, including across a real pause.
- Final-ayah timing now retains the VAD speech region containing the final Quran-aligned evidence, so a long madd, weak final words, or a recording cut cannot make the final caption disappear at the last strong lexical timestamp.
- Extended Copy Alignment Debug with a compact `verseTimingTable`, transition corridors/VAD regions/next-ayah evidence/selected boundary/local-ASR windows, and final-end evidence/region/speech-end/video-duration fields.
- Added regressions for connected ayat, late clean next-ayah anchors, clear pauses, long final ayat, final madd, and video cuts during a final ayah. Existing first-onset, full canonical text, forced whole-ayah display, passage-independence, VAD, preview/timeline, and manual-timing tests remain green.

Verification: `npm test` (140 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning. Real-browser validation with the affected recording remains advisable for empirical boundary accuracy.

## Current milestone: Fix browser-local VAD runtime assets

Complete:

- Configured the installed `onnxruntime-web@1.29.0` runtime through `vad-web`'s supported `ortConfig` hook before model/session initialization.
- Served the required JSEP WASM/MJS runtime pair and legacy Silero model from stable `/ort/` paths; the build now checks all three assets exist.
- Cached successful VAD initialization, cleared failed initialization for a clean retry, and added concise development diagnostics without changing VAD thresholds or recognition logic.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:vad-assets`, and `git diff --check` pass. `npm start` reaches ready on an alternate local port; real-browser dev/production validation remains required.

## Current milestone: VAD-constrained local Quran timing recovery

Complete:

- Replaced the RMS-derived pseudo-VAD with browser-local Silero VAD (`@ricky0123/vad-web`), run once over the decoded 16 kHz mono source before Whisper. Its regions contain integer absolute video timestamps and a model-probability confidence; short recitation/breath interruptions are smoothed while meaningful gaps remain separate.
- Speech detection fails closed: background audio is never treated as spoken recitation merely because it has energy. PCM/RMS remains only for refining a boundary inside an already selected Silero speech corridor.
- Preserved whole-recording ASR → immutable `PrimaryTranscript` → text-only Quran passage identification. VAD is timing-only evidence and cannot change the canonical passage.
- Made the first Quran caption hard-constrained to the earliest Silero speech region with aligned known-passage text. A timestamp outside every VAD region is excluded as a timing anchor; a VAD/text corridor with no evidence yields no caption rather than a caption in background audio.
- Bounded fallback micro-ASR windows exclusively to VAD speech regions, with 4.8-second overlapping local windows. Missing-verse and transition work is intersected with speech regions, so confirmed non-speech never consumes a recovery pass.
- Added regression coverage for the 2.63s false-anchor / 9.5s real-speech shape, VAD-only recovery windows, and tiny VAD interruption smoothing.

Verification: targeted recognition/VAD tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser validation remains required with the real 6:74–77 recording, including first-run model download/caching and a no-caption check through the initial background audio.

## Current milestone: Recover complete Quran verse timing

Complete:

- Fixed the f0840e7 regression where the editor appended bounded micro-ASR chunks to the original whole-recording chunks and ran passage detection again. A poor or contradictory timing window could then lower global transcript coverage and overwrite a valid initial passage with `no-reliable-match`.
- Added immutable `PrimaryTranscript` construction (raw stitched ASR text, normalized tokens, original chunks, and timestamp mode). Passage identification now reads only that value through the independently callable `identifyQuranPassage`; `passageSource` is always `primary-transcript`.
- Made recovery chunks explicit timing evidence. The second pass preserves the already selected canonical passage while using micro-ASR/PCM only for local verse and word timing; empty or alternate-passage recovery text cannot alter identity.
- Added primary-vs-pre-f0840e7 shadow diagnostics, top-five candidate/debug output, and regressions for word versus chunk-fallback identity, empty micro-ASR, contradictory micro-ASR, and the retained missing-verse recovery path.
- Corrected the fallback architecture so canonical ayat and their words are retained independently of Whisper observations. `CanonicalWordAlignment` now represents every word in the selected full-ayah range; direct ASR, bounded micro-ASR recovery, PCM refinement, interpolation, coarse chunk timing, and unknown timing are explicit evidence classes.
- Stopped distributing a coarse Whisper chunk across individual words. `chunk-fallback` text remains useful for passage identity, but cannot create direct word anchors or precise-looking word timing.
- Added a second local timing pass after passage selection. It uses detected speech regions and bounded overlapping 8-second PCM windows, scores the known passage again, targets ayat with no direct anchors, and preserves absolute source timestamps. A 6:75-style ayah between anchored neighbours is searched before interpolation.
- Made first/last ayah boundaries conservative: missing ASR words alone never create a partial ayah. Partial status requires direct timing plus an acoustically insufficient speech edge for the omitted canonical words.
- Automatic output now creates one full canonical `CaptionSegment` per ayah. The internal pause/splitting evidence remains available, while direct display generation checks that every canonical range is contiguous and segment midpoint activation is regression-tested.
- Updated Copy Alignment Debug and the development timing report with timestamp quality, micro-ASR/recovery state, direct and recovered coverage by ayah, verse evidence, canonical alignments, and first-onset trace.
- Added a structural regression for the observed fallback failure: early coarse text/noise, missed first two words, internal holes, zero first-pass 6:75 anchors, later strong evidence, local 6:75 recovery, full canonical display, and verified later onset.

Verification: targeted recognition/caption/local-Whisper tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser validation remains required with the real 6:74–77 recording, especially to calibrate micro-ASR windows on noisy audio.

## Current milestone: Accuracy-first Quran forced word alignment

Complete:

- Added a separate canonical-first forced-alignment layer after whole-recording passage inference. It represents canonical passage words, every aligned audible `WordOccurrence`, repeated local occurrences, ayah timing with partial boundaries, text-associated pause candidates, and word-boundary caption-set plans.
- Retained local timestamped Whisper only as lazy-loaded retrieval/coarse timing evidence; the corpus controls canonical text. A bounded five-word local backward jump models phrase repetition without allowing Quran-wide jumps.
- Added local PCM edge refinement and pause scoring after canonical words. Caption plans preserve the old text through pauses, split long ayat only at canonical word boundaries, and delay set advancement across backward repetition.
- The editor now creates initial display blocks from forced-alignment plans while `VerseAlignment` remains the persistence/reset compatibility layer. Manual timing remains authoritative.
- Added development `window.__QURAN_ALIGNMENT_DEBUG__`, the normal-editor **Copy Alignment Debug** action, and expanded the recognition route debug output. Reports contain no audio bytes.
- Documented the architecture decision, rejected second-model alternative, local runtime cost, and current phonetic-alignment limitation in `docs/RECOGNITION.md`.

Verification: targeted forced-alignment/caption tests, `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, and `git diff --check` are run for this milestone. Real recitation browser validation remains required, especially for noisy multi-ayah recordings and ASR timestamp fallback.

## Current milestone: Whole-ayah captions and first-ayah timing correction

Complete:

- Automatic generation now creates exactly one full-text `CaptionSegment` per detected ayah. Recognition still preserves canonical partial-word spans; repeated Quran words do not change visible text. Generated ayat remain contiguous by setting each previous segment end to the next credible ayah start, while manual split/merge and timeline edits remain authoritative.
- Corrected first-ayah onset selection: a strongest local run of accepted canonical ASR alignment anchors the temporal corridor, and PCM may only refine inside that corridor. Generic audio activity and isolated early Whisper-like output cannot move Quran captions seconds earlier.
- Centralized half-open active-caption selection in `getActiveCaptionSegment`; preview transitions and timeline active state use the same editable interval, including exact start/end boundary behavior.
- Every timeline caption set is a visible block with draggable body, left edge, and right edge. Body drag preserves duration; edge edits use integer milliseconds, subtle playhead/neighbor/80 ms snapping, and a live `00:00.000` tooltip. Manual edits do not ripple neighbors and can intentionally create gaps or overlaps.
- Added per-set and all-set timing reset actions that restore recognition-derived timing evidence without mutating `VerseAlignment`.
- Expanded the development-only `/recognition` route with Copy Timing Report and Export Debug JSON, including ASR/audio/alignment/CaptionSegment/manual-mark traces plus observed lab caption activation events. R/M/E mark recitation start, transitions, and final recitation end; transition marks can be associated with detected CaptionSegments.
- Added regressions for whole-ayah defaults, repeated-word stability, exact contiguous ayah display timing, and the 2.63s-noise / 9.5s-Quran-onset failure shape.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification remains required with a real recitation: confirm no pre-onset caption, pause behavior, timeline body/edge drag, snapping tooltip, preview agreement, ground-truth marks, and persistence through save/open.

## Current milestone: Holistic Quran passage alignment

Complete:

- Replaced chunk-by-chunk final verse commitment with two-stage, bounded whole-recording inference: fuzzy anchor retrieval proposes contiguous Quran windows and dynamic-programming sequence alignment scores every candidate against the complete transcript. Candidate scores combine normalized/recitation-aware token similarity, transcript/canonical coverage, word order, and consecutive-ayah support; top candidates, margin, and late disambiguation are exposed at `/recognition`.
- Whisper now requests word timestamps and overlap-stitches its 30-second windows into one monotonic recording without duplicate overlap words or backward timestamps. Ambiguous-but-credible clips expose `plausible-ambiguous` and retain a usable best passage for correction; only `no-reliable-match` creates no captions.
- The selected passage is aligned again as one canonical word sequence against all timestamped ASR words. A 10 ms local PCM RMS envelope is built once per recognition job. It uses a local adaptive noise floor only around canonical ayah transition corridors to refine active speech offset/onset; breaths within 6:74 or 6:76 cannot create a verse split. Initial silence and final vocal completion are refined around the first/last aligned word.
- Made editable `CaptionSegment.startMs`/`endMs` the shared preview/timeline interval. Preview transitions now stay strictly inside that half-open range, so an upcoming caption cannot appear before its start and a caption is inactive at its end. Recognition `VerseAlignment` timing stays independent reset evidence.
- Added explicit regressions for 5+ seconds initial silence, connected ayat with no acoustic gap, expected-transition PCM gaps, ambiguous best-candidate behavior, and the 6:74–77 mid-ayah breath fixture while preserving 93:1–5, noisy-ASR, and unrelated-Arabic regressions.
- Fixed the real-browser word-timestamp crash by replacing the ordinary `onnx-community/whisper-base` ONNX export with `onnx-community/whisper-base_timestamped`. The normal export lacks the cross-attention outputs used by Transformers.js 3.8.1 to derive `return_timestamps: "word"`; the timestamped multilingual Base export retains them.
- q4 remains selected (approximately 145 MB first download: 18.8 MB q4 encoder plus 123.7 MB q4 merged decoder and small tokenizer/config assets). WebGPU remains preferred and local WASM remains the automatic fallback; model loading remains lazy and browser caching remains enabled.
- Added explicit timestamp capability, validation, and retry diagnostics. Invalid/missing/identical/out-of-duration/regressing word data, or a cross-attention runtime error, retries once with timestamped chunks from the same local model and marks the run `chunk-fallback`; isolated zero-duration words remain usable. The two-stage passage mapper and PCM transition refinement are unchanged.
- Fixed boundary-ayah loss by changing the final mapper target from verse windows to a contiguous canonical Quran word span. Its semi-global DP permits free canonical start/end gaps (partial first/last ayat) but penalizes every unmatched ASR token, so initial silence remains irrelevant while a substantial spoken Quran prefix cannot be discarded to preserve a cleaner later anchor. Detected spans now carry first/last canonical word metadata, per-ayah word coverage, independent mapping/coverage/uniqueness/boundary metrics, and diagnostics for candidate prefix/suffix evidence and boundary extension.
- Added regressions for the real 6:75–77 shape (initial silence, noisy 6:75, clean 6:76–77), partial first and final ayah boundaries, unrelated Arabic before Quran, and identical mapping under word timestamps and chunk fallback.

Measured: the noisy five-ayah Ad-Duha mapping completes in about 0.73 s in this Node workspace; PCM envelope construction is linear in source duration. Browser codec/reciter boundary measurements remain manual verification work.

Manual browser test required before release: verify Ad-Duha 93:1–5 and 6:74–77 with the timestamped q4 model. Confirm `word` mode and returned word timestamps in `/recognition`, correct passage identity, no caption during initial silence, no breath-derived boundaries around 0:16/0:38, and 6:74–77 timing materially closer to the human-observed approximate ranges (0:07–0:20, 0:21–0:30, 0:32–0:44, 0:45–1:06). If a browser uses `chunk fallback`, confirm mapping continues and the editor displays the approximate-timing warning.

## Current milestone: Compact Quran video editor workspace

Complete:

- Reframed the homepage editor as a viewport-oriented workspace with a compact top bar, source/tools sidebar, dominant video canvas, contextual inspector, and attached timeline.
- Arabic and translation now behave as separate editor-only canvas objects with independent selection, normalized drag positioning, direct width resizing, selection handles, and an Align below Arabic action.
- Moved text styling into a selection-aware inspector with compact controls while keeping project format, detection, local/cloud project actions, timing edits, transitions, styles, and local export discoverable.
- Added legacy-compatible independent translation width state and kept selection chrome out of the export snapshot/render path.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser interaction verification with a local video remains recommended.

## Current milestone: M9 — Stripe subscriptions for Creator and Pro

Complete:

- Added server-only Stripe checkout and Customer Portal routes, allowlisted Creator/Pro plan mapping, Supabase-user authentication, safe customer reuse, and internal user metadata.
- Added signed, raw-body webhook processing for subscription lifecycle events with idempotency records and conservative active/trialing/known-price entitlement policy.
- Added owner-readable, server-write-only subscription state storage and authoritative plan resolution. Existing centralized entitlements now receive the verified plan; cancel-at-period-end remains paid until Stripe reports the subscription ended.
- Added account billing UI, test-mode configuration names, and a manual Stripe checklist. No secrets or Stripe IDs are committed.

Verification: targeted billing tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Live Stripe/Supabase deployment and webhook delivery remain manual environment checks. Annual billing, coupons, trials, one-time purchases, 4K, other qiraat, and server rendering remain out of scope.

## Current milestone: V1 Free / Creator / Pro entitlement model

Complete:

- Replaced provisional plan definitions with centralized typed capabilities and quotas in `src/lib/entitlements.ts`; unauthenticated and authenticated-without-subscription users resolve to Free.
- Free is capped at 720p with a renderer-controlled watermark, 2 cloud projects, and 2 saved custom styles. Creator is capped at 1080p with no watermark and 25 cloud projects. Pro carries future 4K, multi-qiraat, and premium capability flags with a centralized 1,000-project technical ceiling.
- Export count remains unlimited on every plan while `export_completed` continues to be recorded. Local Quran recognition, canonical Arabic, manual editing, and local exports are not count-gated.
- Added a development-only `NEXT_PUBLIC_DEV_PLAN_OVERRIDE` for local simulation; production ignores it and uses server subscription state when that state is connected.

Verification: entitlement, export, and existing regression tests pass when the milestone checks complete below. Stripe, 4K, other qiraat, and word-level alignment remain intentionally unimplemented.

## Current milestone: M8.5 — Server-authoritative usage accounting

Complete:

- Added append-only `usage_events` storage with user/event/time indexes, operation idempotency, and RLS that permits owner reads but no client inserts.
- Added server-only usage helpers for recording events, current-month counts, centralized UTC period boundaries, structured quota results, and provisional Free/Creator/Pro limits (unlimited until product values are approved).
- Added an authenticated `/api/usage` route that derives identity from the Supabase bearer session and records only allowlisted event types through the service-role path.
- Completed local exports and successful cloud saves now submit minimal authenticated events; anonymous/local flows remain no-ops. Failed or cancelled exports never submit an event, and duplicate operation ids are ignored.
- Cloud save events are tracked for meaningful save operations; a future active-project quota should query `projects` rather than count save clicks.

Verification: targeted usage tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Supabase migration execution and authenticated browser verification remain deployment-environment checks because local credentials/database are not configured here.

## Current milestone: Local project lifecycle

Complete:

- Added an explicit IndexedDB repository for lightweight saved project metadata. Save creates a stable project id and later saves update that record; no automatic permanent save is performed.
- Added Saved/Unsaved changes state, Save Project, Open Project local listing, Discard, Delete saved project, and New Project actions with unsaved-change confirmation.
- Opening restores alignments, caption segments, format, translation/style/positioning/background/transition settings, and asks for the original source video again. Filename, size, media type, and loaded duration are checked; recognition does not rerun automatically.
- Added before-unload protection for meaningful unsaved edits. Refresh intentionally warns that ephemeral unsaved work will be lost; explicit saved metadata remains separate and local.
- Added repository validation and regression tests rejecting media payloads, object URLs, source bytes, and export data. Delete removes only local metadata; source and export files remain on the device.
- Saved project persistence now uses the canonical `VerseAlignment` shape (`verseKey`, `startMs`, `endMs`, confidence, and timing evidence). Legacy `startSeconds`/`endSeconds` alignments migrate to milliseconds on load and are not retained as a second active representation.

Verification: targeted project-storage tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification remains recommended for IndexedDB persistence and source mismatch/reselection flows.

## Current milestone: M7B — Productionized local deterministic exporter

Complete:

- Added Draft, Standard, and High quality presets with centralized bitrate mapping; Standard is the default and output dimensions remain tied to the selected 9:16, 16:9, or 1:1 project format.
- Added a normal export panel showing format, quality, resolution, and the capability-selected MP4 H.264/AAC or WebM VP9/Opus output before rendering. Successful files remain in memory only until the user downloads them.
- Export jobs snapshot the source-independent editor configuration at start, reject duplicate jobs, support cancellation, report deterministic progress/elapsed time/derived ETA, and retain the live editor/source state on failure.
- Added input/output validation, safe Quran passage filenames, verified duration/audio/frame coverage/non-empty output, and user-facing retryable errors with detailed diagnostics retained for development.
- Safe-area guides remain editor-only and are excluded from the render configuration. Source timing remains deterministic and independent of tab visibility or real-time playback.

Verification: targeted export tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification with audio fixtures remains required for codec availability and playback coverage.

## Previous milestone: M7A — Client-side video export technical spike

Complete:

- The MediaRecorder spike failed manual testing: output was laggy/choppy and omitted source audio. It is deleted and is no longer callable by the normal export action.
- Selected stack: Mediabunny 1.55.x as the maintained, browser-local MP4/WebM demuxing/muxing and WebCodecs integration layer. It reads the selected `File` incrementally via `BlobSource`, decodes video/audio with its WebCodecs sinks, and muxes a final local blob. This replaced a separate MP4Box/mp4-muxer pairing because one maintained library owns both container directions and codec capability checks.
- The lazy-loaded offline renderer builds a frame schedule from source presentation timestamps and detected FPS (CFR when available; 30 FPS fallback), then decodes, composites, and encodes one frame at a time. It neither starts playback nor uses `requestAnimationFrame` as an export clock; output timing is deterministic and covers the full source timeline.
- Caption composition includes source cover fitting, Quran Arabic, translation/transliteration visibility, typography, outline/shadow/background, linked/unlinked positions, verse number, and the same `captionVisualStatesAtTime` interpolation used by preview. Editor-only safe-area guides never enter export configuration.
- MP4 H.264/AAC is selected only after runtime codec capability checks. If unavailable, VP9/Opus WebM is selected; the filename and MIME type match the actual container. Compatible AAC/Opus input audio is packet-remuxed; other supported audio is decoded/re-encoded locally. The result is demuxed once more before download and export fails if a source containing audio produces no output audio.
- The selected Quran font is loaded and verified with `document.fonts` before demuxing. Page-specific Madinah/QCF fonts are explicitly rejected instead of allowing fallback/corrupt glyphs. Frames and audio samples are released incrementally; cancellation disposes input/output resources through one cleanup boundary.
- UI reports Preparing source, Decoding, Rendering captions, Encoding, Muxing audio/video, and Finalizing from deterministic timeline progress. A collapsible local diagnostics panel reports source/container/codecs/FPS/audio, output choice, frame counts, verified duration/audio, and effective render FPS. No media is uploaded.
- Fixed the Mediabunny export transform validation error by centralizing the preview/export `cover` mapping and including `fit: "cover"` alongside every project canvas width and height. The 9:16, 16:9, and 1:1 paths preserve source aspect ratio through cover fitting.

Worker note: the compositing module is isolated from the UI and takes only canvas context + immutable export request, so it can move to an `OffscreenCanvas` worker without changing caption math. This milestone keeps it on the main thread because `document.fonts` and the current canvas/font setup need browser verification together.

Verification: targeted export tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification is still required with a short MP4/WebM fixture to measure actual codec availability, A/V sync, and output playback in a target browser. Source media never leaves the device.

## Previous milestone: M6.5 — Multi-aspect-ratio preview and safe-area behavior

Complete:

- Added validated 9:16 vertical (default), 16:9 landscape, and 1:1 square project formats with immediate preview canvas updates and source-video cover fitting.
- Kept caption positioning normalized to the selected project canvas. Format changes preserve reachable relative positions, clamp wide caption blocks, preserve linked translation coordinates, and provide format-aware reset defaults.
- Centralized title/action, vertical social UI avoidance, and center guides by format. The toggle-controlled safe-area overlay is editor-only, pointer-transparent, and explicitly excluded from export/render data.
- Added regression coverage for all format dimensions/aspects, normalized position preservation and clamping, linked translation, safe-area configuration, editor-only overlay metadata, and recognition/timing immutability.

Verification: targeted format tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Previous milestone: M6 — Caption animations and style presets

Complete:

- Fixed M6 regressions: the always-visible verse-key marker is now an independent, default-off presentation toggle, and Arabic display text strips only source ayah markers without mutating the canonical corpus.
- Caption opacity and optional blur now derive from absolute video time in a memoized preview layer updated with `requestAnimationFrame`; seeking and pause apply the exact state immediately without page-wide frame renders.
- Added editor transition state with deterministic `none` and `fade` opacity calculation from each editable `CaptionSegment` range. The default is a restrained 225 ms fade in/out, with controls and reset; adjacent segments can visually crossfade without overlapping stored timing.
- Arabic, linked translation, and enabled caption backgrounds render from the same time-derived caption-layer opacity. Seeking/scrubbing computes the correct state directly from `currentTime`; no playback timers or interval loops are used.
- Added styling-only `CaptionStyleSchema`, four editable built-in presets (Minimal, Classic Mushaf, Cinematic, Social), and browser-local custom styles with save, apply, rename, delete, and validated JSON loading. Local styles contain no video, Quran text, or recognition data.
- Added regression coverage for transition defaults, fade/seek/none behavior, adjacent crossfade, animated backgrounds, preset application/editability, local-style lifecycle, and media-data exclusion.

Verification: targeted M6 tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Previous milestone: M5B — Caption positioning and timeline editing

Implemented:

- Caption position is editor state in normalized coordinates with constrained preview dragging, X/Y controls, reset, linked Arabic/translation layout, optional unlinked translation coordinates, and a non-rendered safe-area guide.
- The simple timeline shows duration, playhead, caption blocks, selected state, click-to-select/seek, playback-following active captions, and draggable selected-segment edges.
- Manual start/end edits are clamped to video bounds and neighboring segment boundaries, preserving `VerseAlignment` recognition timing. Reset timing restores each segment’s generated timing evidence; split/merge continues to use the edited display range.
- Keyboard basics include Space play/pause and 500ms left/right seeking outside text fields.

Boundary behavior: adjacent segment boundaries are clamped so segments remain ordered and non-overlapping; shared boundaries are not automatically moved.

## Current milestone: Configurable caption background

Complete:

- Removed the hardcoded forest-green caption fill and added independent background enabled, color, opacity, corner radius, and padding state with transparent defaults.
- Arabic/translation remain in one linked preview wrapper; background reset does not alter text outline settings.
- Added caption background defaults, style, reset, and linked-translation regression tests.

## Current milestone: Restore Saheeh International translation display

Complete:

- Exact root cause: QuranEnc’s live surah endpoint returns `{ result: [...] }` and string ayah numbers, while the provider expected a bare array with numeric ayah values. Its metadata endpoint likewise returns `{ translations: [...] }`, so live provider responses were rejected as invalid and resolved to `null`.
- The client also created caption segments from local Arabic before translation enrichment and never updated their translation field. The preview required that stale segment field, making translation invisible even after content enrichment.
- QuranEnc `english_saheeh` now parses the live response shape, converts ayah strings to numbers, maps by surah-local ayah number to `verseKey`, caches each surah, and reuses concurrent requests. Arabic remains sourced locally and is unaffected by provider failure.
- Translation enrichment updates caption state; split segments retain their parent `verseKeys` and full parent translation without inventing sub-verse text. Preview visibility is controlled independently by the Show translation toggle.
- Added opt-in runtime verification: `npm run check:translation:live` confirms non-empty Saheeh text for 93:1 without Quran Foundation credentials.

Manual retest still required: run the live check and exercise a recognized Surah 93 clip in the browser, including toggling translation off/on and splitting a long ayah.

## Current milestone: Saheeh International translation provider

Complete:

- Added the independent `getVerseArabic` / `getTranslation` content boundary.
- Added the QuranEnc `english_saheeh` provider as the default runtime translation source, with surah-level server cache, concurrent request reuse, and version metadata when QuranEnc supplies it.
- Arabic remains local and available when translation fetches fail; translation visibility is independently toggleable on the homepage.
- Quran Foundation remains available as an optional enrichment adapter.
- Added mocked deterministic provider tests and QuranEnc attribution/republication terms.

## Current milestone: Local canonical Hafs corpus

Complete:

- Replaced the prior quran-json display corpus with a verbatim Tanzil Uthmani Hafs source copy containing all 114 surahs and 6,236 ayat.
- Added synchronous `getVerse`, `getVerses`, and `getSurah` local content APIs. Recognition normalization remains derived and display-only canonical text is never mutated.
- The homepage resolves recognized ayat locally without Quran Foundation credentials. Translation remains unavailable rather than blocking Arabic.
- Quran Foundation support remains optional for enrichment, and font selection remains independent with explicit Unicode text/font compatibility.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Current milestone: M3C/M4 — Automatic Quran detection in the editor

Complete:

- The main local video flow now exposes `Detect Quran`; recognition dependencies and the Whisper model load only after that action.
- User-facing progress covers audio preparation, local model loading, local transcription, Quran matching, and caption preparation. The selected audio is explicitly processed locally and never uploaded.
- Recognized matches become browser-local verse alignments with verse keys, millisecond timing, confidence, and timing evidence metadata. Playback and scrubbing select the active alignment without treating Whisper chunk or breath boundaries as caption changes.
- Captions use the canonical local Hafs corpus; Saheeh International and available transliteration remain optional Quran Foundation enrichment.
- Added basic correction, rerun detection, retryable failures, and video replacement/clear invalidation and object-URL cleanup. The developer `/recognition` diagnostics route remains available.

Verification: full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Current milestone: M3B — Local browser transcription spike

Complete:

- M0 foundation documentation and shared Zod project schemas completed.
- Browser-local video picker added with `video/*` filtering and no upload or server-side source persistence.
- Native video playback added with browser controls, inline playback, metadata display, and clear/reselect behavior.
- Quran Foundation content adapter added for canonical Hafs Arabic, Saheeh International, optional transliteration, and verse metadata.
- Server-only OAuth client-credentials proxy added at `/api/quran/verse`; missing credentials show a clear setup state.
- Runtime CDN font profiles added for Uthmani/QPC Hafs, Madinah/QCF, IndoPak, and KFGQPC style. No Quran font files are stored locally.
- Caption preview now renders fetched content and lets the user choose among supported Quran typography profiles.
- Added normalization and supported-script/font profile tests.
- Object URLs are revoked when the selected video changes or the page unmounts.

M3A complete:

- Added a deterministic, UI-independent Hafs Quran matcher for timestamped Arabic transcript chunks.
- Matching normalization removes diacritics and selected orthographic differences without changing canonical display text.
- Monotonic contiguous sequence preference, fuzzy character matching, mid-ayah clips, confidence thresholds, and short-phrase ambiguity handling are covered by tests.
- Added a concise JSON CLI harness at `npm run recognize` (stdin or a JSON file path).
- Added the full offline corpus asset with source/license provenance in the corpus package boundary.

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` all pass. The build uses Webpack because this environment cannot run the default Turbopack CSS worker process.

Not in M3A: audio transcription, browser transcription, UI integration, timeline/editor controls, animations, rendering/export, auth, saved-project persistence, server processing, storage cleanup workers, or billing.

M3B complete:

- Added a developer-only `/recognition` route. A chosen `video/*` `File` is decoded via Web Audio and never uploaded to this application server or an inference API.
- Added the local recognition adapter behind `RecognitionTranscriber`; it uses `@huggingface/transformers` 3.8.1 and the multilingual `onnx-community/whisper-base` model, explicitly requesting Arabic transcription and timestamp chunks.
- Audio is downmixed/resampled to 16 kHz, split into 30-second local PCM windows with 3-second overlap, then its timestamped output is passed to the existing deterministic Quran matcher.
- The adapter tries WebGPU first when the browser advertises it, and transparently falls back to local WASM if initialization fails; browsers without `AudioContext` show an unsupported state.
- Model download/initialization progress and per-audio-chunk transcription progress are displayed. Transformers.js uses the normal browser Cache API when it is available, so model assets are retained by normal browser caching rules.
- The test panel reports surah, detected ayah range, approximate per-ayah timing, confidence, backend, and an optional collapsed raw Arabic transcript.

M3B measurement:

- Selected model: `onnx-community/whisper-base` (multilingual Whisper Base, ONNX/Transformers.js compatible).
- Approximate first q4 model download: 145 MB (124 MB merged q4 decoder + 18.8 MB q4 encoder + tokenizer/config assets, based on the model repository's published file sizes).
- WebGPU behavior: attempted when `navigator.gpu` exists; any initialization failure uses the browser-local WASM q4 fallback. No WebGPU capability was available to exercise in this headless development environment.
- Test fixture/transcription time: no audio/video fixture is stored in this repository, so a browser fixture measurement could not be made. The route measures and displays its elapsed local transcription time for the selected file.
- Recognition result: pending a local recitation fixture; the route feeds timestamped chunks directly to `recognizeTranscript` and displays its result without a server workaround.

M3B real browser test follow-up:

- A roughly 20-second Surah Ad-Duha recitation used local Whisper WebGPU and completed transcription in 7.5 seconds. Its output, including `وضحى`, `اللي`, `اسجى`, and `الأولات`, is now a deterministic regression fixture.
- Root cause: the full canonical offline Hafs corpus is present at runtime (114 surahs / 6,236 ayat), but the matcher required an exact first-word candidate seed, so `وضحى` did not seed `والضحى`; its four-ayah sequence cap also could not return all ayat 93:1–5 in one chunk. This was not a corpus, confidence aggregation, or global-threshold failure.
- Recognition after the fix: the regression fixture matches contiguous ayat 93:1–5 using bounded fuzzy first-word seeding, five-ayah sequence scoring, and the unchanged confidence threshold. Rejected matches now report their top candidate and explicit rejection reason on the developer-only route.
- Remaining limitation: browser runtime recognition must still be manually retested with the real recitation after this change.

M3B runtime detection regression fix:

- Replaced the unnecessary external-store subscription with mount-time state hydration. The server and first client render retain the checking state, then browser AudioContext/WebGPU support is read once after mount without unstable snapshot identities or rerender loops.

M3B noisy live-transcript matcher regression fix:

- Root cause: candidate generation only seeded on the first normalized transcript word and stopped at exact first-word hits. The live `وضحة` did not approximately seed `والضحى`, while the second chunk's `والأخرة` exact-seeded an unrelated 4:77 occurrence and excluded 93:4 before sequence scoring ran.
- Algorithm change: candidate retrieval now aggregates approximate similarity from every meaningful normalized token, keeps the 16 strongest ayah hits, expands each into same-surah contiguous window starts, then combines character similarity with ordered token-sequence similarity. The unchanged confidence threshold remains the final acceptance gate; a bounded 24-ayah character fallback is used only when token retrieval has no evidence.
- Live regression: the exact raw Whisper transcript and the matching two timestamped chunks both resolve consecutively to 93:1–5. Diagnostics now include the selected candidate even when rejected, retrieval path, score, character score, ordered-token score, and rejection reason.
- Matcher performance: the two-chunk live fixture completed in approximately 401 ms in the Node deterministic measurement; the regression test enforces a generous 1,500 ms upper bound for the full live-sized transcript search.
- Remaining limitation: manually rerun the real browser/WebGPU recitation after this matcher-only change.

M3B Quran-text timing alignment hardening:

- Real browser regression context: the 6:74–77 recitation begins around 0:07, with breaths/pauses around 0:16 inside 6:74 and 0:38 inside 6:76. Pauses, silence, and Whisper chunk boundaries are now never treated as ayah boundaries by themselves.
- Root cause of the missing 6:75: accepted Whisper chunks were greedily emitted independently and each chunk's full time span was split among its candidate ayat by canonical character length. A weak 6:75 chunk could be rejected after cursor advancement, while subsequent 6:76/77 chunks still established the displayed outer range; there was no passage-level reconstruction of the interior.
- New timing strategy: retain accepted monotonic same-surah candidate evidence as a contiguous Quran passage, fill its interior ayat, then monotonically fuzzy-align normalized ASR tokens to normalized canonical Quran tokens with ayah identities. Direct single-word ASR offsets are preferred when returned by Whisper; otherwise timestamps are assigned by token position inside timestamped text chunks. Unmatched interior ayat are interpolated between textual neighbours. Silence is only indirect timestamp context and never overrides text alignment.
- Result diagnostics now expose each ayah's timing-evidence source (`direct-asr-word`, `chunk-text-alignment`, or `interpolation`) and matched normalized text span. Output enforces ordered, unique, monotonic, in-duration ayat and trims unsupported outer candidate overreach without dropping supported interior ayat.
- Deterministic 6:74–77 regression coverage verifies ordered reconstruction including 6:75, the two mid-ayah breath cases, non-Quran leading silence, monotonic timing, and unequal durations. Existing noisy 93:1–5 and unrelated-Arabic rejection regressions continue to pass.
- Known limitation: word-level offsets depend on what the browser's Transformers.js Whisper build returns; multi-word ASR spans use token-position timing and interpolation is approximate for weakly transcribed ayat. Manual browser/WebGPU retest with the real 6:74–77 clip remains required.

## Current milestone: M5A — Editable caption segmentation and foundational styling

Complete:

- Recognition `VerseAlignment` remains separate from presentation `CaptionSegment` state. Long ayat are split at canonical Quran word boundaries into balanced readable chunks (up to eight words by default), avoiding tiny tail fragments; short ayat remain whole.
- Segment split/merge operations preserve exact canonical Arabic word order, source verse keys, monotonic timing, and explicit derived-timing labels. Split translation text is not fabricated or duplicated; it remains associated with the parent verse key.
- The preview now uses segments for playback selection and exposes split-at-word, merge-previous, and merge-next controls.
- Structured editor typography state provides Quran-safe Arabic font selection, size/color/opacity/alignment/line spacing, optional outline and shadow controls, independent translation visibility/font/size/color/opacity/spacing/outline/shadow controls, a transliteration placeholder, and reset-to-defaults. The former mandatory green outline is removed.
- Translation associations remain parent-verse associations; automatic split segments do not fabricate sub-verse English, and the preview only displays a full parent translation on a complete-ayah segment.
- Segment and typography schemas now validate the editor’s millisecond timing, source verse keys, word metadata, and structured style defaults directly.

Verification: targeted caption tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`.

M3B Quran-aware recognition normalization:

- Added a cached, internal-only Hafs recitation representation beside canonical display text and existing orthographic normalization. It deterministically tolerates hamzat al-wasl in connected speech, lam shamsiyyah assimilation, ASR-expanded shadda, silent Uthmani marks, and common hamza carrier spelling ambiguity. Madd letters and cross-word idgham consonants remain lexical evidence.
- Candidate retrieval, passage scoring, and timestamp-token alignment now compare both forms. Orthographic score remains the floor and the recitation score is a bounded corroborating boost; existing thresholds and monotonic timing logic are unchanged. The UI receives original ASR surface tokens for matched-text display, never an internal normalized or recitation form.
- Regression coverage keeps live 93:1–5, 6:74–77 reconstruction, unrelated-Arabic rejection, ambiguity handling, and bounded runtime. New unit and matcher tests cover connected wasl, sun-letter assimilation, gemination, hamza carrier ambiguity, and rejection of a short unrelated phrase.
- Added `docs/RECOGNITION.md`: future evaluation should compare generic Whisper with a Quran-specific speech-to-phoneme/phonetic model on held-out Hafs recitations. No model was added or downloaded.
## Current milestone: M8 — Optional account project sync

Complete:

- Added optional Supabase email/password sign up, sign in, and sign out UI without gating the local editor, recognition, export, or IndexedDB project save.
- Added explicit `Save to Account`, cloud project listing/open/delete, stable project identity mapping, schema-versioned metadata payloads, and timestamp conflict warning with local/cloud choice.
- Added a minimal `projects` migration with owner-derived `user_id`, Row Level Security, and no storage buckets. Source video, rendered exports, temporary blobs, and local Whisper models remain device-local.
- Added environment variable examples only; no Supabase secrets are committed.

Verification: targeted M8 tests pass; full test, typecheck, lint, build, and diff checks run at milestone handoff.

M5A first-caption onset regression fix:

- Root cause: when forced alignment was available, editor caption generation used `ForcedAlignment.captionSets` timing instead of the recognized `VerseAlignment` timing. A zero-valued forced set could therefore replace a detected non-zero Quran onset before preview lookup.
- Fix: pass recognized verse alignments into forced-alignment caption generation and preserve their exact millisecond start/end values; forced-set timing remains the fallback for callers without recognized alignments.

Verification: focused caption regression, full test, typecheck, lint, build, and diff checks pass.

## Current milestone: Strengthen Quran word highlighting defaults

Complete:

- New editor projects reset to `read-so-far`, Electric Lime `#B7FF00`, and 85% highlight intensity; persistence and caption-style schema defaults match the live editor default, so recognition/caption generation has no path that writes `off`.
- Existing projects with explicit saved `off` or `current-word` retain that choice. A legacy project with no stored highlight setting adopts the new default. Projects that explicitly stored the old automatic `off` cannot be distinguished from an intentional `off`, so those values are conservatively preserved.
- The Subtitles inspector now has six compact neon swatches, a custom color picker, and global or property-level segment intensity control.
- Preview and canvas export use the same highlight color/glow presentation resolver. The final verse ornament follows the final canonical word on terminal ayah pieces only; basmalah preludes remain numberless.
- Recognition, canonical Quran text, word timing, segment boundaries, and timeline geometry were not changed.

Verification: focused highlighting/style/storage/export regressions and `npx tsc --noEmit` pass. Browser media validation requires a local Quran video fixture and was not available in this environment.

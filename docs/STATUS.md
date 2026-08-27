# Status

## Current milestone: M2 — Quran Foundation content/fonts

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

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` all pass. The build uses Webpack because this environment cannot run the default Turbopack CSS worker process.

Not in M2: recognition, timeline/editor controls, animations, rendering/export, auth, saved-project persistence, server processing, storage cleanup workers, or billing.

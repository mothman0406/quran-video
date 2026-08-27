# Status

## Current milestone: M1 — Video + hardcoded Quran overlay

Complete:

- M0 foundation documentation and shared Zod project schemas completed.
- Browser-local video picker added with `video/*` filtering and no upload or server-side source persistence.
- Native video playback added with browser controls, inline playback, metadata display, and clear/reselect behavior.
- Fixed M1 Quran caption fixture added as an Arabic verse, reference, and English translation overlay.
- Object URLs are revoked when the selected video changes or the page unmounts.

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` all pass. The build uses Webpack because this environment cannot run the default Turbopack CSS worker process.

Not in M1: Quran Foundation API calls, recognition, timeline/editor controls, animations, rendering/export, auth, saved-project persistence, server processing, storage cleanup workers, or billing.

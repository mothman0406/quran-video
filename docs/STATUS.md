# Status

## Current milestone: M0 — Foundation

Complete:

- Product and architecture boundaries documented.
- Milestone sequence documented through M10.
- Shared Zod `ProjectSchema` updated for local source-video metadata, and `SavedProjectSchema` added to omit source media from durable project data.
- Local-first and ephemeral storage boundaries documented: browser-local source/editor state by default, temporary server media with cleanup, direct-to-user exports, and explicit metadata-only project saving.
- Lint and production build passing.

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` all pass. The build uses Webpack because this environment cannot run the default Turbopack CSS worker process.

Not in M0: editor UI, upload processing, Quran API calls, recognition, rendering, auth, persistence implementation, storage cleanup workers, or billing.

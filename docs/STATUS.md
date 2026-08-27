# Status

## Current milestone: M0 — Foundation

Complete:

- Product and architecture boundaries documented.
- Milestone sequence documented through M10.
- Shared Zod `ProjectSchema` added for source video, format, alignments, caption segments, visibility, positioning, typography, and transitions.
- Lint and production build passing.

Verification: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` all pass. The build uses Webpack because this environment cannot run the default Turbopack CSS worker process.

Not in M0: editor UI, upload processing, Quran API calls, recognition, rendering, auth, storage, or billing.

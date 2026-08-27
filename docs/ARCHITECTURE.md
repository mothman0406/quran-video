# Architecture

## Current foundation

- Next.js App Router with TypeScript and Tailwind.
- Shared project contract: `src/lib/schemas/project.ts` (Zod schemas plus inferred types).
- Planned client editor state: Zustand, with browser-local draft state where practical.
- Planned preview/rendering: Remotion Player and Remotion.

## Storage and media lifecycle

- The browser is the default home for the selected source video, its object URL, and active editor state. A source video is not uploaded or permanently stored server-side by default.
- Processing or rendering may upload a temporary copy only when a server-side job requires it. The job owns that media and must delete it after success, failure, cancellation, or expiry; cleanup is required before the job is considered complete.
- Rendered exports are streamed or returned as a one-time result for a browser download. Rendered exports are not retained as project assets by default.
- “Save Project” is an explicit opt-in action. Saving persists only the lightweight `SavedProject` metadata/settings projection; it never persists source video bytes or rendered exports.
- Reopening a saved project restores its metadata/settings and asks the user to reselect the original local video before preview, processing, or rendering can continue.

The project schema is the handoff boundary between upload, recognition, editing, preview, and rendering. `ProjectSchema` may include local source-video metadata for the active browser session; `SavedProjectSchema` deliberately omits it. Temporary server media is a job concern, not project state.

## Planned service boundaries

- Quran Foundation Content API supplies canonical Hafs text, translations, transliteration, and font data.
- FFmpeg and OpenAI transcription support recognition and media processing.
- Supabase owns auth and explicitly saved project metadata/settings; it is not the default source-video or export store.
- Stripe handles quotas and subscriptions after core editing/export works.

Milestone 0 defines these boundaries only; it does not implement upload, processing, cleanup, rendering, auth, or persistence behavior.

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

- `src/lib/quran/server.ts` is the server-only Quran Foundation adapter. It obtains a cached OAuth client-credentials token and calls the Content API; `src/app/api/quran/verse/route.ts` exposes only sanitized verse content to the browser.
- Quran Foundation Content API supplies canonical Hafs text, Saheeh International by default, transliteration, and font metadata. Font files are loaded directly from the Quran Foundation CDN at runtime.
- `src/lib/quran/content.ts` defines the content abstraction and profiles for Uthmani/QPC Hafs, Madinah/QCF, IndoPak, and KFGQPC style.
- M3B local recognition uses a browser-only Transformers.js Whisper adapter. It decodes the selected `File` through Web Audio, runs `onnx-community/whisper-base` on WebGPU when available (otherwise local WASM), and returns timestamped transcript chunks to the deterministic matcher. It does not send source audio to an application server or inference API.
- M3C/M4 editor integration converts matcher output into browser-local verse alignments, fetches canonical display content through the existing Quran Foundation route, and derives the active caption directly from video playback time. The `/recognition` route remains a developer diagnostic surface; the main editor is the normal entry point.
- Supabase owns auth and explicitly saved project metadata/settings; it is not the default source-video or export store.
- Stripe handles quotas and subscriptions after core editing/export works.

M2 implements the Quran Foundation content boundary while preserving browser-local video behavior. Missing server credentials return setup state; secrets and access tokens never cross the route boundary.

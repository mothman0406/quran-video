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

- `src/lib/quran/local.ts` is the synchronous canonical provider. It indexes the immutable Tanzil Uthmani Hafs corpus by verse key and exposes `getVerse`, `getVerses`, and `getSurah`; the API route is only a local compatibility boundary.
- `src/lib/quran/translations.ts` defines the independent translation boundary (`getTranslation(verseKey, translationId)`) and uses QuranEnc's surah endpoint for the default Saheeh International translation. It keeps a server-side TTL cache and returns source/version metadata without exposing provider details to UI components. `src/lib/quran/server.ts` remains an optional Quran Foundation enrichment adapter. Its credentials and availability cannot affect Arabic display. Fonts remain runtime CDN assets.
- `src/lib/quran/content.ts` defines the content abstraction and profiles for Uthmani/QPC Hafs, Madinah/QCF, IndoPak, and KFGQPC style.
- M3B local recognition uses a browser-only Transformers.js Whisper adapter. It decodes the selected `File` through Web Audio, runs `onnx-community/whisper-base` on WebGPU when available (otherwise local WASM), and returns timestamped transcript chunks to the deterministic matcher. It does not send source audio to an application server or inference API.
- M3C/M4 editor integration converts matcher output into browser-local verse alignments, resolves canonical Arabic locally at once, and derives the active caption directly from video playback time. Optional translation enrichment can fail independently. The `/recognition` route remains a developer diagnostic surface; the main editor is the normal entry point.
- M5A adds an editor-only `CaptionSegment` layer in `src/lib/editor/captions.ts`. Segments contain presentation word slices and preserve their parent `verseKeys`; split boundaries are Quran whitespace boundaries, with derived timing marked explicitly. Automatic chunks are balanced under the readable-word limit to avoid tiny tails. A split segment does not invent or duplicate English sub-sentence text: its parent verse association remains available through `verseKeys`, and the full translation is shown only when the segment carries the complete-ayah association.
- M5A typography is held in structured editor state using `DEFAULT_TYPOGRAPHY` and validated by `TypographySchema`. Arabic and translation controls are independent, with a neutral default and no mandatory outline; transliteration remains a visibility/control placeholder until a provider is available. `resetTypography()` returns a fresh default object.
- M5B editor state adds normalized caption positioning (`x`, `y`, independent translation coordinates, and a link flag) and editable `CaptionSegment` display timing. Timing changes are clamped against video and neighboring segment boundaries; `VerseAlignment` timestamps remain recognition evidence, and reset timing restores `CaptionSegment.timingEvidence` timestamps. The preview safe-area guide is UI-only.
- M6 adds `TransitionSettings` and styling-only `CaptionStyleSchema` state. Caption opacity is a pure function of editable segment timing, current video time, and transition settings, so direct seeking is deterministic. Adjacent segments may overlap only in preview layers during a short crossfade; their editable ranges remain non-overlapping. Built-in presets and browser-local custom styles are plain snapshots of typography, positioning, background, and transition state; they contain no source video or Quran/recognition data.
- Supabase owns auth and explicitly saved project metadata/settings; it is not the default source-video or export store.
- Stripe handles quotas and subscriptions after core editing/export works.

Canonical Arabic is local-first and credential-free. Quran Foundation remains an optional enrichment boundary; secrets and access tokens never cross the route boundary.

# Architecture

## Current foundation

- Next.js App Router with TypeScript and Tailwind.
- Shared project contract: `src/lib/schemas/project.ts` (Zod schema plus inferred types).
- Planned client editor state: Zustand.
- Planned preview/rendering: Remotion Player and Remotion.

## Planned boundaries

- Quran Foundation Content API supplies canonical Hafs text, translations, transliteration, and font data.
- FFmpeg and OpenAI transcription support recognition and media processing.
- Supabase owns auth, projects, and video storage.
- Stripe handles quotas and subscriptions after core editing/export works.

The project schema is the handoff boundary between upload, recognition, editing, preview, and rendering. Milestone 0 defines that boundary only; it does not implement those systems.

# Decisions

- **Quran text:** Hafs only for V1; no non-Hafs qiraat in the initial product.
- **Content source:** use Quran Foundation Content API when content integration begins; do not duplicate canonical text in the app.
- **Translation default:** Saheeh International, with translation and transliteration independently optional.
- **Timing model:** start at ayah-level; preserve room for later split, merge, and manual timing edits.
- **Initial canvas:** vertical 9:16, with centered Arabic and translation directly below by default.
- **Typography:** model Quran typography as a user choice so Madinah/QCF, Uthmani, IndoPak, and KFGQPC can be added without changing project shape.
- **Project contract:** define shared data with Zod and infer TypeScript types from the schema.
- **Storage model:** local-first and ephemeral by default. Source videos and active editor state stay in the browser where practical; server-side media is temporary and must be deleted after its processing/rendering job completes.
- **Export delivery:** exports download directly to the user and are not retained as project assets by default.
- **Saved projects:** “Save Project” is explicit opt-in. Initially, persist only the lightweight `SavedProject` metadata/settings projection; never persist source videos or rendered exports. Reopening may require reselecting the original local video.
- **Scope:** integrations are staged; M0 creates no external service clients or editor behavior.

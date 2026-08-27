# Status

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

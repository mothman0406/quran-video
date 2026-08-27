# Status

## Current milestone: M3C/M4 — Automatic Quran detection in the editor

Complete:

- The main local video flow now exposes `Detect Quran`; recognition dependencies and the Whisper model load only after that action.
- User-facing progress covers audio preparation, local model loading, local transcription, Quran matching, and caption preparation. The selected audio is explicitly processed locally and never uploaded.
- Recognized matches become browser-local verse alignments with verse keys, millisecond timing, confidence, and timing evidence metadata. Playback and scrubbing select the active alignment without treating Whisper chunk or breath boundaries as caption changes.
- Captions fetch canonical Quran Foundation content for display: Hafs Arabic, Saheeh International, and available transliteration. Missing credentials leave recognition intact and show setup guidance.
- Added basic correction, rerun detection, retryable failures, and video replacement/clear invalidation and object-URL cleanup. The developer `/recognition` diagnostics route remains available.

Verification: full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

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

M3B real browser test follow-up:

- A roughly 20-second Surah Ad-Duha recitation used local Whisper WebGPU and completed transcription in 7.5 seconds. Its output, including `وضحى`, `اللي`, `اسجى`, and `الأولات`, is now a deterministic regression fixture.
- Root cause: the full canonical offline Hafs corpus is present at runtime (114 surahs / 6,236 ayat), but the matcher required an exact first-word candidate seed, so `وضحى` did not seed `والضحى`; its four-ayah sequence cap also could not return all ayat 93:1–5 in one chunk. This was not a corpus, confidence aggregation, or global-threshold failure.
- Recognition after the fix: the regression fixture matches contiguous ayat 93:1–5 using bounded fuzzy first-word seeding, five-ayah sequence scoring, and the unchanged confidence threshold. Rejected matches now report their top candidate and explicit rejection reason on the developer-only route.
- Remaining limitation: browser runtime recognition must still be manually retested with the real recitation after this change.

M3B runtime detection regression fix:

- Replaced the unnecessary external-store subscription with mount-time state hydration. The server and first client render retain the checking state, then browser AudioContext/WebGPU support is read once after mount without unstable snapshot identities or rerender loops.

M3B noisy live-transcript matcher regression fix:

- Root cause: candidate generation only seeded on the first normalized transcript word and stopped at exact first-word hits. The live `وضحة` did not approximately seed `والضحى`, while the second chunk's `والأخرة` exact-seeded an unrelated 4:77 occurrence and excluded 93:4 before sequence scoring ran.
- Algorithm change: candidate retrieval now aggregates approximate similarity from every meaningful normalized token, keeps the 16 strongest ayah hits, expands each into same-surah contiguous window starts, then combines character similarity with ordered token-sequence similarity. The unchanged confidence threshold remains the final acceptance gate; a bounded 24-ayah character fallback is used only when token retrieval has no evidence.
- Live regression: the exact raw Whisper transcript and the matching two timestamped chunks both resolve consecutively to 93:1–5. Diagnostics now include the selected candidate even when rejected, retrieval path, score, character score, ordered-token score, and rejection reason.
- Matcher performance: the two-chunk live fixture completed in approximately 401 ms in the Node deterministic measurement; the regression test enforces a generous 1,500 ms upper bound for the full live-sized transcript search.
- Remaining limitation: manually rerun the real browser/WebGPU recitation after this matcher-only change.

M3B Quran-text timing alignment hardening:

- Real browser regression context: the 6:74–77 recitation begins around 0:07, with breaths/pauses around 0:16 inside 6:74 and 0:38 inside 6:76. Pauses, silence, and Whisper chunk boundaries are now never treated as ayah boundaries by themselves.
- Root cause of the missing 6:75: accepted Whisper chunks were greedily emitted independently and each chunk's full time span was split among its candidate ayat by canonical character length. A weak 6:75 chunk could be rejected after cursor advancement, while subsequent 6:76/77 chunks still established the displayed outer range; there was no passage-level reconstruction of the interior.
- New timing strategy: retain accepted monotonic same-surah candidate evidence as a contiguous Quran passage, fill its interior ayat, then monotonically fuzzy-align normalized ASR tokens to normalized canonical Quran tokens with ayah identities. Direct single-word ASR offsets are preferred when returned by Whisper; otherwise timestamps are assigned by token position inside timestamped text chunks. Unmatched interior ayat are interpolated between textual neighbours. Silence is only indirect timestamp context and never overrides text alignment.
- Result diagnostics now expose each ayah's timing-evidence source (`direct-asr-word`, `chunk-text-alignment`, or `interpolation`) and matched normalized text span. Output enforces ordered, unique, monotonic, in-duration ayat and trims unsupported outer candidate overreach without dropping supported interior ayat.
- Deterministic 6:74–77 regression coverage verifies ordered reconstruction including 6:75, the two mid-ayah breath cases, non-Quran leading silence, monotonic timing, and unequal durations. Existing noisy 93:1–5 and unrelated-Arabic rejection regressions continue to pass.
- Known limitation: word-level offsets depend on what the browser's Transformers.js Whisper build returns; multi-word ASR spans use token-position timing and interpolation is approximate for weakly transcribed ayat. Manual browser/WebGPU retest with the real 6:74–77 clip remains required.

M3B Quran-aware recognition normalization:

- Added a cached, internal-only Hafs recitation representation beside canonical display text and existing orthographic normalization. It deterministically tolerates hamzat al-wasl in connected speech, lam shamsiyyah assimilation, ASR-expanded shadda, silent Uthmani marks, and common hamza carrier spelling ambiguity. Madd letters and cross-word idgham consonants remain lexical evidence.
- Candidate retrieval, passage scoring, and timestamp-token alignment now compare both forms. Orthographic score remains the floor and the recitation score is a bounded corroborating boost; existing thresholds and monotonic timing logic are unchanged. The UI receives original ASR surface tokens for matched-text display, never an internal normalized or recitation form.
- Regression coverage keeps live 93:1–5, 6:74–77 reconstruction, unrelated-Arabic rejection, ambiguity handling, and bounded runtime. New unit and matcher tests cover connected wasl, sun-letter assimilation, gemination, hamza carrier ambiguity, and rejection of a short unrelated phrase.
- Added `docs/RECOGNITION.md`: future evaluation should compare generic Whisper with a Quran-specific speech-to-phoneme/phonetic model on held-out Hafs recitations. No model was added or downloaded.

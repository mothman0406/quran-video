# Status

## Current milestone: M7A — Client-side video export technical spike

Complete:

- The MediaRecorder spike failed manual testing: output was laggy/choppy and omitted source audio. It is deleted and is no longer callable by the normal export action.
- Selected stack: Mediabunny 1.55.x as the maintained, browser-local MP4/WebM demuxing/muxing and WebCodecs integration layer. It reads the selected `File` incrementally via `BlobSource`, decodes video/audio with its WebCodecs sinks, and muxes a final local blob. This replaced a separate MP4Box/mp4-muxer pairing because one maintained library owns both container directions and codec capability checks.
- The lazy-loaded offline renderer builds a frame schedule from source presentation timestamps and detected FPS (CFR when available; 30 FPS fallback), then decodes, composites, and encodes one frame at a time. It neither starts playback nor uses `requestAnimationFrame` as an export clock; output timing is deterministic and covers the full source timeline.
- Caption composition includes source cover fitting, Quran Arabic, translation/transliteration visibility, typography, outline/shadow/background, linked/unlinked positions, verse number, and the same `captionVisualStatesAtTime` interpolation used by preview. Editor-only safe-area guides never enter export configuration.
- MP4 H.264/AAC is selected only after runtime codec capability checks. If unavailable, VP9/Opus WebM is selected; the filename and MIME type match the actual container. Compatible AAC/Opus input audio is packet-remuxed; other supported audio is decoded/re-encoded locally. The result is demuxed once more before download and export fails if a source containing audio produces no output audio.
- The selected Quran font is loaded and verified with `document.fonts` before demuxing. Page-specific Madinah/QCF fonts are explicitly rejected instead of allowing fallback/corrupt glyphs. Frames and audio samples are released incrementally; cancellation disposes input/output resources through one cleanup boundary.
- UI reports Preparing source, Decoding, Rendering captions, Encoding, Muxing audio/video, and Finalizing from deterministic timeline progress. A collapsible local diagnostics panel reports source/container/codecs/FPS/audio, output choice, frame counts, verified duration/audio, and effective render FPS. No media is uploaded.
- Fixed the Mediabunny export transform validation error by centralizing the preview/export `cover` mapping and including `fit: "cover"` alongside every project canvas width and height. The 9:16, 16:9, and 1:1 paths preserve source aspect ratio through cover fitting.

Worker note: the compositing module is isolated from the UI and takes only canvas context + immutable export request, so it can move to an `OffscreenCanvas` worker without changing caption math. This milestone keeps it on the main thread because `document.fonts` and the current canvas/font setup need browser verification together.

Verification: targeted export tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification is still required with a short MP4/WebM fixture to measure actual codec availability, A/V sync, and output playback in a target browser. Source media never leaves the device.

## Previous milestone: M6.5 — Multi-aspect-ratio preview and safe-area behavior

Complete:

- Added validated 9:16 vertical (default), 16:9 landscape, and 1:1 square project formats with immediate preview canvas updates and source-video cover fitting.
- Kept caption positioning normalized to the selected project canvas. Format changes preserve reachable relative positions, clamp wide caption blocks, preserve linked translation coordinates, and provide format-aware reset defaults.
- Centralized title/action, vertical social UI avoidance, and center guides by format. The toggle-controlled safe-area overlay is editor-only, pointer-transparent, and explicitly excluded from export/render data.
- Added regression coverage for all format dimensions/aspects, normalized position preservation and clamping, linked translation, safe-area configuration, editor-only overlay metadata, and recognition/timing immutability.

Verification: targeted format tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Previous milestone: M6 — Caption animations and style presets

Complete:

- Fixed M6 regressions: the always-visible verse-key marker is now an independent, default-off presentation toggle, and Arabic display text strips only source ayah markers without mutating the canonical corpus.
- Caption opacity and optional blur now derive from absolute video time in a memoized preview layer updated with `requestAnimationFrame`; seeking and pause apply the exact state immediately without page-wide frame renders.
- Added editor transition state with deterministic `none` and `fade` opacity calculation from each editable `CaptionSegment` range. The default is a restrained 225 ms fade in/out, with controls and reset; adjacent segments can visually crossfade without overlapping stored timing.
- Arabic, linked translation, and enabled caption backgrounds render from the same time-derived caption-layer opacity. Seeking/scrubbing computes the correct state directly from `currentTime`; no playback timers or interval loops are used.
- Added styling-only `CaptionStyleSchema`, four editable built-in presets (Minimal, Classic Mushaf, Cinematic, Social), and browser-local custom styles with save, apply, rename, delete, and validated JSON loading. Local styles contain no video, Quran text, or recognition data.
- Added regression coverage for transition defaults, fade/seek/none behavior, adjacent crossfade, animated backgrounds, preset application/editability, local-style lifecycle, and media-data exclusion.

Verification: targeted M6 tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Previous milestone: M5B — Caption positioning and timeline editing

Implemented:

- Caption position is editor state in normalized coordinates with constrained preview dragging, X/Y controls, reset, linked Arabic/translation layout, optional unlinked translation coordinates, and a non-rendered safe-area guide.
- The simple timeline shows duration, playhead, caption blocks, selected state, click-to-select/seek, playback-following active captions, and draggable selected-segment edges.
- Manual start/end edits are clamped to video bounds and neighboring segment boundaries, preserving `VerseAlignment` recognition timing. Reset timing restores each segment’s generated timing evidence; split/merge continues to use the edited display range.
- Keyboard basics include Space play/pause and 500ms left/right seeking outside text fields.

Boundary behavior: adjacent segment boundaries are clamped so segments remain ordered and non-overlapping; shared boundaries are not automatically moved.

## Current milestone: Configurable caption background

Complete:

- Removed the hardcoded forest-green caption fill and added independent background enabled, color, opacity, corner radius, and padding state with transparent defaults.
- Arabic/translation remain in one linked preview wrapper; background reset does not alter text outline settings.
- Added caption background defaults, style, reset, and linked-translation regression tests.

## Current milestone: Restore Saheeh International translation display

Complete:

- Exact root cause: QuranEnc’s live surah endpoint returns `{ result: [...] }` and string ayah numbers, while the provider expected a bare array with numeric ayah values. Its metadata endpoint likewise returns `{ translations: [...] }`, so live provider responses were rejected as invalid and resolved to `null`.
- The client also created caption segments from local Arabic before translation enrichment and never updated their translation field. The preview required that stale segment field, making translation invisible even after content enrichment.
- QuranEnc `english_saheeh` now parses the live response shape, converts ayah strings to numbers, maps by surah-local ayah number to `verseKey`, caches each surah, and reuses concurrent requests. Arabic remains sourced locally and is unaffected by provider failure.
- Translation enrichment updates caption state; split segments retain their parent `verseKeys` and full parent translation without inventing sub-verse text. Preview visibility is controlled independently by the Show translation toggle.
- Added opt-in runtime verification: `npm run check:translation:live` confirms non-empty Saheeh text for 93:1 without Quran Foundation credentials.

Manual retest still required: run the live check and exercise a recognized Surah 93 clip in the browser, including toggling translation off/on and splitting a long ayah.

## Current milestone: Saheeh International translation provider

Complete:

- Added the independent `getVerseArabic` / `getTranslation` content boundary.
- Added the QuranEnc `english_saheeh` provider as the default runtime translation source, with surah-level server cache, concurrent request reuse, and version metadata when QuranEnc supplies it.
- Arabic remains local and available when translation fetches fail; translation visibility is independently toggleable on the homepage.
- Quran Foundation remains available as an optional enrichment adapter.
- Added mocked deterministic provider tests and QuranEnc attribution/republication terms.

## Current milestone: Local canonical Hafs corpus

Complete:

- Replaced the prior quran-json display corpus with a verbatim Tanzil Uthmani Hafs source copy containing all 114 surahs and 6,236 ayat.
- Added synchronous `getVerse`, `getVerses`, and `getSurah` local content APIs. Recognition normalization remains derived and display-only canonical text is never mutated.
- The homepage resolves recognized ayat locally without Quran Foundation credentials. Translation remains unavailable rather than blocking Arabic.
- Quran Foundation support remains optional for enrichment, and font selection remains independent with explicit Unicode text/font compatibility.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Current milestone: M3C/M4 — Automatic Quran detection in the editor

Complete:

- The main local video flow now exposes `Detect Quran`; recognition dependencies and the Whisper model load only after that action.
- User-facing progress covers audio preparation, local model loading, local transcription, Quran matching, and caption preparation. The selected audio is explicitly processed locally and never uploaded.
- Recognized matches become browser-local verse alignments with verse keys, millisecond timing, confidence, and timing evidence metadata. Playback and scrubbing select the active alignment without treating Whisper chunk or breath boundaries as caption changes.
- Captions use the canonical local Hafs corpus; Saheeh International and available transliteration remain optional Quran Foundation enrichment.
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

## Current milestone: M5A — Editable caption segmentation and foundational styling

Complete:

- Recognition `VerseAlignment` remains separate from presentation `CaptionSegment` state. Long ayat are split at canonical Quran word boundaries into balanced readable chunks (up to eight words by default), avoiding tiny tail fragments; short ayat remain whole.
- Segment split/merge operations preserve exact canonical Arabic word order, source verse keys, monotonic timing, and explicit derived-timing labels. Split translation text is not fabricated or duplicated; it remains associated with the parent verse key.
- The preview now uses segments for playback selection and exposes split-at-word, merge-previous, and merge-next controls.
- Structured editor typography state provides Quran-safe Arabic font selection, size/color/opacity/alignment/line spacing, optional outline and shadow controls, independent translation visibility/font/size/color/opacity/spacing/outline/shadow controls, a transliteration placeholder, and reset-to-defaults. The former mandatory green outline is removed.
- Translation associations remain parent-verse associations; automatic split segments do not fabricate sub-verse English, and the preview only displays a full parent translation on a complete-ayah segment.
- Segment and typography schemas now validate the editor’s millisecond timing, source verse keys, word metadata, and structured style defaults directly.

Verification: targeted caption tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`.

M3B Quran-aware recognition normalization:

- Added a cached, internal-only Hafs recitation representation beside canonical display text and existing orthographic normalization. It deterministically tolerates hamzat al-wasl in connected speech, lam shamsiyyah assimilation, ASR-expanded shadda, silent Uthmani marks, and common hamza carrier spelling ambiguity. Madd letters and cross-word idgham consonants remain lexical evidence.
- Candidate retrieval, passage scoring, and timestamp-token alignment now compare both forms. Orthographic score remains the floor and the recitation score is a bounded corroborating boost; existing thresholds and monotonic timing logic are unchanged. The UI receives original ASR surface tokens for matched-text display, never an internal normalized or recitation form.
- Regression coverage keeps live 93:1–5, 6:74–77 reconstruction, unrelated-Arabic rejection, ambiguity handling, and bounded runtime. New unit and matcher tests cover connected wasl, sun-letter assimilation, gemination, hamza carrier ambiguity, and rejection of a short unrelated phrase.
- Added `docs/RECOGNITION.md`: future evaluation should compare generic Whisper with a Quran-specific speech-to-phoneme/phonetic model on held-out Hafs recitations. No model was added or downloaded.

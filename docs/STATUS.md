# Status

## Current milestone: Display detected FastConformer basmalah prelude

Complete:

- Extended the shared editable `CaptionSegment` model with explicit Quran
  `contentKind` values. A `basmalah-prelude` has no fake ayah/verse key and
  uses canonical Hafs Arabic from the Quran content module.
- After valid FastConformer timing has been promoted, the editor creates that
  segment only when its optional prelude is available, acoustically selected,
  finite, positive-length, and strictly before the first canonical ayah. Ayah
  timing remains unchanged; an acoustic pause is left caption-free.
- A first canonical ayah that is itself the basmalah is recognized by canonical
  content semantics, so no second prelude is generated. An absent selection
  creates no placeholder.
- Preview, timeline, manual timing editing, and export consume the same
  segment. The timeline labels it “Basmalah”; it uses normal Quran caption
  styling and has no ayah-number label. Debug now reports `DISPLAY_PRELUDE`.

Verification: `npm test` (127 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning; lint retains four existing
unused legacy-timing helper warnings.

## Previous milestone: Remove legacy Quran timing pipeline

Complete:

- Removed the Darten CTC browser runner, its 355 MB model URL/cache path, the
  micro-ASR timing recovery runner, the timing-lab CTC debug path, and their
  dedicated tests. Shared CTC forced-alignment code remains because the live
  Tilawa FastConformer target/alignment path uses it.
- The editor now identifies the canonical passage with the unchanged
  whole-recording Whisper matcher, then runs FastConformer directly. Its
  structurally valid ayah timings are the only automatic `CaptionSegment[]`
  source. Whisper timestamps do not take part in authoritative timing.
- FastConformer failure now yields a typed recoverable `quran-timing` failure;
  the editor retains the selected video and existing manual state, generates no
  fallback or synthetic captions, and allows retry. Production debug contains
  `AUTHORITATIVE_TIMING_ENGINE`, `FASTCONFORMER_ALIGNMENT`,
  `AUTHORITATIVE_CAPTIONS`, and `ACTUAL_PREVIEW` only.
- Retained VAD for the FastConformer source-window constraint and retained the
  generic optional-prelude handling unchanged.

Verification: `npm test` (123 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
non-fatal VAD ONNX Runtime dynamic-require warning.

## Previous milestone: FastConformer primary Quran timing

Complete:

- Promoted Tilawa FastConformer from development shadow to the primary automatic timing engine after the unchanged Whisper passage matcher has produced the final canonical span. One central selector validates completed inference/alignment, exact canonical ayah coverage, finite contiguous monotonic intervals, source-duration outer boundaries, canonical ayah-one onset, and optional-prelude completion. It deliberately does not compare or vote against Darten, Whisper timestamps, evidence-weighted timing, or forced-alignment confidence scores.
- Preserved `legacy-fallback` as the existing production timing path for model/runtime/assets/target/inference/alignment or structural failures, with the exact failure reason recorded. Darten, Whisper timing, the global solver, micro-ASR, and legacy CTC remain present as fallback/diagnostic infrastructure.
- The browser runner applies FastConformer’s window start exactly once through forced alignment; FastConformer ayah timings remain absolute media timestamps. No legacy solver is re-run over a valid result. The selected boundaries generate exactly one whole-ayah `CaptionSegment[]`, which remains the shared and editable preview/timeline/export authority.
- Debug now exposes `AUTHORITATIVE_TIMING_ENGINE`, `FASTCONFORMER_RAW_ALIGNMENT`, `AUTHORITATIVE_CAPTIONS`, and `LEGACY_TIMING_DIAGNOSTIC` separately. Manual edits still modify only the editable segment array and are never overwritten by a later automatic result.
- Added production-path selector coverage for valid FastConformer promotion despite deliberately disagreeing legacy word/Darten timings, unavailable/incomplete fallback, optional absent basmalah ownership, one-time frame/crop offset behavior, contiguous no-`+1 ms` timing, and shared preview/timeline/export/manual-edit segments.
- Real-browser validation observations retained for the promoted recordings: 6:74–77 starts were approximately 9,600 / 21,668 / 31,978 / 44,765 ms against the supplied approximate references 9,660 / 21,696 / 32,064 / 44,832; 69:19–32 followed the user-edited/acoustic boundaries without collapsed ayat; 93:1–5 selected an absent optional prelude with canonical word one at 1,631 ms; and 3:33–35 produced 2,496 / 9,194 / 14,537 ms while Tilawa independently detected that range at 0.9772. These are validation observations, not asserted human ground truth where no manual labels exist.

Verification: `npm test` (174 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: Optional FastConformer leading basmalah

Complete:

- Reclassified any lexical Tilawa-table prefix before the selected canonical
  Quran span as an explicit optional, non-canonical prelude. In the pinned
  93:1 table this is `بسم الله الرحمن الرحيم`; its five BPE tokens no longer
  receive canonical-word-one ownership.
- After one FastConformer inference, the shadow now evaluates canonical-only
  and prelude-plus-canonical forced targets. It compares their mean CTC
  forced-path log posterior per acoustic frame, rather than a raw summed path
  score, and exposes both diagnostics plus the selected prelude timing.
- Canonical ayah timing remains diagnostic-only and starts at the first
  canonical token in either candidate. No production timing, passage identity,
  Whisper, Darten, VAD, `VerseAlignment`, or `CaptionSegment` code changed.
- Added regression coverage for the pinned 93:1 token ownership and for a
  forced prelude path whose Quran word one begins after the prelude.

Verification: `npm test` (170 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning.

## Current milestone: FastConformer Surah 93 target construction

Complete:

- Traced the pinned Tilawa `93:1:1` table: it intentionally begins with the
  basmalah (`بسم الله الرحمن الرحيم والضحي`), whereas the display ayah begins
  with `والضحي`. The lexical comparison now uses Tilawa's bundled `text_clean`
  source, retains every published target token, and assigns the sanctioned
  first-ayah prefix monotonically to canonical word one.
- Used that same source field for the `93:4` standalone hamza representation
  (`ء`), avoiding a broader application Arabic normalizer. The FastConformer
  shadow remains diagnostic-only and does not affect production timing,
  passage identification, `VerseAlignment`, or `CaptionSegment` generation.
- Added pinned-asset regression vectors for 93:1–5, including complete target
  construction, explicit 93:1 first/last word-one ownership, and non-empty
  target coverage. The existing 6:74–77 and 69:19–32 target constructions
  continue to succeed against the pinned assets.

Verification: `npm test` (169 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning. The requested
real-browser 93:1–5 rerun remains pending because this workspace contains no
affected recording fixture; it should confirm `fastConformerShadow.status ===
"complete"`, a positive target-token count, and a positive frame count.

## Current milestone: Quran acoustic-alignment research and FastConformer shadow

Complete:

- Preserved the first successful real-browser FastConformer shadow run for the
  66,083 ms Surah 6:74–77 recording: upstream Tilawa reports 6:74–77 at
  0.9754 and FastConformer ayah starts are 9,600 / 21,668 / 31,978 / 44,765 ms.
  It remains development-shadow-only and does not affect identity,
  `VerseAlignment`, `CaptionSegment`, preview, timeline, or export.
- Added a concise `REAL ALIGNMENT COMPARISON` debug section, explicit
  uncalibrated `forcedAlignmentMeanScore` naming, complete FastConformer run
  quality fields, and a development-only four-recording manual-label registry.
  Evaluation reports absolute-error and structural metrics only where manual
  truth exists; unknown fixtures remain unknown.

- Audited QuranCaption's noncommercial phoneme/VAD/n-gram/substring-DP
  architecture and separately audited Tilawa's public FastConformer BPE CTC
  contract, benchmark harness, and commercial license boundary. QuranCaption
  application code remains study-only; no code was copied or adapted.
- Added a lazy, cached, development-only FastConformer shadow using the public
  CC-BY-4.0 `acibZ/tilawa-quran-onnx` 88.3 MB model plus exact public Quran BPE
  targets. It runs against the same decoded 16 kHz mono PCM, returns logits
  metadata/greedy transcript/known range/explicit score semantics/runtime, and forces the
  already-known whole passage globally into frame-exact canonical word/ayah
  timings. It cannot modify passage identity, `VerseAlignment`, or
  `CaptionSegment` timing.
- Added target-round-trip and no-`+1 ms` frame-exact regression coverage, and
  expanded the real-evaluation tool to report FastConformer separately.
- Hardened the development-only FastConformer asset path: all public assets
  remain pinned to commit `0cd79471524bc9cfa1c9296055242a935a1873e4`, are
  byte-validated and stored under pinned Cache API keys, and use module-level
  single-flight loading. Cold resolver requests are serialized because a live
  Hugging Face resolver trace returned HTTP 429 with `maximum queue size
  reached` before the Xet CDN redirect. A 429 now honors `Retry-After` when
  present, otherwise retries twice with deterministic 1 s/2 s backoff, and
  reports host/status/attempt/retry/cache/byte/time diagnostics.
- Kept the real-fixture limitation explicit: one real browser run and
  approximate Surah 6 references do not justify promotion; the remaining
  recordings still require source audio and verified human labels.

Verification: `npm test` (168 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal VAD ONNX Runtime dynamic-require warning. Real-browser
additional FastConformer execution and human-label evaluation remain required
before any promotion.

## Current milestone: Recognition/timing audit and evidence-weighted shadow

Complete:

- Audited every supplied real alignment export (6:74–77 and 69:19–32), all
  timing evidence paths, and the upstream Darten/base-Wav2Vec2 CTC contract.
  The CTC input/preprocessing/vocabulary/frame-rate implementation is
  compatible with upstream; the forced path is nevertheless too low-confidence
  to be a timing authority for these Quran recordings.
- Isolated the Surah 6 regression: late low-confidence CTC starts became hard
  corridors, excluding 21,696/32,064 ms lexical-VAD evidence. The 44,832 ms
  rejection message was misleading: VAD existed; the legacy coherence rule
  failed. Candidate acceptance and diagnostics now share one VAD-in-interval
  predicate.
- Added free greedy CTC decode diagnostics before target forcing, a local-only
  label/evaluation harness, and a deterministic evidence-weighted global
  shadow resolver. It is emitted in alignment debug but does not generate
  production captions. Replay of the supplied Surah 6 data changes median
  approximate boundary error from 7,608 ms to 160 ms; Surah 69 is comparison
  only pending human labels.

Verification: targeted CTC/boundary tests and `npx tsc --noEmit` pass.
Promotion is blocked on verified labels and fresh free-decode diagnostics for
the real recording suite; no authoritative timing behavior changed.

## Current milestone: Validate accepted Quran timing evidence

Complete:

- Replaced the impossible raw-CTC-span caption-containment assertion with a
  source-aware final-boundary trace. Each ayah now records its CTC baseline,
  final start/source, accepted evidence, and rejected or overridden evidence.
- CTC remains structurally validated before it can serve as the chunk-fallback
  scaffold. A local override still requires canonical order, a hard corridor,
  and VAD corroboration; rejected CTC proposals stay diagnostic only.
- Added the Surah 69:19–32 failure regression: a 14,148 ms CTC proposal for
  69:20 is validly refined to 9,504 ms, records the CTC proposal as
  overridden, keeps the raw 69:19 tail for diagnostics, and generates
  contiguous non-collapsed captions without collision repair.

Verification: `npm test` (160 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains
the existing ONNX Runtime dynamic-require warning.

## Previous milestone: Global chunk-fallback Quran boundary solver

Complete:

- Replaced independent chunk-fallback ayah transition selection and its
  `previous + 1 ms` collision repair with the pure deterministic
  `resolveGlobalAyahBoundaries` solver. It produces one ordered boundary
  vector, then the existing single `CaptionSegment[]` authority consumes it.
- A completed same-source CTC result is now re-analysed as the global scaffold
  only when Whisper lacks word offsets. CTC stays diagnostic for the protected
  word-timestamp mode.
- Micro-ASR is interval-only evidence. It can refine a CTC boundary only via a
  corroborating VAD onset within both its interval and the hard transition
  corridor; duplicate recovered coverage is deduplicated by canonical word.
- Added the permanent Surah 69:19–32 regression with duplicate micro-ASR
  evidence and an out-of-corridor candidate. It verifies deterministic,
  contiguous, non-collapsed boundaries. The existing 6:76–77 44,832 ms
  early-boundary fixture and the 93:1–5 / 3:33–35 timestamp regressions
  remain green.

Verification: focused recognition/boundary tests, full `npm test`, `npx tsc
--noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass.

## Current milestone: Deterministic Quran passage-boundary completion

Complete:

- Treat local passage matching as an identity anchor, then complete the final
  canonical span with a bounded monotonic scan of its adjacent ayat before any
  timestamped, forced-alignment, caption, or CTC input is built.
- Recover a missing current-ayah edge word contextually only when an unused
  adjacent ASR token and a strong local canonical run support it; extend into
  each neighbouring ayah only with at least two monotonic, sequential ASR
  anchors. The bounded search stops after six ayat and never re-searches the
  Quran corpus.
- Added separate identity, coverage, and boundary confidence diagnostics. A
  locally unique candidate with unexplained speech at a mid-ayah edge is now
  only plausible until boundary completion resolves it.
- Added the permanent timestamped 3:33–35 real-failure family. It verifies
  restored 3:33 display, contextual recovery of 3:34 word one before the
  word-two timestamp, contiguous automatic boundaries, and a CTC target that
  includes the completed passage.

Verification: focused recognition tests, full `npm test` (158 passing),
`npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check`
pass. The production build retains the existing ONNX Runtime dynamic-require
warning.

## Current milestone: Verified first Quran onset in timestamped alignment

Complete:

- Separated the first visible Quran onset from the earliest timestamp in a
  merged Whisper token group. The shared pure resolver prioritizes corridor-
  bounded PCM onset, closely associated VAD onset, and acoustically plausible
  lexical timestamps while rejecting an implausible raw zero.
- Applied the verified onset to timestamped and fallback boundary generation
  without changing interior ayah transition timing, passage identification,
  CTC, or the fallback recovery architecture.
- Added the Surah 93 merged-token regression, including the raw diagnostic
  start at 0, verified onset at 1,640 ms, and preserved interior boundaries.

Verification: focused and full `npm test`, `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The build retains the existing
ONNX Runtime dynamic-require warning.

## Current milestone: Deterministic timestamp-first Quran word alignment

Complete:

- Split recognition timing into explicit modes. When Whisper supplies real word
  timestamps, the selected canonical passage is aligned monotonically with a
  dedicated dynamic program; the no-word-timestamp VAD/micro-ASR fallback
  remains separate.
- The timestamped path supports one canonical word to one, two, or three ASR
  tokens and two short canonical words to one ASR token. Canonical starts use
  the first ASR token start and ends use the final ASR token end; Uthmani
  display text is never changed.
- Removed broad VAD rewind from timestamped ayah timing. A missing word one is
  recovered only inside the closed interval from the prior ayah's final
  aligned word end to this ayah's earliest aligned word. Timestamped runs do
  not schedule general transition or final micro-ASR windows.
- Added immutable analysis-run snapshots (source identity/object URL, decoded
  duration, sample rate, and PCM identity). Whisper, timing recovery, CTC,
  progress, captions, and debug state are discarded unless their run id still
  matches the active source. Core timing rejects evidence outside the decoded
  source duration (2 ms numeric tolerance).
- Added the real-shaped 93:1–5 fixture: `و + الضحى` begins at 1,640 ms,
  93:4 bounded recovery begins at 9,420 ms rather than the 5,952 ms VAD
  onset, 93:5 begins at 14,640 ms, and no result exceeds 20,362 ms. The
  existing 6:76–77 word-one regression remains green.

Verification: `npm test` (155 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass.

## Current milestone: Deterministic single-source Quran verse timing

Complete:

- Added pure `resolveVerseBoundaries`, which uses every `WordOccurrence` for
  each known next ayah and records accepted/rejected candidates explicitly.
  A credible 6:77 word one at 44,832 ms now deterministically wins over the
  later word-16/17/18 events at 55,584 ms.
- Automatic editor generation now follows `VerseBoundary[] -> CaptionSegment[]`
  directly. Preview imports the shared half-open `getActiveCaptionSegment`
  selector; timeline and export already consume the same segment array.
- Removed forced-alignment-to-caption generation and timing fields from
  diagnostic display-set plans. CTC remains shadow-only. Development debug now
  reports `AUTHORITATIVE_CAPTIONS`, `ACTUAL_PREVIEW`, and labelled legacy
  diagnostics.
- Added the actual 6:76–77 VAD/word-occurrence regression fixture covering
  resolver, generated captions, editor state, and the shared selector at
  44,831/44,832 ms.

Verification: `npm test` (154 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The production build retains the
existing non-fatal `vad-web` critical-dependency warning.

## Current milestone: Trace the real editor timing flow

Complete:

- Removed `forcedAlignment.captionSets` as an authority for newly generated editor display timing. Automatic captions now always flow from the final `RecognitionMatch` / `VerseAlignment` values into `CaptionSegment`; forced-alignment remains available only as diagnostic metadata.
- Added a development-only build marker to **Copy Alignment Debug**, post-React-state editor/timeline timing traces for every ayah transition, exact preview decisions at `boundary - 1` and `boundary`, and generated-caption timing values. The trace includes the earliest candidate and selected recognition boundary already emitted by the timing analysis.
- Added a loud development invariant that every generated non-final `CaptionSegment` endpoint equals the final adjacent `VerseAlignment` boundary. A 6:76 → 6:77 regression now covers recognition alignment → automatic editor captions → half-open active-caption selection at 44,831/44,832 ms.

Verification: `npm test` (153 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning. Real-browser Copy Alignment Debug with the affected recording remains the final empirical check; it explicitly reports the CTC shadow result (`complete` is the successful status), target-token count, word-alignment count, and verse starts without making CTC authoritative.

## Previous milestone: Fix earliest ayah transition selection and CTC structural targets

Complete:

- Replaced the self-referential transition corridor with a candidate interval derived from previous-ayah evidence, all next-ayah evidence, VAD, and the known passage sequence. Direct credible next-ayah word-one evidence now wins chronologically over later internal-word matches.
- Added chronological transition diagnostics showing candidate timestamp, canonical word index, confidence, evidence type, nearby VAD speech onset, acceptance, and reason. The real-shaped 6:76 → 6:77 regression selects 44,832 ms, leaving 6:76 visible through the preceding breath; the later word-18 / 55,584 ms event remains inside 6:77.
- Made CTC canonical target construction use the same Arabic-word convention as display/editor construction, excluding standalone waqf, ayah-number, and annotation glyphs before acoustic indexing. Validation now reports verse, word, original Unicode, normalized target text, and unsupported characters for any real unencodable word.
- Added structural-token coverage and target validation for 6:74–77. The four ayat produce 14, 9, 15, and 18 real spoken target words respectively, each with a non-empty encodable token sequence. CTC remains shadow-only.

Verification: `npm test` (152 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning.

## Previous milestone: CTC forced-alignment shadow prototype

Implementation complete; real-recording acceptance validation pending:

- Replaced the inaccessible 2.93 GB model with the public Apache-2.0
  `Tidzo/darten-quran-asr` `model.int8.onnx`, pinned to an immutable revision.
  The exact artifact is 355,026,417 bytes, uses raw 16 kHz Wav2Vec2 PCM, and
  produces the verified 51-class character CTC output matching its public
  vocabulary. The smaller 63-class `hamza` artifact and the no-profit
  FastConformer mirror are intentionally rejected.
- Browser loading is client-only and lazy after passage identification/VAD. It
  uses Cache API storage and ONNX Runtime Web with WebGPU then WASM fallback;
  a real ONNX Runtime Web WASM session has loaded the selected artifact and
  produced logits in this environment.
- CTC target construction now records canonical Uthmani word -> target-only
  normalized character text -> exact CTC tokens -> aligned frames. Canonical
  display text is never altered; weak forced paths are explicitly marked low
  confidence.
- Expanded development Copy Alignment Debug with artifact/cache/backend and
  runtime timings, target tokenization, low-confidence words, verse deltas,
  and named pause boundaries. CTC remains shadow-only and cannot change
  `CaptionSegment` timing or manual edits.
- Added targeted normalization/tokenization/artifact regressions and updated
  commercial model research.

Verification: `npm test` (149 passing), `npx tsc --noEmit`, `npm run lint`,
`npm run build`, and `git diff --check` pass. The workspace has no real
6:74–6:77 recording and no browser performance trace, so the required
production-versus-CTC transition comparison and cold/warm browser metrics
remain the final acceptance blocker.

## Current milestone: Refine Quran ayah boundaries

Complete:

- Added a timing-only recovery pass for every selected ayah transition and for the final ayah. Passage identification still uses only the immutable primary transcript; canonical Quran text remains the display source.
- The next ayah's local canonical/ASR anchor now selects a bounded VAD corridor. When the first clean anchor is word 3 or later, timing recovers backward by local cadence inside that corridor instead of displaying the ayah at the late anchor. Each non-final ayah ends exactly at the recovered next-ayah onset, including across a real pause.
- Final-ayah timing now retains the VAD speech region containing the final Quran-aligned evidence, so a long madd, weak final words, or a recording cut cannot make the final caption disappear at the last strong lexical timestamp.
- Extended Copy Alignment Debug with a compact `verseTimingTable`, transition corridors/VAD regions/next-ayah evidence/selected boundary/local-ASR windows, and final-end evidence/region/speech-end/video-duration fields.
- Added regressions for connected ayat, late clean next-ayah anchors, clear pauses, long final ayat, final madd, and video cuts during a final ayah. Existing first-onset, full canonical text, forced whole-ayah display, passage-independence, VAD, preview/timeline, and manual-timing tests remain green.

Verification: `npm test` (140 passing), `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. The production build retains the existing non-fatal `vad-web` critical-dependency warning. Real-browser validation with the affected recording remains advisable for empirical boundary accuracy.

## Current milestone: Fix browser-local VAD runtime assets

Complete:

- Configured the installed `onnxruntime-web@1.29.0` runtime through `vad-web`'s supported `ortConfig` hook before model/session initialization.
- Served the required JSEP WASM/MJS runtime pair and legacy Silero model from stable `/ort/` paths; the build now checks all three assets exist.
- Cached successful VAD initialization, cleared failed initialization for a clean retry, and added concise development diagnostics without changing VAD thresholds or recognition logic.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run check:vad-assets`, and `git diff --check` pass. `npm start` reaches ready on an alternate local port; real-browser dev/production validation remains required.

## Current milestone: VAD-constrained local Quran timing recovery

Complete:

- Replaced the RMS-derived pseudo-VAD with browser-local Silero VAD (`@ricky0123/vad-web`), run once over the decoded 16 kHz mono source before Whisper. Its regions contain integer absolute video timestamps and a model-probability confidence; short recitation/breath interruptions are smoothed while meaningful gaps remain separate.
- Speech detection fails closed: background audio is never treated as spoken recitation merely because it has energy. PCM/RMS remains only for refining a boundary inside an already selected Silero speech corridor.
- Preserved whole-recording ASR → immutable `PrimaryTranscript` → text-only Quran passage identification. VAD is timing-only evidence and cannot change the canonical passage.
- Made the first Quran caption hard-constrained to the earliest Silero speech region with aligned known-passage text. A timestamp outside every VAD region is excluded as a timing anchor; a VAD/text corridor with no evidence yields no caption rather than a caption in background audio.
- Bounded fallback micro-ASR windows exclusively to VAD speech regions, with 4.8-second overlapping local windows. Missing-verse and transition work is intersected with speech regions, so confirmed non-speech never consumes a recovery pass.
- Added regression coverage for the 2.63s false-anchor / 9.5s real-speech shape, VAD-only recovery windows, and tiny VAD interruption smoothing.

Verification: targeted recognition/VAD tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser validation remains required with the real 6:74–77 recording, including first-run model download/caching and a no-caption check through the initial background audio.

## Current milestone: Recover complete Quran verse timing

Complete:

- Fixed the f0840e7 regression where the editor appended bounded micro-ASR chunks to the original whole-recording chunks and ran passage detection again. A poor or contradictory timing window could then lower global transcript coverage and overwrite a valid initial passage with `no-reliable-match`.
- Added immutable `PrimaryTranscript` construction (raw stitched ASR text, normalized tokens, original chunks, and timestamp mode). Passage identification now reads only that value through the independently callable `identifyQuranPassage`; `passageSource` is always `primary-transcript`.
- Made recovery chunks explicit timing evidence. The second pass preserves the already selected canonical passage while using micro-ASR/PCM only for local verse and word timing; empty or alternate-passage recovery text cannot alter identity.
- Added primary-vs-pre-f0840e7 shadow diagnostics, top-five candidate/debug output, and regressions for word versus chunk-fallback identity, empty micro-ASR, contradictory micro-ASR, and the retained missing-verse recovery path.
- Corrected the fallback architecture so canonical ayat and their words are retained independently of Whisper observations. `CanonicalWordAlignment` now represents every word in the selected full-ayah range; direct ASR, bounded micro-ASR recovery, PCM refinement, interpolation, coarse chunk timing, and unknown timing are explicit evidence classes.
- Stopped distributing a coarse Whisper chunk across individual words. `chunk-fallback` text remains useful for passage identity, but cannot create direct word anchors or precise-looking word timing.
- Added a second local timing pass after passage selection. It uses detected speech regions and bounded overlapping 8-second PCM windows, scores the known passage again, targets ayat with no direct anchors, and preserves absolute source timestamps. A 6:75-style ayah between anchored neighbours is searched before interpolation.
- Made first/last ayah boundaries conservative: missing ASR words alone never create a partial ayah. Partial status requires direct timing plus an acoustically insufficient speech edge for the omitted canonical words.
- Automatic output now creates one full canonical `CaptionSegment` per ayah. The internal pause/splitting evidence remains available, while direct display generation checks that every canonical range is contiguous and segment midpoint activation is regression-tested.
- Updated Copy Alignment Debug and the development timing report with timestamp quality, micro-ASR/recovery state, direct and recovered coverage by ayah, verse evidence, canonical alignments, and first-onset trace.
- Added a structural regression for the observed fallback failure: early coarse text/noise, missed first two words, internal holes, zero first-pass 6:75 anchors, later strong evidence, local 6:75 recovery, full canonical display, and verified later onset.

Verification: targeted recognition/caption/local-Whisper tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser validation remains required with the real 6:74–77 recording, especially to calibrate micro-ASR windows on noisy audio.

## Current milestone: Accuracy-first Quran forced word alignment

Complete:

- Added a separate canonical-first forced-alignment layer after whole-recording passage inference. It represents canonical passage words, every aligned audible `WordOccurrence`, repeated local occurrences, ayah timing with partial boundaries, text-associated pause candidates, and word-boundary caption-set plans.
- Retained local timestamped Whisper only as lazy-loaded retrieval/coarse timing evidence; the corpus controls canonical text. A bounded five-word local backward jump models phrase repetition without allowing Quran-wide jumps.
- Added local PCM edge refinement and pause scoring after canonical words. Caption plans preserve the old text through pauses, split long ayat only at canonical word boundaries, and delay set advancement across backward repetition.
- The editor now creates initial display blocks from forced-alignment plans while `VerseAlignment` remains the persistence/reset compatibility layer. Manual timing remains authoritative.
- Added development `window.__QURAN_ALIGNMENT_DEBUG__`, the normal-editor **Copy Alignment Debug** action, and expanded the recognition route debug output. Reports contain no audio bytes.
- Documented the architecture decision, rejected second-model alternative, local runtime cost, and current phonetic-alignment limitation in `docs/RECOGNITION.md`.

Verification: targeted forced-alignment/caption tests, `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`, and `git diff --check` are run for this milestone. Real recitation browser validation remains required, especially for noisy multi-ayah recordings and ASR timestamp fallback.

## Current milestone: Whole-ayah captions and first-ayah timing correction

Complete:

- Automatic generation now creates exactly one full-text `CaptionSegment` per detected ayah. Recognition still preserves canonical partial-word spans; repeated Quran words do not change visible text. Generated ayat remain contiguous by setting each previous segment end to the next credible ayah start, while manual split/merge and timeline edits remain authoritative.
- Corrected first-ayah onset selection: a strongest local run of accepted canonical ASR alignment anchors the temporal corridor, and PCM may only refine inside that corridor. Generic audio activity and isolated early Whisper-like output cannot move Quran captions seconds earlier.
- Centralized half-open active-caption selection in `getActiveCaptionSegment`; preview transitions and timeline active state use the same editable interval, including exact start/end boundary behavior.
- Every timeline caption set is a visible block with draggable body, left edge, and right edge. Body drag preserves duration; edge edits use integer milliseconds, subtle playhead/neighbor/80 ms snapping, and a live `00:00.000` tooltip. Manual edits do not ripple neighbors and can intentionally create gaps or overlaps.
- Added per-set and all-set timing reset actions that restore recognition-derived timing evidence without mutating `VerseAlignment`.
- Expanded the development-only `/recognition` route with Copy Timing Report and Export Debug JSON, including ASR/audio/alignment/CaptionSegment/manual-mark traces plus observed lab caption activation events. R/M/E mark recitation start, transitions, and final recitation end; transition marks can be associated with detected CaptionSegments.
- Added regressions for whole-ayah defaults, repeated-word stability, exact contiguous ayah display timing, and the 2.63s-noise / 9.5s-Quran-onset failure shape.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification remains required with a real recitation: confirm no pre-onset caption, pause behavior, timeline body/edge drag, snapping tooltip, preview agreement, ground-truth marks, and persistence through save/open.

## Current milestone: Holistic Quran passage alignment

Complete:

- Replaced chunk-by-chunk final verse commitment with two-stage, bounded whole-recording inference: fuzzy anchor retrieval proposes contiguous Quran windows and dynamic-programming sequence alignment scores every candidate against the complete transcript. Candidate scores combine normalized/recitation-aware token similarity, transcript/canonical coverage, word order, and consecutive-ayah support; top candidates, margin, and late disambiguation are exposed at `/recognition`.
- Whisper now requests word timestamps and overlap-stitches its 30-second windows into one monotonic recording without duplicate overlap words or backward timestamps. Ambiguous-but-credible clips expose `plausible-ambiguous` and retain a usable best passage for correction; only `no-reliable-match` creates no captions.
- The selected passage is aligned again as one canonical word sequence against all timestamped ASR words. A 10 ms local PCM RMS envelope is built once per recognition job. It uses a local adaptive noise floor only around canonical ayah transition corridors to refine active speech offset/onset; breaths within 6:74 or 6:76 cannot create a verse split. Initial silence and final vocal completion are refined around the first/last aligned word.
- Made editable `CaptionSegment.startMs`/`endMs` the shared preview/timeline interval. Preview transitions now stay strictly inside that half-open range, so an upcoming caption cannot appear before its start and a caption is inactive at its end. Recognition `VerseAlignment` timing stays independent reset evidence.
- Added explicit regressions for 5+ seconds initial silence, connected ayat with no acoustic gap, expected-transition PCM gaps, ambiguous best-candidate behavior, and the 6:74–77 mid-ayah breath fixture while preserving 93:1–5, noisy-ASR, and unrelated-Arabic regressions.
- Fixed the real-browser word-timestamp crash by replacing the ordinary `onnx-community/whisper-base` ONNX export with `onnx-community/whisper-base_timestamped`. The normal export lacks the cross-attention outputs used by Transformers.js 3.8.1 to derive `return_timestamps: "word"`; the timestamped multilingual Base export retains them.
- q4 remains selected (approximately 145 MB first download: 18.8 MB q4 encoder plus 123.7 MB q4 merged decoder and small tokenizer/config assets). WebGPU remains preferred and local WASM remains the automatic fallback; model loading remains lazy and browser caching remains enabled.
- Added explicit timestamp capability, validation, and retry diagnostics. Invalid/missing/identical/out-of-duration/regressing word data, or a cross-attention runtime error, retries once with timestamped chunks from the same local model and marks the run `chunk-fallback`; isolated zero-duration words remain usable. The two-stage passage mapper and PCM transition refinement are unchanged.
- Fixed boundary-ayah loss by changing the final mapper target from verse windows to a contiguous canonical Quran word span. Its semi-global DP permits free canonical start/end gaps (partial first/last ayat) but penalizes every unmatched ASR token, so initial silence remains irrelevant while a substantial spoken Quran prefix cannot be discarded to preserve a cleaner later anchor. Detected spans now carry first/last canonical word metadata, per-ayah word coverage, independent mapping/coverage/uniqueness/boundary metrics, and diagnostics for candidate prefix/suffix evidence and boundary extension.
- Added regressions for the real 6:75–77 shape (initial silence, noisy 6:75, clean 6:76–77), partial first and final ayah boundaries, unrelated Arabic before Quran, and identical mapping under word timestamps and chunk fallback.

Measured: the noisy five-ayah Ad-Duha mapping completes in about 0.73 s in this Node workspace; PCM envelope construction is linear in source duration. Browser codec/reciter boundary measurements remain manual verification work.

Manual browser test required before release: verify Ad-Duha 93:1–5 and 6:74–77 with the timestamped q4 model. Confirm `word` mode and returned word timestamps in `/recognition`, correct passage identity, no caption during initial silence, no breath-derived boundaries around 0:16/0:38, and 6:74–77 timing materially closer to the human-observed approximate ranges (0:07–0:20, 0:21–0:30, 0:32–0:44, 0:45–1:06). If a browser uses `chunk fallback`, confirm mapping continues and the editor displays the approximate-timing warning.

## Current milestone: Compact Quran video editor workspace

Complete:

- Reframed the homepage editor as a viewport-oriented workspace with a compact top bar, source/tools sidebar, dominant video canvas, contextual inspector, and attached timeline.
- Arabic and translation now behave as separate editor-only canvas objects with independent selection, normalized drag positioning, direct width resizing, selection handles, and an Align below Arabic action.
- Moved text styling into a selection-aware inspector with compact controls while keeping project format, detection, local/cloud project actions, timing edits, transitions, styles, and local export discoverable.
- Added legacy-compatible independent translation width state and kept selection chrome out of the export snapshot/render path.

Verification: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Browser interaction verification with a local video remains recommended.

## Current milestone: M9 — Stripe subscriptions for Creator and Pro

Complete:

- Added server-only Stripe checkout and Customer Portal routes, allowlisted Creator/Pro plan mapping, Supabase-user authentication, safe customer reuse, and internal user metadata.
- Added signed, raw-body webhook processing for subscription lifecycle events with idempotency records and conservative active/trialing/known-price entitlement policy.
- Added owner-readable, server-write-only subscription state storage and authoritative plan resolution. Existing centralized entitlements now receive the verified plan; cancel-at-period-end remains paid until Stripe reports the subscription ended.
- Added account billing UI, test-mode configuration names, and a manual Stripe checklist. No secrets or Stripe IDs are committed.

Verification: targeted billing tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Live Stripe/Supabase deployment and webhook delivery remain manual environment checks. Annual billing, coupons, trials, one-time purchases, 4K, other qiraat, and server rendering remain out of scope.

## Current milestone: V1 Free / Creator / Pro entitlement model

Complete:

- Replaced provisional plan definitions with centralized typed capabilities and quotas in `src/lib/entitlements.ts`; unauthenticated and authenticated-without-subscription users resolve to Free.
- Free is capped at 720p with a renderer-controlled watermark, 2 cloud projects, and 2 saved custom styles. Creator is capped at 1080p with no watermark and 25 cloud projects. Pro carries future 4K, multi-qiraat, and premium capability flags with a centralized 1,000-project technical ceiling.
- Export count remains unlimited on every plan while `export_completed` continues to be recorded. Local Quran recognition, canonical Arabic, manual editing, and local exports are not count-gated.
- Added a development-only `NEXT_PUBLIC_DEV_PLAN_OVERRIDE` for local simulation; production ignores it and uses server subscription state when that state is connected.

Verification: entitlement, export, and existing regression tests pass when the milestone checks complete below. Stripe, 4K, other qiraat, and word-level alignment remain intentionally unimplemented.

## Current milestone: M8.5 — Server-authoritative usage accounting

Complete:

- Added append-only `usage_events` storage with user/event/time indexes, operation idempotency, and RLS that permits owner reads but no client inserts.
- Added server-only usage helpers for recording events, current-month counts, centralized UTC period boundaries, structured quota results, and provisional Free/Creator/Pro limits (unlimited until product values are approved).
- Added an authenticated `/api/usage` route that derives identity from the Supabase bearer session and records only allowlisted event types through the service-role path.
- Completed local exports and successful cloud saves now submit minimal authenticated events; anonymous/local flows remain no-ops. Failed or cancelled exports never submit an event, and duplicate operation ids are ignored.
- Cloud save events are tracked for meaningful save operations; a future active-project quota should query `projects` rather than count save clicks.

Verification: targeted usage tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Supabase migration execution and authenticated browser verification remain deployment-environment checks because local credentials/database are not configured here.

## Current milestone: Local project lifecycle

Complete:

- Added an explicit IndexedDB repository for lightweight saved project metadata. Save creates a stable project id and later saves update that record; no automatic permanent save is performed.
- Added Saved/Unsaved changes state, Save Project, Open Project local listing, Discard, Delete saved project, and New Project actions with unsaved-change confirmation.
- Opening restores alignments, caption segments, format, translation/style/positioning/background/transition settings, and asks for the original source video again. Filename, size, media type, and loaded duration are checked; recognition does not rerun automatically.
- Added before-unload protection for meaningful unsaved edits. Refresh intentionally warns that ephemeral unsaved work will be lost; explicit saved metadata remains separate and local.
- Added repository validation and regression tests rejecting media payloads, object URLs, source bytes, and export data. Delete removes only local metadata; source and export files remain on the device.
- Saved project persistence now uses the canonical `VerseAlignment` shape (`verseKey`, `startMs`, `endMs`, confidence, and timing evidence). Legacy `startSeconds`/`endSeconds` alignments migrate to milliseconds on load and are not retained as a second active representation.

Verification: targeted project-storage tests, full `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification remains recommended for IndexedDB persistence and source mismatch/reselection flows.

## Current milestone: M7B — Productionized local deterministic exporter

Complete:

- Added Draft, Standard, and High quality presets with centralized bitrate mapping; Standard is the default and output dimensions remain tied to the selected 9:16, 16:9, or 1:1 project format.
- Added a normal export panel showing format, quality, resolution, and the capability-selected MP4 H.264/AAC or WebM VP9/Opus output before rendering. Successful files remain in memory only until the user downloads them.
- Export jobs snapshot the source-independent editor configuration at start, reject duplicate jobs, support cancellation, report deterministic progress/elapsed time/derived ETA, and retain the live editor/source state on failure.
- Added input/output validation, safe Quran passage filenames, verified duration/audio/frame coverage/non-empty output, and user-facing retryable errors with detailed diagnostics retained for development.
- Safe-area guides remain editor-only and are excluded from the render configuration. Source timing remains deterministic and independent of tab visibility or real-time playback.

Verification: targeted export tests, `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` pass. Manual browser verification with audio fixtures remains required for codec availability and playback coverage.

## Previous milestone: M7A — Client-side video export technical spike

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
## Current milestone: M8 — Optional account project sync

Complete:

- Added optional Supabase email/password sign up, sign in, and sign out UI without gating the local editor, recognition, export, or IndexedDB project save.
- Added explicit `Save to Account`, cloud project listing/open/delete, stable project identity mapping, schema-versioned metadata payloads, and timestamp conflict warning with local/cloud choice.
- Added a minimal `projects` migration with owner-derived `user_id`, Row Level Security, and no storage buckets. Source video, rendered exports, temporary blobs, and local Whisper models remain device-local.
- Added environment variable examples only; no Supabase secrets are committed.

Verification: targeted M8 tests pass; full test, typecheck, lint, build, and diff checks run at milestone handoff.

M5A first-caption onset regression fix:

- Root cause: when forced alignment was available, editor caption generation used `ForcedAlignment.captionSets` timing instead of the recognized `VerseAlignment` timing. A zero-valued forced set could therefore replace a detected non-zero Quran onset before preview lookup.
- Fix: pass recognized verse alignments into forced-alignment caption generation and preserve their exact millisecond start/end values; forced-set timing remains the fallback for callers without recognized alignments.

Verification: focused caption regression, full test, typecheck, lint, build, and diff checks pass.

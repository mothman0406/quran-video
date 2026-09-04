# Quran recognition and timing audit

Status: shadow evaluation only (2026-09-03). The generated production
`CaptionSegment[]` authority remains `resolveGlobalAyahBoundaries`.

## Architecture before this audit

1. Whole-recording Whisper text identifies and completes the canonical Quran
   passage. This has no dependency on timestamps.
2. In `word` mode, true Whisper word offsets feed a monotonic canonical-word
   alignment. CTC stays diagnostic.
3. In `chunk-fallback`, local Whisper windows are text/interval evidence and
   VAD provides speech regions. The previous resolver treated a structurally
   valid CTC forced path as a scaffold, then created hard `±` corridors around
   those CTC starts.
4. The single authoritative resolver generates `VerseBoundary[]`, which is
   converted once to `CaptionSegment[]`. Timeline, preview, manual editing,
   and export consume those same segments.

## Evidence semantics

| Evidence | Measures | Safe use | Must not be used for |
| --- | --- | --- | --- |
| Whisper word timestamp | A model word-offset estimate | Direct lexical timing when neighboring alignment is coherent | Passage identity by itself |
| Whisper chunk / micro-ASR window | The matched words occur somewhere in `[start, end]` | Passage identity, ordering, interval constraint | Assigning every matched word to `chunk.startMs` |
| Silero VAD | Probability of speech, segmented into regions | Localizing a known lexical interval to a speech onset; final voice end | Identifying Quran or creating an intra-ayah split |
| PCM/RMS | Energy envelope | Small local refinement of an already-verified onset/transition | Finding Quran in arbitrary earlier audio |
| CTC free decode | What the acoustic model recognizes without a target | Model quality/coverage gate and diagnostic | Display text or passage identity |
| CTC forced alignment | Best monotonic path through a supplied target | A soft timing hypothesis when local posterior quality is good | Proof that the target was acoustically recognized |

## CTC implementation validation

The artifact is `Tidzo/darten-quran-asr/model.int8.onnx`, an Apache-2.0
dynamic-int8 export of `jonatasgrosman/wav2vec2-large-xlsr-53-arabic`.
Upstream specifies `input_values` as float32 PCM at 16 kHz and `logits` as
the output. The base-model configuration confirms 16 kHz, per-utterance
zero-mean/unit-variance normalization, `pad_token_id: 0`, and the 51-entry
vocabulary used by this project. Its seven convolution strides multiply to
320 input samples (20 ms at 16 kHz), so output frame rate is approximately
50 Hz. Mapping a frame across the actual CTC input window is therefore
consistent with the debug recordings; no evidence identifies a global
frame-to-millisecond scaling bug.

The ONNX session has one input, so an attention mask cannot be supplied to
this export. That is acceptable for its single unpadded utterance input, but
must be rechecked if padding/batching is added. The browser checks the
`[1, frames, vocabulary]` logits shape and uses raw float32 output from both
WebGPU and WASM; no backend-specific value conversion exists.

The decisive limitation is model suitability, not tensor shape: the base
model was trained on general Arabic Common Voice and Arabic Speech Corpus,
not Quran recitation. The supplied recordings also show forced word
posteriors around 0.02–0.05. A Viterbi path can be complete under those
conditions while being several seconds wrong. It is not safe as a global
timing authority.

The runner now captures a greedy free CTC decode *before* forced alignment,
including normalized character error rate and target coverage. Existing debug
exports do not contain raw logits, so their free-decode measurements cannot
be reconstructed honestly. New runs will expose this required gate in the
alignment debug result.

## Real recordings and root causes

### Surah 6:74–77

The supplied 66,083 ms recording has VAD onsets at 9,600, 16,608, 21,696,
32,064, 44,832, and 55,584 ms. Current starts are 9,660, 28,608, 40,753,
and 50,598 ms. The last three equal the forced CTC baselines.

The direct cause is circular rejection:

1. CTC forced the known target through very low-confidence logits and drifted
   late after 6:74.
2. The resolver formed a hard corridor around each late CTC start.
3. It rejected the independent word-one intervals at 21,696 and 32,064 ms as
   outside those corridors.
4. It rejected 6:77 word one at 44,832 despite a VAD onset at exactly 44,832
   because the legacy resolver additionally required a matched following
   word-two-to-four run. The rejection label incorrectly said “no local VAD
   onset”; the true failed predicate was lexical coherence, not VAD.

The latter reporting/acceptance inconsistency is fixed by a shared
`vadOnsetsInEvidenceInterval` predicate and distinct rejection reasons.

Replay through the new shadow resolver selects 9,660, 21,696, 32,064, and
44,832 ms. Against the user-provided *approximate* labels (9,500, 21,000,
32,000, 44,832), current median/p90/max absolute start error is
7,608/8,753/8,753 ms; shadow is 160/696/696 ms. Approximate labels remain
informative only, not a promotion gate.

### Surah 69:19–32

Passage identity is correct and the first start is a plausible 1,950 ms. The
current result is otherwise almost wholly CTC: 12 of 14 starts have
`interpolated` evidence and equal CTC starts; 69:23 is the sole accepted local
override. The forced path has low per-word confidences throughout, so it is
not an acoustic validation of those starts. The supplied replay shadow keeps
every current boundary except 69:29 (50,536 -> 48,288 ms), where a strong
word-one/VAD interval exists. There are no human labels for this recording;
that change is explicitly unpromoted.

### Historical regression families

The production-path tests still cover 93:1–5 (true word timestamps and first
onset), 3:33–35 (canonical passage completion), and contiguous complete
caption generation. No production timing behavior changed in this audit
milestone. Those recordings need stored real debug/label files before they
can satisfy the new real-fixture promotion gate.

## Shadow design

`resolveEvidenceWeightedAyahBoundaries` is a deterministic layered dynamic
program. It selects one globally monotonic start vector. Hard constraints are
only canonical order, source duration, strict ordering, contiguity, and
non-collapsing intervals. Candidate scores are evidence, not corridors:

- verified first onset is fixed;
- a direct timestamped canonical word is high-weight evidence;
- a high-confidence local-ASR canonical word-one interval plus a VAD onset
  inside that same interval is high-weight evidence;
- CTC is a low-weight soft hypothesis scaled by its local posterior;
- an explicit ordered estimate is available only if CTC is unavailable.

The design prevents a model prediction from excluding independent evidence.
It also makes a disagreement visible: every selected and overridden
hypothesis is retained in the shadow trace. The function has no production
caller for `CaptionSegment[]` generation.

## Evaluation harness and promotion criteria

`npm run evaluate:real -- <alignment-debug.json> [--labels=...]` replays old
debug evidence through the actual exported shadow resolver, or reads the
in-browser shadow result from new debug exports. It reports a compact
boundary table and median/p90/max, missing ayat, and structural-invalid
counts. Labels live in `debug/labels/` and contain no media.

Do not promote until verified labels exist for all real families, greedy CTC
decode coverage is measured, every structural-invalid count is zero, Surah 6
stays improved, and Surah 69/93/3 do not regress. No new model is proposed:
the available evidence does not yet demonstrate a replacement beating the
current browser-local stack on labeled recordings.

## Performance observed in supplied debug

| Recording | Whisper total | CTC total | CTC inference | CTC Viterbi |
| --- | ---: | ---: | ---: | ---: |
| 6:74–77 | 17.9 s | 41.0 s | 39.4 s | 0.7 s |
| 69:19–32 | 10.1 s | 49.1 s | 47.2 s | 0.9 s |

The shadow dynamic program is negligible relative to inference. The next
accuracy-focused stage may add targeted local reanalysis only after labeled
fixtures establish which disagreements require it.

## Sources

- [Darten int8 ONNX model card](https://huggingface.co/Tidzo/darten-quran-asr)
- [Base Arabic Wav2Vec2 model card and configuration](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic)

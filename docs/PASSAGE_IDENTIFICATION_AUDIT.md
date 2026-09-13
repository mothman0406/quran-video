# Quran passage-identification audit

Date: 2026-09-12. Scope: passage identity only; word timing is deliberately a
separate concern. Wrong canonical Quran text is worse than abstention.

## Result

The supplied failure clip is not retained in this workspace. Therefore neither
the reported wrong selection nor a historical regression can be reproduced or
attributed to a commit. The current harness records that limitation rather than
inventing a score, rank, or before/after result. No production selection logic
was changed.

The current code is already a two-stage local design: recall-first Quran-wide
retrieval followed by candidate-specific CTC verification and whole-recording
continuity. Its structural weakness is that Stage A begins with a greedy CTC
lexical decode and retains at most 48 coarse candidates (then 24 CTC-reranked).
If the correct passage is not in that set, Stage B cannot recover it. The
evidence gate appropriately abstains on low CTC fit, small global margin,
insufficient VAD-qualified coverage, contradictory surahs, weak single-window
uniqueness, or invalid coordinates.

## Current production path

| Stage | Implementation | Input → output / guard |
| --- | --- | --- |
| Decode | `local-audio-decode.ts`, `local-media-compatibility.ts` | Native `AudioContext` PCM or FFmpeg `f32le`, mono, 16 kHz fallback → transferable channel buffers. |
| Prepare/VAD | `recognition-worker.ts`, `vad.ts`, `speech-regions.ts` | Channel average + linear 16 kHz resample → PCM, RMS analysis, speech regions. VAD qualifies identification windows; it is not identity authority. |
| CTC | `local-fastconformer.ts#createFastConformerIdentificationRunner` | 12 s windows / 6 s hop with >=1.2 s voiced audio → FastConformer logits. |
| Retrieve | `fastconformer-identification.ts#greedyDecodeCtc`, `retrieveQuranCandidates` | Normalized greedy CTC lexical tokens; initial basmalah excluded from location lookup → up to 48 same-surah contiguous ranges, using 1–3 gram anchors and length/drift expansions. |
| Verify/rerank | `rerankQuranCandidates` | Exact forward CTC likelihood for canonical target and optional prelude; per-frame normalized score. First 24 retrieval candidates only. |
| Quran-wide decision | `solveQuranContinuity`, `summarizeFastConformerIdentification`, `passage-decision.ts` | Per-surah Viterbi path allows null windows, penalizes backward/unrelated jumps, exposes competing global paths, then gates fit/margin/coverage/coherence/uniqueness. |
| Canonical range | `core.ts#canonicalSpanFromFastConformerIdentification` | Valid word coordinates → complete canonical ayat. ASR text is never display text. |
| Fallback | `local-whisper.ts`, `core.ts#analyzeTranscript` | Whisper runs only if FC is not accepted (and for development comparison); it cannot veto accepted FC. |
| Timing/display | `local-fastconformer.ts#createFastConformerRunner`, `ctc-forced-alignment.ts`, `captions.ts` | Known canonical span + VAD-bounded audio → forced alignment → the one authoritative `CaptionSegment[]`. Not identity evidence. |

The new development report is placed under
`PASSAGE_IDENTIFICATION_DEBUG_REPORT` in the existing development alignment
debug payload. It contains normalized CTC output/token IDs, the top ten
candidates per window, retrieval/reranking/coverage scores, canonical boundary
coordinates, optional-prelude signal, global hypotheses, cross-surah rejects,
and final gate reason. It contains no audio, media URL, filename, or customer
transcript.

## History and preprocessing

- `a8825e8` prevents both ngrams and expanded candidates crossing a surah;
  static inspection finds no regression in that change.
- `2b743ab` adds global competing-surah paths, lexical uniqueness, short-target
  penalties, and single-window ambiguity rejection. It is a false-positive
  hardening change, not evidence of a regression.
- `cd0ca24`, `ac3699b`, and `1ceea5d` concern timing benchmarks/end boundaries,
  not passage choice.
- Recent FFmpeg compatibility commits occur after the identification work.
  The audio fallback emits 16 kHz mono `pcm_f32le`; native decode is then mixed
  and resampled in the worker to the same format/rate. No gain normalization or
  intentional trim is applied. However the two resamplers differ (browser
  linear worker resampler vs FFmpeg), so exact acoustic equivalence is not yet
  demonstrated. This remains an open test, not a proven regression.
- Identification windows start at source zero and overlap. VAD only determines
  whether a full window is eligible; a low-energy opening can still make the
  first window ineligible. That is the highest-value clip-level diagnostic to
  capture for the real failure.

## Public comparison

| Capability | Quran AutoCaption | QuranCaption public source | AyahFlow public documentation |
| --- | --- | --- | --- |
| Passage authority | Local FC Quran-wide CTC gate; Whisper fallback | Automatic ASR/matching is implemented, not merely user passage selection | AI predicts surah, then verifies against Uthmani text |
| Candidate generation | Greedy CTC lexical 1–3 grams, top 48 | FastConformer transcription plus phoneme/ngram chapter anchors and matching | Unknown |
| Verification | Forward CTC target score + global continuity/evidence gate | Canonical matcher, chapter voting, repeated/cross-chapter handling | Publicly says word-by-word verification; internals unknown |
| Alignment | FC CTC after identity | Per-word CTC after matching | Quran-specialized forced alignment after text is known |
| Repeats/partials | Canonical word coordinates and global continuity | Explicit repetition and cross-chapter recovery code | Claims partial/repeated ayahs; method unknown |
| Basmala/pauses | Optional CTC prelude; VAD only constrains timing | Explicit isti'adhah/basmala splitting and silence-aware segmentation | Not publicly specified |
| Manual correction | Existing editor correction path | Editable segments | Public editor review/correction |
| Processing | Local browser | Cloud and local options | Detection audio processed by Google under Gemini API terms |

QuranCaption source inspected: `src-tauri/python/quran_recite_to_text/src/core/main_flow.py`,
`phase2_matching/matcher.py`, `phase3_alignment/ctc_align.py`, and
`phase1_transcribe/silence.py`. It has an actual automatic multi-phase matcher,
not a user-passage-only aligner. Its useful design lessons are independent
chapter hypotheses, later local re-transcription around suspected repeats/gaps,
and preserving overlap/repetition distinctions before display splitting. Its
repository license is CC BY-NC 4.0, so no code was copied.

AyahFlow publicly documents the prediction → Uthmani verification → alignment
sequence, partial/repeated-ayah support, manual correction, and Google/Gemini
audio processing. It does not publish candidate scoring, model choice, top-K,
or false-positive policy, so claims beyond those are unknown.

## Benchmark and next experiment

`npm run regression:quran-id` is an identity-only gate separate from timing. It
runs candidate/decision/debug tests and validates a manifest covering starts
and ends mid-ayah, basmalah/no-basmalah, long silence, slow/fast recitation,
repeated/similar language, noise, short clips, and multi-ayah clips. The metric
utility measures exact surah/start/end, top-3/top-5 recall, false confident
acceptance, and abstention once a retained licensed fixture supplies results.

Current result: 8 logical fixture specifications, no runnable retained identity
audio, so no meaningful current-vs-historical accuracy number exists.

Recommended next experiment: obtain the failing recording with permission;
run it unchanged through current HEAD and `2b743ab^` in an isolated worktree,
export the new report, and classify it strictly by correct candidate rank. If
correct is top 2, investigate Viterbi/evidence scoring; if absent from top 10,
expand or diversify Stage-A retrieval before changing the gate; if it wins but
captions differ, trace propagation. Also compare native and FFmpeg fallback PCM
fingerprints/spectral summaries for the same source. Do not add Gemini until
that local experiment fails: a cloud model may improve broad retrieval, but
adds privacy transfer, API cost, and opaque false-positive behavior. It should
only ever be an opt-in Stage-A hypothesis, still locally Quran-verified.

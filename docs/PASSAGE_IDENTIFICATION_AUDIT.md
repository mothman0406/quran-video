# Quran passage-identification audit

Date: 2026-09-13. Scope: passage identity only; word timing is deliberately a
separate concern. Wrong canonical Quran text is worse than abstention.

## Result

The supplied private recording was evaluated without adding the media, PCM, or
transcript to Git. Its expected passage is **Surat Al-Muddaththir 74:1–9**. It
is a 22.10-second H.264/AAC MP4 with a 44.1 kHz stereo audio stream.

The controlled native-path reconstruction (decode to stereo PCM, then the
worker's linear mono/16 kHz conversion) produces a correct opening candidate
but abstains: with three full-window speech regions (the controlled
VAD-qualified upper bound), the winning Surah 74 path contains only the first
12-second window, ends at 74:6, and explains 35.19% of the audio. The browser
VAD runtime itself requires the final browser retest below.
The existing evidence gate correctly rejects it for insufficient voiced-path
coverage; it is not a retrieval, threshold, or forced-alignment failure.

The same source through the existing local FFmpeg audio extraction produces a
Surah 74 path from 74:1 through 74:9, 64.81% explained voiced coverage, and a
passing production evidence gate. Native and FFmpeg PCM have matching duration
(22,104 ms) and 0.999988 sample correlation, but differ enough in downmix and
resampling to change the noisy final-window CTC evidence.

Production now makes exactly one local FFmpeg PCM retry only after a native
FastConformer decision fails. It reruns VAD and the unchanged Quran-wide
identification/evidence gate on that independent decode. An accepted native
result, already-FFmpeg PCM, and failed recovery retain their existing paths;
Whisper remains the later fallback.

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
| Prepare/VAD | `recognition-worker.ts`, `vad.ts`, `speech-regions.ts` | Native channel-average/linear 16 kHz PCM, with one FFmpeg PCM recovery only after a rejected native FastConformer decision → RMS analysis, speech regions. VAD qualifies identification windows; it is not identity authority. |
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

- `a8825e8`, `1ceea5d`, and `2b743ab` all reproduce the same native PCM
  outcome: Surah 74 opening selected, 35.19% coverage, and no coherent final
  Surah 74 window. `2b743ab` changes the global margin (0.030419 → 1.8926),
  not the selected native path. The correct opening candidate remains in the
  top 48 and top 24 (retrieval rank 9; rerank rank 21).
- Therefore there is no defensible Git `last-good` / `first-bad` pair for this
  media in the recorded FastConformer history: the earliest runnable
  identification checkpoint already abstains on this PCM. The historical
  user-reported successful output has no retained commit/debug report, so a
  commit must not be invented.
- The first material divergence is PCM preprocessing, not CTC identity:
  FFmpeg's local 16 kHz extraction yields the accepted 74:1–9 path while the
  native worker conversion yields only 74:1–6. Window 0 is strong in both;
  window 1 has weak partial Surah 74 evidence, and window 2 changes from a
  wrong Surah 23 local winner on native PCM to a coherent Surah 74:6–9 path on
  FFmpeg PCM. VAD remains a window qualifier and is never used as identity;
  browser VAD output was not fabricated in the Node diagnostic.

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

Current result: 8 logical fixture specifications plus the deterministic safe
`muddaththir-74-1-9-native-pcm-recovery` fixture. It records no private media,
PCM, logits, transcript, filename, or path; it asserts that a native abstention
gets one local recovery attempt and that the recovered evidence is 74:1–9 and
accepted. Runtime accuracy metrics still require a retained licensed fixture.

The local-only diagnostic is `tools/regression/diagnose-real-quran-id.ts`; it
accepts derived 16 kHz float PCM and pinned public Tilawa assets, emitting only
candidate and gate evidence. It is suitable for future bisects without adding
customer media to the repository.

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

The correction moves this finding to media preparation: 44.1 kHz requires a
fractional native-worker resample, so compatibility selects the existing
FFmpeg mono/16 kHz extraction before VAD and FastConformer begin. Recognition
then makes one Quran-wide identification pass on that authoritative PCM.
Decoder choice never uses Quran evidence, and the centralized evidence gate
continues to abstain on weak or incoherent recordings.

The current code is already a two-stage local design: recall-first Quran-wide
retrieval followed by candidate-specific CTC verification and whole-recording
continuity. Its structural weakness is that Stage A begins with a greedy CTC
lexical decode and retains at most 48 coarse candidates (then 24 CTC-reranked).
If the correct passage is not in that set, Stage B cannot recover it. The
evidence gate appropriately abstains on low CTC fit, small global margin,
insufficient VAD-qualified coverage, contradictory surahs, weak single-window
uniqueness, or invalid coordinates.

The acoustic gate uses the best-window CTC score for every recording. The
existing long-timeline boundary of five generated identification windows adds
the coherent-path mean CTC requirement plus support-ratio, unsupported-gap,
and repeated-language safeguards. This keeps a noisy supporting window from
rejecting a short coherent passage without allowing one strong local phrase to
promote a weak long recording.

## Current production path

| Stage | Implementation | Input → output / guard |
| --- | --- | --- |
| Decode | `local-audio-decode.ts`, `local-media-compatibility.ts` | Media preflight chooses native PCM or FFmpeg `f32le` as one authoritative input before Quran inference. |
| Prepare/VAD | `recognition-worker.ts`, `vad.ts`, `speech-regions.ts` | The authoritative PCM is mixed/resampled only as needed, then produces RMS analysis and speech regions. VAD qualifies identification windows; it is not identity authority. |
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

Current result: 8 logical fixture specifications plus a deterministic media
preparation invariant for the private Muddaththir evidence. It records no
private media, PCM, logits, transcript, filename, or path; it asserts that the
44.1 kHz compatibility route selects canonical FFmpeg PCM before one Quran
identification pass. Runtime accuracy metrics still require a retained licensed
fixture.

The local-only diagnostic is `tools/regression/diagnose-real-quran-id.ts`; it
accepts derived 16 kHz float PCM and pinned public Tilawa assets, emitting only
candidate and gate evidence. It is suitable for future bisects without adding
customer media to the repository.

## 2026-09-17 CTC-gate metric audit

The per-window `normalizedCtcScore` is the exact forward CTC log likelihood of
that candidate's word-level canonical BPE target (or the better optional-
prelude-plus-canonical target) over every acoustic frame in its 12-second,
6-second-hop identification window, divided by the number of acoustic frames.
VAD qualifies a window but does not trim silence or breaths from it. The
forward sum includes every valid blank/repeat path; only the separate greedy
capacity calculation collapses repeats and removes blank tokens.

The final `coherentPathMeanCtc` is the unweighted arithmetic mean of those
per-frame-normalized scores for every non-null candidate on the winning
surah's Viterbi path. It is not a single whole-passage CTC recomputation. The
identity gate never expands its target to complete ayat: retrieval and local
continuation retain exact mid-ayah word boundaries. Complete-ayah expansion
occurs only after identity acceptance, when the separate forced-alignment run
scores the known display passage with a max-path Viterbi score per frame.

The field named `bestWindowCtc` is currently mislabeled and behaviorally
incorrect. `summarizeFastConformerIdentification` takes
`selectedInsideSurah[0]`, the first non-null candidate in chronological path
order, rather than the maximum normalized score. The production gate consumes
that value. Meanwhile `fastconformer-window-result` logs the independently
reranked winner for each window, which can differ from the candidate selected
by the global Viterbi path. Thus the two logs intentionally describe different
candidates, but selecting the first path candidate as "best" is not
intentional best-window semantics. No target is recomputed and no full-ayah
span is scored at this gate.

Debug-media output now emits one `ctc-gate-input` record per window and one
`final-ctc-gate-components` record. They expose the independent winner, exact
coherent-path candidate, audio/sample interval, target word coordinates, token
count, raw and normalized score, frame denominator, first-path value, actual
coherent-path maximum, and recomputed mean without changing acceptance.

The five-window long-timeline rule came from `c69a018`: a recovery could
otherwise assemble a plausible span from one strong local phrase plus weak,
mixed, or skipped windows. Commit `756b052` scoped the mean gate to five or
more generated windows after the real three-window Muddaththir recovery showed
that a noisy supporting edge (`-1.676116`) could pull the two-candidate mean to
`-1.012985` even though the correct opening scored `-0.349854`. Long clips
therefore still require both the reported best-window value and coherent-path
mean to reach `-0.60`, plus 60% coherent-window support, no unsupported run of
three, at least 50% VAD-qualified voiced coverage, two agreeing windows, a
0.05 global margin, same-surah structure, and lexical uniqueness of at least
0.08.

The supplied 2:258-259 and 6:74-77 recordings were not present in the local
workspace, attachments, or retained private fixture directory, so their raw
path arrays and Whisper transcripts could not be replayed. The reported Surah
2 margin (`38.5135`), 18/19 path support, 0.95 voiced-window coverage, monotonic
same-surah span, and one-window maximum gap nevertheless establish overwhelming
dominance over the runner-up under the current global solver. Whisper's
abstention is independent text-match weakness, not contradictory acoustic
evidence: the fallback neither consumes nor vetoes FastConformer evidence.

Frame normalization removes raw duration accumulation but does not make target
choice length-neutral. Added unrecited tokens must be emitted and worsen fit;
very short targets can explain remaining frames as blank. The solver's
`targetCoverage` short-target penalty exists for that latter bias, but the
reported CTC metric itself remains only log likelihood per acoustic frame.
Partial-ayah start/end handling does not cause the reported Surah 2 gate
failure because identity candidates are word-bounded; full-ayah forced
alignment happens only after acceptance. A future fix should first make
best-window mean the maximum candidate score on the winning coherent path,
then use retained real reports to design an edge/partial-window-aware long-path
statistic while preserving the isolated-phrase, repeated-language, coverage,
gap, margin, and wrong-surah protections.

# Quran acoustic-alignment research

Status: development/shadow research only (2026-09-05). This milestone does
not modify the authoritative `CaptionSegment[]` timing path. The canonical
passage is still identified by whole-recording Whisper, and all FastConformer
results are diagnostics in development builds only.

## Conclusion

The evidence supports changing the *future* timing problem formulation from
independent ayah-boundary heuristics to global acoustic alignment of a known,
canonical passage. A Quran-specific CTC acoustic model makes that technically
feasible: CTC Viterbi can force an exact known BPE target monotonically through
the full audio and return canonical word timestamps. That is only a
feasibility result, not proof of accuracy. There are no checked-in real audio
fixtures or verified human boundary labels for the required four recording
families, so no engine may be promoted.

## QuranCaption study and license boundary

QuranCaption is licensed CC BY-NC 4.0. Its application code must not be
copied, adapted, or shipped in this commercial product. The account below is
an independent architectural analysis only.

Its local **Quranic Universal Aligner** has this shape:

```text
16 kHz audio → Quran VAD segments → phoneme CTC ASR
  → n-gram anchor vote (surah/ayah) → sequential local phoneme DP
  → optional MFA word/letter/phoneme timing
```

- VAD uses the custom `obadx/recitation-segmenter-v2` model before recognition.
- Each speech segment is decoded by a private/gated `hetchyy/r15_95m` or
  `hetchyy/r7` phoneme CTC model.
- A five-gram phoneme index votes for an initial Quran location. It is an
  identity/position anchor, not a timing estimator.
- The aligner phonemizes an entire surah with verse-stop behavior, then aligns
  the recognized phonemes to a bounded reference window around a sequential
  word pointer. Its substring Levenshtein DP may begin only on word boundaries
  and scores only word-end candidates. This prevents a best edit-distance path
  from returning an arbitrary inside-word span.
- The DP uses distinct insertion/deletion/substitution costs, including a
  table of phonetic substitution costs, and adds a distance-from-expected-word
  prior. This is a robust way to resist repeated Quran phrases and local ASR
  errors without abandoning sequence order.
- It has an optional wrap arc for a repeated canonical phrase; the arc is
  penalized by both occurrence and span and is retained as repetition metadata
  rather than moving the display cursor backward.
- A failed primary pass retries with a wider window and relaxed threshold.
  After the configured number of consecutive failures it runs n-gram voting
  again to re-anchor. It also detects Basmala/Isti'adha and surah-transition
  segments separately.
- Its optional MFA path delegates precise word/letter/phoneme time alignment
  to an external service after segment/reference matching. That service is not
  a browser-local production option here.

This is architecturally stronger than the current system in its core premise:
the Quran reference is always present inside one global sequential alignment.
Our current pipeline uses Whisper for passage identity plus timestamp,
micro-ASR, VAD, PCM, Darten, and historical boundary evidence; those sources
can disagree and have previously formed bad hard corridors. QuranCaption's
architecture would be more resistant to spelling mistakes and repetitions if
the phoneme ASR is good. It is not automatically more accurate: segment-level
reset/retry can lose global continuity, its ASR models are private/gated, and
its application implementation is noncommercial.

Its separate **Surah Splitter** is a different approach: Quran-tuned Whisper
transcription, WhisperX word alignment, Quran reference matching, then word
span → ayah generation. It benefits from word timestamps but remains a
transcription/matching pipeline rather than a known-target acoustic forced
aligner.

The released local FastConformer source is present at
`quran_recite_to_text/.../fastconformer.py`. It downloads a separate
`qurankarim-fastconformer-mixed.onnx`, resamples to 16 kHz, optionally applies
LUFS/peak normalization, computes 80-bin 25 ms/10 ms-hop Kaldi fbanks,
per-feature normalizes them, then feeds `[1,80,T]` features and sequence
length to ONNX Runtime. It greedily collapses BPE tokens (blank 1024) at a
declared 80 ms output stride and derives word timestamps from word-prefix
tokens. This is a genuine local FastConformer transcription implementation,
but it is Python/CPU-oriented, has a different input contract from Tilawa's
raw-waveform graph, and its downloaded model's commercial license is not
established here. It is study-only and not a browser integration candidate.

Sources: [QuranCaption license](https://raw.githubusercontent.com/zonetecde/QuranCaption/main/LICENCE),
[multi-aligner overview](https://raw.githubusercontent.com/zonetecde/QuranCaption/main/src-tauri/python/quran-multi-aligner/README.md),
[phoneme matcher](https://github.com/zonetecde/QuranCaption/blob/main/src-tauri/python/quran-multi-aligner/src/alignment/phoneme_matcher.py),
[retry/re-anchor pipeline](https://github.com/zonetecde/QuranCaption/blob/main/src-tauri/python/quran-multi-aligner/src/alignment/alignment_pipeline.py),
and [local FastConformer wrapper](https://github.com/zonetecde/QuranCaption/blob/main/src-tauri/python/quran_recite_to_text/src/phase1_transcribe/fastconformer.py).

## Tilawa FastConformer study

Tilawa's current browser model is `fastconformer_full_mixed.onnx`:

| Property | Verified value |
| --- | --- |
| PCM contract | mono Float32, 16 kHz; `audio_signal: [1,N]`, `length: [1]` int64 |
| Preprocessing | embedded in the ONNX graph (no external mel/normalization step) |
| Output | `[1,T,1025]` Arabic SentencePiece-BPE CTC log-probabilities |
| Blank id | 1024 |
| Model bytes | 88,307,366 (~88.3 MB), mixed int4/int8 |
| Required target assets | `vocab.json` 21,062 bytes + Quran BPE target table 12,211,783 bytes |
| Browser runtime | `onnxruntime-web`; Tilawa uses WASM single-threaded for reliability |

Tilawa greedily decodes CTC frames by argmax, collapses repeats/blanks, and
uses normalized text for Quran candidate retrieval. It retrieves candidate
verses/spans using text similarity and continuation hints, then reranks the
shortlist by full CTC forward probability. Streaming maintains a recitation
tracker with continuation bias and repeat/stability gates. This is designed
for *identification*; it is not the same as a timestamping guarantee.

The checked-in benchmark harness reports full-file v1 recall/precision/exact
set accuracy of 100% for a TTA variant and 98% without TTA. That is an
upstream claim on its own v1 corpus, not a validated timing benchmark and not
evidence for our recordings. Its documented v3 streaming result for an older
phoneme model is 89.3% recall, 73.4% precision, and 58.2% ordered sequence
accuracy. Moreover, Tilawa's own prefix-context study finds roughly half of
short-prefix greedy tokens change when full bidirectional context arrives;
we must run full known-passage audio, not commit prefix results as boundaries.

Sources: [Tilawa session contract](https://github.com/yazinsai/tilawa/blob/main/packages/core/src/session.ts),
[browser ONNX adapter](https://github.com/yazinsai/tilawa/blob/main/web/frontend/src/worker/session.ts),
[CTC reranker](https://github.com/yazinsai/tilawa/blob/main/packages/core/src/ctc-rescore.ts),
and [benchmark harness/results](https://github.com/yazinsai/tilawa/blob/main/lab/EXPERIMENTS.md).

## FastConformer forced-alignment prototype

Implemented `src/lib/recognition/local-fastconformer.ts` as a lazy,
development-only browser shadow. It:

1. receives the same decoded 16 kHz mono PCM and VAD-constrained interval as
   existing recognition engines;
2. fetches and Cache-API-caches the immutable FastConformer revision plus its
   vocabulary and public Quran BPE target table;
3. builds an exact canonical target from the selected verse range, verifies
   every BPE sequence round-trips to the project's canonical normalized word,
   and maps each BPE token to its canonical word;
4. runs one full-passage monotonic CTC Viterbi alignment, with deterministic
   tie breaking and no `+1 ms` endpoint repair;
5. returns canonical word timestamps (`CtcWordTiming`, equivalent to the
   requested `CanonicalWordAlignment[]` fields: verse key, word index, start,
   end, acoustic score), ayah starts derived solely from each ayah's first
   acoustically aligned word, greedy transcript, `[T,V]` logits metadata,
   confidence, backend, load/download size, and runtime.

The debug result deliberately describes its range as
`known-canonical-passage`: FastConformer does not replace Whisper passage
identity in this milestone. The result is never passed into
`analyzeTranscript`, boundary solvers, `VerseAlignment`, or `CaptionSegment`
creation. The 100.5 MB first-use footprint (88.3 MB model + 12.23 MB target
assets) and real browser runtime remain measured unknowns.

### Can CTC logits force-align known Quran text?

Yes, mechanically: CTC provides a dynamic program over blank and known BPE
label states, with stay / one-state advance / blank-skipping advance. The
known label path can be mapped to word ownership, yielding global monotonic
timestamps. The existing test proves target construction and frame-exact
paths; it does **not** prove the acoustic model assigns a good probability to
each chosen Quran recording. Bad or mismatched acoustics can still force a
complete but wrong path, so free greedy decode, per-word posterior, and human
labels are required gates before promotion.

## Phoneme-first feasibility

[Quranic-Phonemizer](https://github.com/Hetchy/Quranic-Phonemizer) is MIT and
commercially usable with its attribution/license notice. It supports Hafs and
Warsh, waqf/ibtidaa transformations, tajweed mappings, word boundaries, and a
68-base-phoneme Hafs inventory plus optional distinctions. It is an excellent
reference/target generator for a future phoneme CTC system.

A browser-compatible phoneme architecture would be:

```text
canonical Hafs text → tajweed/waqf-conditioned phonemes → public Quran phoneme CTC
  → one global monotonic phoneme DP → word/ayah boundaries
```

It may ultimately outperform BPE for tajweed, elongation, assimilation, and
Whisper spelling errors. It also needs a publicly available, commercially
licensed, browser-runnable Quran phoneme acoustic model with its vocabulary,
preprocessing, and weight license audited. QuranCaption's listed
`hetchyy/r15_95m` / `r7` models are private/gated; their commercial licensing
cannot be independently verified from the public source. They are therefore
not eligible for this product. The listed QuranCaption VAD model's exact
license was likewise not verified here, so existing Apache/MIT-compatible
browser VAD remains the safe choice.

| Criterion | FastConformer BPE CTC | Future phoneme CTC |
| --- | --- | --- |
| Browser asset now | public ~100.5 MB total | no qualified public model found |
| Canonical target | published BPE table | tajweed-aware generated phonemes |
| Tajweed/Hafs sensitivity | indirect, learned text acoustic model | explicit, potentially stronger |
| Whisper spelling errors | irrelevant after known target | irrelevant after known target |
| Repetitions | monotonic target; explicit repeat arcs would need validation | naturally modelable with reference-repeat arcs |
| Commercial status | CC-BY-4.0 asset, attribution required | G2P MIT; ASR model unavailable/unverified |

## License audit

| Component | License/status | Commercial suitability |
| --- | --- | --- |
| QuranCaption application and bundled multi-aligner | CC BY-NC 4.0 | **No.** Study only; do not copy/adapt. |
| Quranic-Phonemizer source | MIT | **Yes** for a future independent port/integration, preserving notice. |
| Tilawa source | MIT | **Yes** for independently implemented ideas/code with notice, but this prototype does not copy it. |
| `acibZ/tilawa-quran-onnx` FastConformer assets | CC-BY-4.0; based on NVIDIA FastConformer | **Yes**, with clear attribution and license compliance. |
| QuranCaption `hetchyy/r15_95m`, `hetchyy/r7` phoneme ASR | private/gated | **Unknown / no.** Do not integrate. |
| QuranCaption `obadx/recitation-segmenter-v2` VAD | exact upstream terms not verified | **Unknown / no.** Do not integrate. |

Sources: [Quranic-Phonemizer MIT license](https://github.com/Hetchy/Quranic-Phonemizer/blob/main/LICENSE),
[Tilawa MIT license](https://github.com/yazinsai/tilawa/blob/main/LICENSE), and
[FastConformer asset card](https://huggingface.co/acibZ/tilawa-quran-onnx).

## Real-fixture benchmark status

The existing repository contains deterministic test shapes and two supplied
debug exports, but no media for 6:74–77 or 69:19–32 and no verified label file
for any required family. The table therefore records only evidence we can
honestly report. `UNKNOWN` is not a pass.

| Fixture | Human truth | Production / current evidence | Darten | FastConformer | Phoneme | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 6:74–77 | approximate starts: 9,500 / 21,000 / 32,000 / 44,832 ms | supplied current: 9,660 / 28,608 / 40,753 / 50,598; existing evidence shadow: 9,660 / 21,696 / 32,064 / 44,832 | known low-confidence drift | real browser run complete: 9,600 / 21,668 / 31,978 / 44,765 ms; upstream Tilawa detects 6:74–77 at 0.9754 | not prototyped | one real fixture; approximate reference only |
| 93:1–5 | existing manual/debug truth in test shape | starts 1,640 / 2,670 / 4,000 / 9,420 / 14,640 ms | no real export | not run: media absent | not prototyped | no external human-label artifact |
| 3:33–35 | UNKNOWN | passage-completion regression only | no real export | not run: media absent | not prototyped | identity coverage, not timing benchmark |
| 69:19–32 | UNKNOWN | passage correct; timing uncertain | 12/14 starts were weak CTC-derived | not run: source media absent | not prototyped | no ground truth |

For the approximate Surah 6 labels only, prior audit results were production
median/p90/max 7,608/8,753/8,753 ms and evidence-weighted shadow
160/696/696 ms. This must not be compared to a future FastConformer result
until it runs on the same media with immutable human labels.

The first successful real FastConformer browser run used the 66,083 ms
Surah 6:74–77 recording. Its raw logits were 698 frames with 1,025 vocabulary
entries, blank ID 1,024, and approximately 79.9198 ms per frame. The custom
forced-path mean score (about 0.0347) is not a calibrated probability and must
not be compared to the upstream Tilawa passage confidence of 0.9754.

`npm run evaluate:real -- <alignment-debug.json> --labels=<labels.json>` now
emits a `REAL ALIGNMENT COMPARISON` row per ayah and
medianAbsoluteErrorMs/p90AbsoluteErrorMs/maxAbsoluteErrorMs,
missingBoundaryCount, and structuralFailureCount for production, Darten,
FastConformer, and the existing shadow. `src/lib/recognition/real-evaluation-registry.ts`
keeps the four planned recording passages and their truth state separate from
timing logic. It labels the phoneme approach as unprototyped instead of
inventing a score.
It labels the phoneme approach as unprototyped instead of inventing a score.

## Recommended direction and simplification gate

Keep the current production pipeline unchanged. Next, collect checked-in or
externally referenced real fixtures plus independently verified labels; execute
the FastConformer shadow in a real browser and compare its word-derived ayah
starts against all four families. Promotion requires lower median and p90
error, no structural/missing ayat failures, acceptable cold/warm runtime, and
no regression in 93 or 3. Only then consider this final architecture:

```text
audio → Quran acoustic model → known-passage/global canonical CTC alignment
  → ayah boundaries from first aligned words → CaptionSegment[]
```

VAD should remain for first onset, final end, and validation; it should not
select Quran identity. If labeled benchmarks prove FastConformer (or a later
licensed phoneme model) wins, likely retirement candidates are Darten,
micro-ASR timing recovery, PCM transition heuristics, and eventually Whisper
for identity. Do not remove Whisper, VAD, or any heuristic before that
evidence exists.

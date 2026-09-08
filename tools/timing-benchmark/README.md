# Quran word-timing benchmark

This development-only harness measures canonical Quran **word** boundaries.
It is not imported by the application and does not alter production caption or
timing behavior.

## Run

First serialize one or more `WordTimingResult` values, normally by adapting an
unchanged `FastConformerResult` with `fastconformerCurrentAdapter`. Then run:

```sh
npm run timing:benchmark -- --results path/to/results.json --output /tmp/quran-timing-report
```

It writes `/tmp/quran-timing-report.json` and `.md`. A structural failure
(missing, duplicate, out-of-order, backwards, or non-positive word timing)
returns exit code 2. This is intentional: a lower timing error cannot excuse a
broken canonical sequence.

## Real quran-align sample

Run the fixed real-audio benchmark with:

```sh
npm run timing:benchmark:real -- --output tools/timing-benchmark/results/<date>-quran-align-real
```

If a host limits one local ONNX Runtime process, run deterministic contiguous
batches (`--start 0 --limit 15`, then the next ranges) and merge their
metrics-only JSON files with `npm run timing:benchmark:merge`. The fixed
manifest contains 45 ayah recordings across Alafasy 128 kbps, Hani Rifai 192
kbps, and Husary Muallim 128 kbps. Each fixture verifies the quran-align
reciter/bitrate filename, EveryAyah-style ayah filename, canonical Tanzil word
count, decoded audio duration, and `reference end <= audio duration`. A failed
mapping is excluded, never shifted. Downloads live only under ignored
`tools/timing-benchmark/.cache/`.

`release-2016-11-24` contains a malformed
`Abdurrahmaan_As-Sudais_192kbps.json` asset (an alignment crash log instead of
JSON), so it is explicitly excluded rather than silently repaired.

`fixtures/manual-boundaries.json` preserves the supplied 6:74–77, 69:19–32,
93:1–5, and 3:33–35 history. Its reviewed data are ayah starts, stored in
`boundaries`, not fabricated word labels. Reports show them separately as
`ayah-boundary-start` evidence.

## Engines and experiments

Every candidate implements `WordTimingEngine` and returns the normalized
`WordTimingResult`: known canonical words, runtime, and development
diagnostics. The shipped adapter is `fastconformer-current`; future candidates
must use separate IDs such as `fastconformer-boundary-refined` or `phoneme-dp`.
Passage identification is intentionally outside this interface.

`ctc-boundaries.ts` provides evaluation-only raw-path alternatives:

- first CTC token frame (the current policy);
- blank-to-lexical transition on that immutable Viterbi path;
- posterior half-mass onset for the frames assigned to a word.

It also supports local RMS-rise refinement within an explicit benchmark window.
That function may only move a known canonical boundary locally; it cannot
select Quran words, passage identity, display segmentation, or arbitrary
duration interpolation. Compare the configured windows on the benchmark before
considering a candidate. No candidate is eligible for promotion unless it
improves median, p90, catastrophic error, and preserves structural coverage.

The raw diagnostic schema records canonical and lexical words, assigned CTC
tokens, token posterior, frames, frame-to-ms conversion, neighboring blank
posterior, and adjacent word timing. It is tool-only and must not be exposed in
the product UI.

`variants.ts` provides deterministic clean/room-noise/gain-reduction/mild-reverb
PCM variants. Results must be reported in separate clean and degraded cohorts;
synthetic noise is never a substitute for a real noisy fixture. It also records
the expected `timestamp / playbackSpeed` mapping for 0.9×/1.0×/1.1× trials.
It deliberately does not use a naïve linear resampler: materialize those speed
fixtures with a high-quality audio tool before scoring, so the transform itself
does not become the benchmark artifact.

## Frame-stride and current boundary audit

The runner supplies raw-waveform 16 kHz PCM as `[1, N]` to the pinned ONNX
graph. The graph produces CTC `[1, T, 1025]`; `forceAlignCtc` maps frame `f`
to `windowStartMs + (windowEndMs - windowStartMs) * f / T`. Word start is the
first Viterbi frame assigned to any non-repeat target token. Production word
end is the selected CTC transition frame, scored from that word's terminal
posterior, blank evidence, and the next word's onset posterior; the final word
uses its observed terminal frame. It does not use character percentages, ayah
percentages, a global offset, equal durations, caption splitting, or a
one-millisecond collision repair. Benchmark baseline calls retain the former
one-frame-after-last-token policy only for fixed historical comparison.

Therefore the quantization floor is one **observed CTC output frame**, not an
assumed model constant. For the documented Surah 6 VAD-constrained run, the
55,784 ms alignment window and 698 output frames yielded about 79.9198 ms per
frame. The report must record each run's `windowDurationMs / frameCount`; do
not reuse that value for another clip until its actual `T` is known.

## External `cpfair/quran-align` data

The repository source is MIT, while its release timing files are CC BY 4.0
(attribution required). Its README states that timing is automatically aligned,
may combine word spans, and lacks human-reviewed ground truth. `cpfair.ts`
imports only observed segment boundaries as `external-reference-dataset`; it
never marks them human-reviewed.

Before adding a fixture, record the release URL/version, attribution, reciter,
and exact matching audio URL and license. The project describes EveryAyah-style
audio input but does not make a generic timing file interchangeable with an
arbitrary recording. No external data/audio is checked in here because that
recording and license match has not been verified.

## Independent phoneme-DP experiment and upstream audit

`quran-phonetics.ts` is an independent, deterministic Hafs-oriented phonetic
target. It preserves every `(verseKey, canonicalWordIndex)` boundary and covers
Uthmani silent signs, hamza carriers, shadda expansion, initial/connected wasl,
sun-letter lam assimilation, vowels, and waqf/silent marks without changing
display text. `phoneme-dp.ts` consumes frame-level phoneme log probabilities
with one global CTC/Viterbi DP; its state path cannot omit, duplicate, or
reorder canonical words. The unit suite runs the complete DP on synthetic
phoneme evidence.

That is deliberately not yet a real-audio `phoneme-dp` benchmark contender:
the audited QuranCaption repository is CC BY-NC 4.0 at its root. Its embedded
`quran-multi-aligner/README.md` declares MIT, but the repository tree has no
separate subcomponent LICENSE file; its relevant files (`phoneme_asr.py`,
`phoneme_matcher.py`, `alignment_pipeline.py`, and `phonemizer_utils.py`) carry
no independent license header. The README names `hetchyy/r15_95m` and
`hetchyy/r7`; `phoneme_asr.py` loads them with an optional private HF token and
the component requires Python, Torch, Transformers, Cython, and native audio
packages. No model size, permissive model license, ONNX export, or browser
runtime contract was verified. It is therefore not copied, downloaded, or
shipped. A report explicitly records this as non-production-eligible rather
than fabricating phoneme acoustic evidence.

The separate CTC `fastconformer-transition-boundary` experiment is fully
real-audio runnable. It preserves the existing first lexical-frame starts and
selects each non-final end from the known forced CTC path's current terminal
posterior, blank transition evidence, and next-word onset posterior. It adds
no model assets and remains browser-local because it uses the existing
FastConformer ONNX/WASM output.

Upstream references audited on 2026-09-07: QuranCaption repository root
`LICENCE` (CC BY-NC 4.0), `src-tauri/python/quran-multi-aligner/README.md`,
`requirements.txt`, `setup.py`, and the four alignment sources above at
`https://github.com/zonetecde/QuranCaption/tree/main`. Quranic-Phonemizer's
public repository is MIT and documents a Hafs inventory, but it is a text G2P,
not a browser phoneme acoustic model, so it was not bundled.

Its optional MFA stage is a separate local/native forced-alignment workflow,
not a browser model. Montreal Forced Aligner requires an acoustic model and
pronunciation dictionary, and normally operates on files with native Python/
Kaldi dependencies. It would add a second model, local storage/download,
native-runtime packaging, and a meaningful privacy boundary if moved remote.
Its precise improvement for Quran recitation is unmeasured in our fixtures, so
no operating-cost or timing claim is made and no service is integrated.

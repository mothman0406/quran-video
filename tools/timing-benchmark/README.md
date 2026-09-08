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

The current runner supplies raw-waveform 16 kHz PCM as `[1, N]` to the pinned
ONNX graph. The graph produces CTC `[1, T, 1025]`; `forceAlignCtc` maps frame
`f` to `windowStartMs + (windowEndMs - windowStartMs) * f / T`. Word start is
the first Viterbi frame assigned to any non-repeat target token of that word;
word end is one frame after the last assigned token frame. `frameExactEndpoints`
keeps these values intact. It neither takes a midpoint nor uses the next word
start, blank transition, character interpolation, caption splitting, or a
one-millisecond collision repair.

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

## Phoneme DP and MFA research

The QuranCaption application is CC BY-NC 4.0; do not copy its code. Its
described phoneme CTC → word-boundary-constrained sequential DP approach is a
useful independent design reference. Quranic-Phonemizer is MIT and can provide
future Hafs phoneme targets, but the QuranCaption phoneme ASR models named in
its materials are private/gated, so their model license, size, browser support,
and commercial use cannot be verified. No qualified local browser phoneme model
is currently available, hence `phoneme-dp` remains a research placeholder.

Its optional MFA stage is a separate local/native forced-alignment workflow,
not a browser model. Montreal Forced Aligner requires an acoustic model and
pronunciation dictionary, and normally operates on files with native Python/
Kaldi dependencies. It would add a second model, local storage/download,
native-runtime packaging, and a meaningful privacy boundary if moved remote.
Its precise improvement for Quran recitation is unmeasured in our fixtures, so
no operating-cost or timing claim is made and no service is integrated.

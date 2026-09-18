# Quran CTC calibration corpus

## Scope and privacy contract

This corpus is offline calibration evidence only. It does not change passage
acceptance, thresholds, candidate selection, VAD, Whisper, forced alignment,
media preparation, or caption timing.

Schema-v1 captures retain only the expected outcome/range, window counts,
coherent-path CTC score or null, voiced duration, target coverage/token count,
anchor event, candidate origin, aggregate gate evidence, proposed Quran
coordinates, and FastConformer/final decisions. They exclude audio,
transcripts, source filenames, paths, PCM, hashes, Quran text, and personal
metadata. Private source media and all generated continuous recordings remain
ignored.

Convert a copied `?debugMedia=1` console log with:

```sh
npm run calibration:ctc -- debug.log \
  --id repeated-6-77 \
  --expected negative \
  --intent 'Repeating one strong ayah must not masquerade as forward Quran progression.' \
  --surah 6 --start-ayah 77 --end-ayah 77
```

Add `--output path/to/candidate.json` to save the candidate. The input path is
never serialized. Re-evaluate the committed corpus with
`npm run calibration:ctc:evaluate`. The capture parser uses only the latest
build-marked browser run, so replayed DevTools history cannot mix recordings.

## Local media inventory

All media below is ignored and remained unmodified. Durations were read
locally with FFmpeg.

| Local path | Duration | Documented range | Calibration use |
| --- | ---: | --- | --- |
| `tmp/regression-inputs/muddaththir-74-1-9.mp4` | 22.10 s | 74:1–9 | Positive replay and isolated 5-second excerpt |
| `tools/timing-benchmark/.cache/audio/Alafasy_128kbps/*.mp3` | 19 files; 89.07 s total; 1.85–7.11 s each | 93:1–11 and 94:1–8 from filenames/cache manifest | Repeated 93:1, mixed case, and continuous 93:1–11 positive |
| `tools/timing-benchmark/.cache/audio/Hani_Rifai_192kbps/*.mp3` | 11 files; 129.33 s total; 3.35–19.91 s each | 3:33–35, 6:74–77, and 69:19–22 | Strong repetition, mixed, and reverse-order cases |
| `tools/timing-benchmark/.cache/audio/Husary_Muallim_128kbps/*.mp3` | 15 files; 141.64 s total; 4.68–13.90 s each | 75:1–15 | Available for later independent-reader validation; not needed in this batch |

No defensible short-common-language excerpt was documented in the available
media, so that category was not fabricated.

## Real captures

Each derivative was generated under ignored `tmp/ctc-calibration/`, leaving
the source files untouched, and entered the ordinary `/create?debugMedia=1`
path: one source, one canonical PCM, one top-level FastConformer identify call,
then the unchanged passage decision and fallback.

| Capture | Meaning | Chronological coherent-path CTC | Anchor behavior | FastConformer / final outcome |
| --- | --- | --- | --- | --- |
| `isolated-muddaththir-excerpt` | A five-second subsection must not extrapolate 74:1–9 | `[-0.685191]` | No activation | Abstained on best-window CTC; final abstained (Whisper proposed 2:165) |
| `repeated-93-1` | Repetition must not become monotonic progress | `[-1.828621,-1.648422,-1.724815,-1.932842,-1.667924,-1.738512,-1.706201]` | No activation | Abstained on both CTC gates; final abstained (Whisper proposed 21:98) |
| `repeated-6-77` | A strong repeated ayah must not become 6:77–78 | `[-0.689900,-0.145233,-0.647827,null,null,null,null,null,null]` | Activated at window 1; later continuation events advanced despite no winning-path candidates | FastConformer abstained on margin, coverage, and support; **Whisper fallback accepted 6:77–78 (false positive)** |
| `mixed-noncontiguous-quran` | 6:74, 93:1, 69:19, 94:1, 6:77 must not become one passage | `[-3.293638,-2.483728,-1.004629,null,null,-2.006666,-2.090891,-0.337340,-0.465856]` | Activated at 7; advanced at 8 | Abstained only on coherent-path CTC; final abstained |
| `backward-6-77-to-74` | Later-to-earlier 6:77→74 must fail progression | `[-0.689900,-0.145233,-2.147557,null,null,null,null,null,null,null]` | Activated at 1; local misses at 2/7; continuation reported advances elsewhere | Abstained on coherent CTC, coverage, and support; final fallback did not finish within the bounded capture wait |
| `muddaththir-74-1-9` | Retained positive control | `[-0.326820,-2.866820,-0.938646]` | Activated at 0; advanced at 1/2 | Accepted as 74:1–9; short-recording mode does not apply the path mean |
| `positive-alafasy-93-1-11` | Independent-reader continuous long positive | `[-0.609888,-0.643963,-0.607888,-0.496600,-0.168273,-2.772617,-1.744951,-0.439479,-1.148151]` | Activated at 4; advanced at 5/7/8 with a local miss at 6 | FastConformer proposed 93:1–11 but abstained only on coherent-path CTC; Whisper accepted 93:1–11 and forced alignment completed 93:1–11 |

For the Alafasy positive, the eleven canonical source ayat were verified as
the ordered `093001.mp3` through `093011.mp3` cache entries. They were joined
by MP3 packet copy without inserted silence or re-encoding; no Surah 94 file
was included. The ignored result is 54.96 seconds by container duration and
54.91 seconds decoded. It generated nine identification windows, all usable
and represented in the coherent path. Full
voiced duration, target coverage/token count, origins, aggregates, failed rules,
and outcomes remain in `tools/regression/fixtures/ctc-calibration/`.

## Offline statistic evaluation

The table orders known positives as 2:258–259, 6:74–77, 74:1–9, and the new
Alafasy 93:1–11 capture; the
observational value is 20:100–104. Real negatives are ordered backward,
isolated, mixed, repeated 6:77, and repeated 93:1. The final column asks whether
a threshold separates positives from negatives *after retaining all other
production gates*. It is not raw-statistic separation.

| Statistic | Known positives | Observational | Real negatives | Gate-conditioned separation |
| --- | --- | --- | --- | --- |
| Arithmetic mean | `-.844800, -1.177863, -1.377429, -.959090` | `-.837851` | `-.994230, -.685191, -1.668964, -.494320, -1.749620` | No |
| Voiced-duration mean | `-.844800, -1.177863, -1.439770, -.933992` | `-.837851` | `-.995862, -.685191, -1.617766, -.493271, -1.751439` | No |
| Target-coverage mean | `-.844800, -1.177863, -1.040097, -.782772` | `-.837851` | `-.733426, -.685191, -1.463054, -.464645, -1.741566` | No |
| Median | `-.646189, -.726755, -.938646, -.609888` | `-.640654` | `-.689900, -.685191, -2.006666, -.647827, -1.724815` | No |
| 10% trimmed mean | `-.811121, -1.077308, -1.377429, -.959090` | `-.837851` | `-.994230, -.685191, -1.668964, -.494320, -1.749620` | No |
| 10% winsorized mean | `-.830422, -1.130956, -1.377429, -.959090` | `-.837851` | `-.994230, -.685191, -1.668964, -.494320, -1.749620` | No |
| 75th percentile | `-.434903, -.495891, -.632733, -.496600` | `-.591399` | `-.417566, -.685191, -.735243, -.396530, -1.687063` | Yes, only `0.052458` |
| Strongest-three mean | `-.199509, -.338614, -1.377429, -.368117` | `-.607152` | `-.994230, -.685191, -.602608, -.494320, -1.674182` | No |
| Anchor-aware mean | `-.668121, -.959340, -1.377429, -1.143843` | `-.679730` | `-1.095673, -.685191, -1.084026, -.429127, -1.749620` | No |
| Post-anchor mean | `-.592401, -.813659, -1.377429, -1.254694` | `-.574316` | `-1.146395, -.685191, -.401598, -.396530, -1.749620` | No |
| Best plus support | `-.446685, -.557528, -.660153, -.501606` | `-.915149` | `-.478566, -1.185191, -.694483, -.478566, -2.148422` | No |
| Strongest-half mean | `-.392379, -.473052, -.632733, -.464426` | `-.574316` | `-.417566, -.685191, -.953623, -.396530, -1.686841` | Yes, only `0.052458` |

No statistic has raw separation from every real and logical negative. At the
reference `-0.60`, all 13 logical negatives remain rejected by their complete
production gate set; only `bestPlusSupport` newly accepts the logical
`isolated-strong-window`. The two apparent gate-conditioned winners, 75th
percentile and strongest-half, share the same narrow boundary: positive
74:1–9 is `-0.632733`, isolated excerpt is `-0.685191`, and the midpoint is
`-0.658962`. This `0.052458` total margin is fragile, depends on a three-window
positive, and disappears when all negative statistics are considered without
their independent gates. Reverse-order and repeated 6:77 produce stronger
upper-tail values than the closest positive, while support/coverage/margin—not
the aggregate—correctly reject them.

Anchor-aware scoring does not improve separation. It makes repeated 6:77
`-0.429127` and post-anchor scoring makes it `-0.396530`; both are much stronger
than the retained positive boundary. One isolated strong window does not defeat
the strongest-half logical shape, but repeated strong audio and non-monotonic
audio do defeat upper-tail scores and therefore require the existing
independent protections.

## Initial finding before corpus expansion

Production should **not** change. The independent-reader long positive confirms
that the arithmetic coherent-path mean can reject a correct, structurally
complete nine-window proposal: its mean is `-0.959090`, while its 75th
percentile is `-0.496600` and strongest-half mean is `-0.464426`. The only
corpus-wide separation nevertheless remains the same narrow, gate-conditioned
`0.052458` boundary set by the short Muddaththir positive and isolated excerpt.
The real strong-repetition case also remains an overall Whisper fallback false
positive. These observations are calibration evidence, not sufficient support
for changing a production statistic or threshold.

## Verified positive-source construction

Every requested cached ayah was present, ordered, and explicitly selected;
none of the requested sets was skipped. Each set was concatenated by MP3
packet copy without inserted silence or re-encoding, leaving the originals
unchanged.

| Capture | Verified range | Source/container duration | Canonical decoded duration | Generated / usable windows | Class |
| --- | --- | ---: | ---: | ---: | --- |
| `positive-alafasy-94-1-8` | 94:1–8 | MP3, 34.116 s | 34.065 s | 5 / 5 | LONG positive |
| `positive-hani-3-33-35` | 3:33–35 | MP3, 37.930 s | 37.918 s | 6 / 6 | LONG positive |
| `positive-hani-69-19-22` | 69:19–22 | MP3, 25.600 s | 25.588 s | 4 / 4 | SHORT positive |
| `positive-husary-75-1-15` | 75:1–15 | MP3, 141.610 s | 141.598 s | 23 / 23 | Recognition-failure candidate |

The unchanged production flow made one canonical PCM and one top-level
identify call per recording. Its outcomes were:

| Capture | Chronological coherent CTC | FastConformer | Final authority/result | Forced alignment |
| --- | --- | --- | --- | --- |
| Alafasy 94:1–8 | `[-.532163,-.369556,-1.017258,-.332286,-.726095]` | Accepted 94:1–8 | FastConformer, accepted 94:1–8 | Complete, 94:1–8 |
| Hani 3:33–35 | `[-2.052879,-.733451,-.423793,-2.040255,-2.117559,-.206648]` | Proposed 3:33–35; abstained on coherent-path CTC | Whisper abstained; no final accepted range | Not started |
| Hani 69:19–22 | `[null,-1.318535,-2.518630,null]` | Proposed 69:19–22; abstained on best-window CTC | Whisper accepted 69:19–22 | Complete, 69:19–22 |
| Husary 75:1–15 | `[-2.011824,-2.755617,-.846615,null,-1.411468,null,-1.996437,null,-1.748381,-2.270577,-1.705656,-.430692,-.589769,-.633843,-2.628980,-1.011341,-.432366,-2.930921,null,-1.947832,-2.313839,-1.035800,-2.318493]` | Proposed 75:1–16; abstained on coherent-path CTC | Whisper accepted 75:1–13, which is wrong for the verified source | Complete only for the wrong 75:1–13 target |

The Husary expected range remains 75:1–15. It is excluded from positive
separation calculations and retained separately as a recognition-failure
candidate. Hani 3:33–35 remains a positive because its independently known
source and FastConformer proposal agree; final abstention does not turn known
positive audio into a negative.

## Positive aggregate evidence

| Capture | Best / mean CTC | Coverage | Coherent ratio | Agreement | Margin | Lexical uniqueness |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Alafasy 94:1–8 | `-.332286 / -.595472` | 1.0000 | 1.0000 | 5/5 | 12.5853 | .388938 |
| Hani 3:33–35 | `-.206648 / -1.262431` | 1.0000 | 1.0000 | 6/6 | 9.1706 | .232772 |
| Hani 69:19–22 | `-1.318535 / -1.918582` | .5575 | .5000 | 2/4 | 1.7430 | .366826 |
| Husary 75:1–15 failure candidate | `-.430692 / -1.632655` | .8096 | .8261 | 19/23 | 29.8580 | .374293 |

The retained positive corpus now has two SHORT controls (74:1–9 and Hani
69:19–22) and five LONG correct-range recordings: 2:258–259, Hani 6:74–77,
Alafasy 93:1–11, Alafasy 94:1–8, and Hani 3:33–35. These represent three
reciter/source groups: Hani Rifai, Alafasy, and the unattributed independent
2:258–259 source. The Husary source is not counted because recognition chose
the wrong range.

## Long-positive scalar separation

For each statistic, the positive boundary is the minimum over the five LONG
correct-range positives. Raw negatives include every real and logical
negative. Gate-conditioned negatives retain only shapes whose other production
gates pass. Positive margins mean separation.

| Statistic | Minimum LONG positive | Maximum raw negative | Raw margin | Maximum gate-eligible negative | Gate margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Arithmetic mean | -1.262431 | -.100000 | -1.162431 | -.685191 | -.577240 |
| Voiced-duration-weighted mean | -1.326004 | -.100000 | -1.226004 | -.685191 | -.640813 |
| Target-coverage-weighted mean | -1.177863 | -.100000 | -1.077863 | -.685191 | -.492672 |
| Median | -1.386853 | -.100000 | -1.286853 | -.685191 | -.701662 |
| 10% trimmed mean | -1.262431 | -.100000 | -1.162431 | -.685191 | -.577240 |
| 10% winsorized mean | -1.262431 | -.100000 | -1.162431 | -.685191 | -.577240 |
| 75th percentile | -.501208 | -.100000 | -.401208 | -.685191 | **.183983** |
| Strongest-three mean | -.454631 | -.100000 | **-.354631** | -.602608 | **.147977** |
| Anchor-aware mean | -1.149510 | -.100000 | -1.049510 | -.685191 | -.464319 |
| Post-anchor mean | -1.254694 | -.100000 | -1.154694 | -.401598 | -.853096 |
| Best plus support | -.557528 | -.100000 | -.457528 | -.600000 | **.042472** |
| Strongest-half mean | -.473052 | -.100000 | -.373052 | -.685191 | **.212139** |

No statistic has raw separation. Strongest-three is the least-overlapping raw
statistic but still overlaps by `.354631`. Four statistics have only
gate-conditioned separation. The largest is strongest-half at `.212139`; the
narrowest is best-plus-support at `.042472`, between long positive 6:74–77
(`-.557528`) and logical `isolated-strong-window` (`-.600000`). These margins
do not justify a production threshold.

## Long-positive feature distribution versus real negatives

Values are `minimum … median … maximum`. Null legacy fields are omitted from
the corresponding distribution.

| Feature | Correct LONG positives | Real negatives | Reading |
| --- | --- | --- | --- |
| Coherent ratio | `.9091 … 1 … 1` | `.3 … .7778 … 1` | Positive lower bound is useful, but isolated/repeated negatives overlap at 1. |
| Coverage | `.95 … 1 … 1` | `.3282 … .7605 … 1` | Strong support signal with high-end overlap. |
| Agreement ratio | `.909091 … 1 … 1` | `.3 … .777778 … 1` | Same shape as coherence. |
| Global margin | `9.1706 … 17.2596 … 38.5135` | `2.2668 … 6.34405 … 6.5854` | Clean finite separation in this small corpus. |
| Lexical uniqueness | `.232772 … .388938 … .425552` | `.339133 … .366967 … 1` | Heavy overlap; not useful alone. |
| Unsupported-run length | `0 … 0 … 1` | `0 … 2 … 7` | Rejects several negatives, not isolated/repeated-93. |
| Anchor activation index | `1 … 4 … 6` | `1 … 1 … 7` | Overlaps. |
| Post-anchor advances | `3 … 3 … 4` | `0 … 1 … 7` | Repeated-6:77 shows that advances alone are unsafe. |
| Coherent fraction ≥ -.60 | `.3 … .333333 … .6` | `0 … .285714 … .333333` | Nearly separates, but touches at one third. |
| Coherent fraction ≥ -.80 | `.5 … .611111 … .8` | `0 … .666667 … 1` | Overlaps substantially. |
| Coherent fraction ≥ -1.00 | `.5 … .666667 … .8` | `0 … .666667 … 1` | Overlaps substantially. |
| Median CTC | `-1.386853 … -.646189 … -.532163` | `-2.006666 … -.689900 … -.647827` | Overlaps at the boundary. |
| Best CTC | `-.332286 … -.206648 … -.168273` | `-1.648422 … -.337340 … -.145233` | Repetition/backward cases can look stronger. |
| Worst CTC | `-2.952631 … -2.117559 … -1.017258` | `-3.293638 … -1.932842 … -.685191` | Overlaps. |
| Post-anchor median | `-1.148151 … -.547826 … -.450955` | `-1.724815 … -.685191 … -.396530` | Overlaps; repetition can be stronger. |
| Post-anchor support ratio | `.4 … .5 … .6` | `0 … .5 … 1` | Overlaps completely around the median. |

The useful pattern is multi-signal: backward, mixed, and repeated-6:77 cases
have low coverage/agreement or long unsupported runs; repeated-93 has no
strong-CTC fraction; the isolated excerpt has only one window; and finite
global margin is lower for every real negative than every correct long
positive. No single one of these observations is enough, and the sample is
still small, but together they justify a dedicated offline composite-rule
design and holdout-validation milestone.

## Decision

Single-statistic calibration is not viable on this corpus. Multi-signal rule
design is the next justified experiment, but the evidence is not yet enough to
change production behavior. The retained repeated-6:77 negative is unchanged:
FastConformer abstained on margin, coverage, and coherent support, then Whisper
incorrectly accepted 6:77–78. That Whisper result remains excluded from
FastConformer labels and is not fixed here.

# Quran CTC calibration corpus

## Scope and privacy contract

This milestone collects calibration evidence only. It does not change passage
acceptance, thresholds, candidate selection, VAD, Whisper, forced alignment,
media preparation, or caption timing. Each committed JSON capture retains only
the developer-supplied expected outcome/range, window counts, coherent-path CTC
score or null, voiced duration, target coverage/token count, anchor event,
candidate origin, aggregate gate evidence, proposed Quran coordinates, and
FastConformer/final decisions. Audio, transcripts, filenames, paths, PCM,
hashes, Quran text, and personal metadata are excluded.

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
`npm run calibration:ctc:evaluate`.

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

## Decision

Production should **not** change. The independent-reader long positive confirms
that the arithmetic coherent-path mean can reject a correct, structurally
complete nine-window proposal: its mean is `-0.959090`, while its 75th
percentile is `-0.496600` and strongest-half mean is `-0.464426`. The only
corpus-wide separation nevertheless remains the same narrow, gate-conditioned
`0.052458` boundary set by the short Muddaththir positive and isolated excerpt.
The real strong-repetition case also remains an overall Whisper fallback false
positive. These observations are calibration evidence, not sufficient support
for changing a production statistic or threshold.

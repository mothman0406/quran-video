# Multi-signal long-path calibration

## Scope and conclusion

This is offline rule design only. It does not change recognition acceptance,
thresholds, Whisper, VAD, retrieval, continuation, forced alignment, media
ingest, FFmpeg, transmux, OPFS, service-worker behavior, or public assets.

The retained corpus supports one simple candidate for a future, separately
approved production milestone:

1. every existing non-CTC structural/safety gate passes;
2. the long path has at least 5 generated windows;
3. global Viterbi margin is at least `8`;
4. best coherent-path CTC is at least `-0.60`; and
5. at least `25%` of coherent-path candidates have CTC at least `-0.60`.

All five known long positives pass. All five real and thirteen logical
negatives fail. Deterministic leave-one-positive-out and
leave-one-real-negative-out checks also pass every fold. This justifies the
rule as a production *candidate*, not a production change: five positive
recordings across three source/reciter groups and five real negatives are too
small to establish population-level generalization.

Run the machine-complete normalized table and evaluation with:

```sh
npm run calibration:multisignal:evaluate
```

The command emits all 27 fixtures, with unavailable values represented as
`null`. Short positives, the observational case, and Husary are never used as
ordinary long-path labels.

## Corpus classification

| Class | Count | Calibration role |
| --- | ---: | --- |
| Known long positive | 5 | Positive fitting and leave-one-out validation |
| Short positive | 2 | Regression control only |
| Real negative | 5 | Negative fitting and leave-one-out validation |
| Logical negative | 13 | Mandatory protective cases |
| Observational | 1 | Reported, never treated as ground truth |
| Recognition failure with known truth | 1 | Husary analysis only, never fitted as a positive |
| **Total** | **27** | |

The long positives are 2:258–259, 6:74–77, Alafasy 93:1–11, Alafasy
94:1–8, and Hani 3:33–35. The short controls are Muddaththir 74:1–9 and
Hani 69:19–22. Husary remains `recognition-failure-known-ground-truth`.

## Normalized real long-fixture table

`—` means explicitly unavailable, not zero. `W/U/C/A` is generated windows,
usable windows, coherent candidates, and agreeing windows. The complete
27-fixture representation is the evaluator's `featureTable`.

### Support, structure, and ranking

| Fixture | Class | W/U/C/A | Agreement | Coherence | Coverage | Gap | Valid/same-surah | Margin | Uniqueness |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| 2:258–259 | known positive | 19/—/18/18 | .947368 | .9474 | .9500 | 1 | yes/yes | 38.5135 | — |
| 6:74–77 | known positive | 11/—/10/10 | .909091 | .9091 | .9767 | 1 | yes/yes | 17.2596 | — |
| Alafasy 93:1–11 | known positive | 9/9/9/9 | 1 | 1 | 1 | 0 | yes/yes | 20.8117 | .425552 |
| Alafasy 94:1–8 | known positive | 5/5/5/5 | 1 | 1 | 1 | 0 | yes/yes | 12.5853 | .388938 |
| Hani 3:33–35 | known positive | 6/6/6/6 | 1 | 1 | 1 | 0 | yes/yes | 9.1706 | .232772 |
| Backward 6:77→74 | real negative | 10/10/3/3 | .300000 | .3000 | .3282 | 7 | yes/yes | 6.1263 | .339133 |
| Mixed non-contiguous | real negative | 9/9/7/7 | .777778 | .7778 | .7605 | 2 | yes/yes | 6.5618 | .366967 |
| Repeated 6:77 | real negative | 9/9/3/3 | .333333 | .3333 | .3339 | 6 | yes/yes | — | .339145 |
| Repeated 93:1 | real negative | 7/7/7/7 | 1 | 1 | 1 | 0 | yes/yes | 6.5854 | 1 |
| Husary 75:1–15 | recognition failure | 23/23/19/19 | .826087 | .8261 | .8096 | 1 | yes/yes | 29.8580 | .374293 |
| Observed 20:100–104 | observational | 5/—/4/4 | .800000 | .8000 | .7878 | 1 | yes/yes | 7.7877 | — |

The isolated Muddaththir real negative has one generated/usable/coherent/
agreeing window, full ratios and coverage, gap 0, margin 2.2668, and uniqueness
.8. It is intentionally outside the long table but remains in every negative
evaluation.

### Acoustic features

| Fixture | Best | Mean | Median | P75 | Top 3 | Strongest half | Worst | Fraction ≥-.60 / ≥-.80 / ≥-1.00 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2:258–259 | -.168907 | -.844800 | -.646189 | -.434903 | -.199509 | -.392379 | -2.059549 | .444444 / .611111 / .722222 |
| 6:74–77 | -.207528 | -1.177863 | -.726755 | -.495891 | -.338614 | -.473052 | -2.952631 | .300000 / .600000 / .600000 |
| Alafasy 93:1–11 | -.168273 | -.959090 | -.609888 | -.496600 | -.368117 | -.464426 | -2.772617 | .333333 / .666667 / .666667 |
| Alafasy 94:1–8 | -.332286 | -.595472 | -.532163 | -.369556 | -.411335 | -.411335 | -1.017258 | .600000 / .800000 / .800000 |
| Hani 3:33–35 | -.206648 | -1.262431 | -1.386853 | -.501208 | -.454631 | -.454631 | -2.117559 | .333333 / .500000 / .500000 |
| Backward 6:77→74 | -.145233 | -.994230 | -.689900 | -.417566 | -.994230 | -.417566 | -2.147557 | .333333 / .666667 / .666667 |
| Mixed non-contiguous | -.337340 | -1.668964 | -2.006666 | -.735243 | -.602608 | -.953623 | -3.293638 | .285714 / .285714 / .285714 |
| Repeated 6:77 | -.145233 | -.494320 | -.647827 | -.396530 | -.494320 | -.396530 | -.689900 | .333333 / 1 / 1 |
| Repeated 93:1 | -1.648422 | -1.749620 | -1.724815 | -1.687063 | -1.674182 | -1.686841 | -1.932842 | 0 / 0 / 0 |
| Husary 75:1–15 | -.430692 | -1.632655 | -1.748381 | -.928978 | -.484276 | -.984593 | -2.930921 | .157895 / .210526 / .263158 |
| Observed 20:100–104 | -.540149 | -.837851 | -.640654 | -.591400 | -.607152 | -.607152 | -1.529949 | .250000 / .750000 / .750000 |

### Anchor and progression features

Activation fraction is `(zero-based activation index + 1) / generated
windows`. Post-anchor fractions include the activation window. Legacy 2 and 6
captures retain activation indices and acoustic scores but no advance events,
so advance count and ratio are `—`.

| Fixture | Activated/index/fraction | Coherent after | Advances/ratio | Post median | Post fraction ≥-.60 / ≥-.80 / ≥-1.00 |
| --- | --- | ---: | --- | ---: | --- |
| 2:258–259 | yes / 5 / .315789 | 14 | — / — | -.534933 | .571429 / .785714 / .928571 |
| 6:74–77 | yes / 6 / .636364 | 5 | — / — | -.450955 | .600000 / .800000 / .800000 |
| Alafasy 93:1–11 | yes / 4 / .555556 | 5 | 3 / .750000 | -1.148151 | .400000 / .400000 / .400000 |
| Alafasy 94:1–8 | yes / 1 / .400000 | 4 | 3 / 1 | -.547826 | .500000 / .750000 / .750000 |
| Hani 3:33–35 | yes / 1 / .333333 | 5 | 4 / 1 | -.733451 | .400000 / .600000 / .600000 |
| Backward 6:77→74 | yes / 1 / .200000 | 2 | 6 / .750000 | -1.146395 | .500000 / .500000 / .500000 |
| Mixed non-contiguous | yes / 7 / .888889 | 2 | 1 / 1 | -.401598 | 1 / 1 / 1 |
| Repeated 6:77 | yes / 1 / .222222 | 2 | 7 / 1 | -.396530 | .500000 / 1 / 1 |
| Repeated 93:1 | no / — / — | 0 | 0 / — | — | — / — / — |
| Husary 75:1–15 | yes / 12 / .565217 | 10 | 7 / .700000 | -1.491816 | .200000 / .300000 / .300000 |
| Observed 20:100–104 | yes / 3 / .800000 | 2 | — / — | -.574316 | .500000 / 1 / 1 |

Continuation event counts cannot safely stand alone: repeated 6:77 reports
seven post-anchor advances while six windows have null coherent-path CTC, and
the backward case reports six. These events describe continuation state, not
independent proof of monotonic Quran identity.

## Distributions

Values are minimum / median / maximum.

| Feature | Known long positives | Real negatives |
| --- | --- | --- |
| Global margin | 9.1706 / 17.2596 / 38.5135 | 2.2668 / 6.34405 / 6.5854 (one missing) |
| Coverage | .9500 / 1 / 1 | .3282 / .7605 / 1 |
| Coherent ratio | .9091 / 1 / 1 | .3000 / .7778 / 1 |
| Agreement ratio | .909091 / 1 / 1 | .300000 / .777778 / 1 |
| Unsupported run | 0 / 0 / 1 | 0 / 2 / 7 |
| Fraction ≥-.60 | .300000 / .333333 / .600000 | 0 / .285714 / .333333 |
| Fraction ≥-.80 | .500000 / .611111 / .800000 | 0 / .666667 / 1 |
| Fraction ≥-1.00 | .500000 / .666667 / .800000 | 0 / .666667 / 1 |
| Anchor activation fraction | .315789 / .400000 / .636364 | .200000 / .222222 / .888889 |
| Post-anchor median | -1.148151 / -.547826 / -.450955 | -1.146395 / -.401598 / -.396530 |

Margin has clean retained separation but is not sufficient alone. Candidate
count was not retained, so its effect on margin cannot be tested without
inventing evidence. Window count does not explain margin in this sample: the
5-window and 19-window positives both clear the rule, while 7–10-window real
negatives remain below 8 or have missing margin. Repeated language reaches the
largest real-negative margin (6.5854), confirming the need to retain the
structural and acoustic stages. Husary's 29.858 margin establishes that a high
margin can identify a neighborhood while still missing an exact range edge.

## Candidate families and threshold searches

Searches are deterministic, coarse, and interpretable. No ML library,
weighted score, tree, or fixture-specific exception is used.

| Family | Shape | Exact tested values | Configurations | Perfect configs |
| --- | --- | --- | ---: | ---: |
| A | robust CTC + margin | margin `7,8,9,10`; median `-1.5,-1.25,-1,-.75,-.5`; P75/top-3/strongest-half `-.7,-.6,-.5,-.4`; fraction ≥-.60 `.2,.25,.3,.4,.5`; ≥-.80/≥-1.00 `.4,.5,.6,.7` | 120 | 48 |
| B | CTC + support | strongest-half `-.7,-.6,-.5,-.4`; coverage `.8,.9,.95`; coherence `.8,.9,.95` | 36 | 18 |
| C | margin + support + acoustic floor | margin `7,8,9,10`; coverage/coherence `.9`; best `-.6`; fraction ≥-.60 `.2,.25,.3,.4,.5` | 20 | 9 |
| D | agreement + gap + margin | agreement `.8,.9,.95`; max gap `0,1,2`; margin `7,8,9,10`; fraction ≥-.60 `.25` | 36 | 12 |
| E | fraction + coverage + margin | fraction ≥-.60 `.2,.25,.3,.4,.5`; ≥-.80/≥-1.00 `.4,.5,.6,.7`; coverage `.9`; margin `8` | 13 | 7 |
| F | anchor progression | max activation fraction `.25,.5,.75`; advance ratio `.5,.75,1`; post-anchor fraction ≥-.60 `.25` | 9 | 0 |
| G | staged fixed gates + margin + best + fraction | margin `7,8,9,10`; best `-.7,-.6,-.5,-.4`; fraction ≥-.60 `.2,.25,.3,.4,.5` | 80 | 36 |

Family F's best near-miss rejects 2:258–259 and 6:74–77 because their legacy
advance counts are unavailable. It is also semantically unsafe given the
repeated/backward event behavior. Families A/B can separate this corpus only
after fixed gates, but their upper-tail summaries are easier to satisfy as
window count creates more opportunities. Family G retains a length-stable
fraction and uses best CTC only to establish that at least one strong window
exists.

## Holdout validation

Every fold derives thresholds without the held-out item. The acoustic floor
remains the existing `-0.60` reference. The margin threshold is a full integer
point beyond the next integer containing the maximum held-in negative margin;
the fraction is the held-in positive minimum rounded down to a coarse quarter
step. Every fold selects `5 / 8 / -.60 / .25`.

| Held-out long positive | Pass | Distances: windows / margin / best / fraction |
| --- | --- | --- |
| 2:258–259 | yes | 14 / 30.5135 / .431093 / .194444 |
| 6:74–77 | yes | 6 / 9.2596 / .392472 / .050000 |
| Alafasy 93:1–11 | yes | 4 / 12.8117 / .431727 / .083333 |
| Alafasy 94:1–8 | yes | 0 / 4.5853 / .267714 / .350000 |
| Hani 3:33–35 | yes | 1 / 1.1706 / .393352 / .083333 |

All real-negative holdouts reject: backward 6:77→74 fails fixed support and
margin; isolated Muddaththir fails long scope, margin, best, and fraction;
mixed non-contiguous fails margin; repeated 6:77 fails fixed support and
finite margin; repeated 93:1 fails margin, best, and fraction.

The nearest positive boundaries are Hani 3:33–35 at margin `+1.1706`, Alafasy
94:1–8 at best CTC `+.267714`, and 6:74–77 at fraction `+.05`. The nearest
negative values by absolute distance are repeated 93:1 margin (`6.5854`,
distance `1.4146`), isolated Muddaththir best (`-.685191`, distance `.085191`),
and mixed fraction (`.285714`, distance `.035714`). The latter passes the
fraction condition but fails margin by `1.4382`; conditions are conjunctive.
The smallest positive threshold buffer is `.05` on the fraction condition.

Perturbing margin through `7,8,9` retains zero errors; `10` rejects Hani
3:33–35. Best CTC from `-.7` through `-.4` retains zero errors. Fractions
`.2,.25,.3` retain zero errors; `.4` rejects 6:74–77, Alafasy 93:1–11, and
Hani 3:33–35. The chosen values avoid fitting at an exact observed decimal.

## Resistance and length sensitivity

- Five windows: Alafasy 94 passes; the observational case and every
  five-window logical negative fail. The modeled isolated-strong negative
  fails margin (`.2 < 8`) and fraction (`.2 < .25`) despite best CTC `-.2`.
- Six to ten windows: Alafasy 93 and Hani 3 pass; all four real negatives in
  this band and all logical cases fail.
- More than ten windows: 2:258–259 and 6:74–77 pass; the 23-window Husary
  recognition failure fails fraction. More windows therefore do not make the
  fraction condition easier in the retained corpus.
- Repeated 93:1 fails margin, best, and fraction. Repeated 6:77 fails current
  coverage/coherence/margin gates even though its best CTC and fractions are
  strong. The logical repeated/shared-language cases retain their lexical
  uniqueness protection.
- Mixed audio fails margin; it also has coverage `.7605`, coherence `.7778`,
  gap 2, and fraction ≥-.60 `.285714`. Backward audio fails current
  coverage/coherence/gap protection and margin. Logical wrong-surah and
  backward fixtures continue to fail fixed gates.

## Husary and fallback exposure

Husary is not a clean positive for fitting. The candidate rejects the
FastConformer 75:1–16 proposal because only `3/19 = .157895` coherent scores
reach `-.60`, below `.25`; its margin and best score pass. If a looser rule
accepted it, the exact proposed 75:1–16 span—not the known 75:1–15 truth—would
be passed to forced alignment.

Current forced alignment constructs a complete canonical target from the
already selected verse list and fails unless it reaches that complete target.
The authoritative-timing selector then requires returned ayah keys to exactly
match the selected span. There is no retained evidence or implemented logic
that trims 75:1–16 back to 75:1–15. A +1 FastConformer edge may be closer than
Whisper's -2 truncation, but closeness is not sufficient evidence of safe
caption ownership. Husary is therefore a separate range-boundary problem.

Six known cases currently enter Whisper because FastConformer abstains on a
CTC gate: five known positives (long 2:258–259, 6:74–77, Alafasy 93:1–11,
Hani 3:33–35, plus short Hani 69:19–22) and the Husary recognition failure.
For long recordings, this candidate would accept the four correct-range
CTC-abstaining positives while leaving Husary rejected; Alafasy 94 already
passes FastConformer. It could therefore reduce four unnecessary long-path
fallbacks. It does not change the short Hani case or fix repeated 6:77, where
FastConformer still correctly abstains and Whisper still falsely accepts
6:77–78. Whisper needs a separate future calibration milestone for fallback
false positives and edge truncation.

## Decision and limitations

**Production candidate justified: YES, for a future separately approved
implementation milestone.** The exact candidate is the five conjunctive
conditions at the top of this report. There are zero false positives and zero
false negatives on fitted labels, all mandatory holdouts pass, and no retained
isolated, repeated, mixed, backward, or length exploit succeeds.

Confidence remains limited by corpus size, correlated fixtures, two legacy
positives with missing advance events and uniqueness, absence of retained
candidate counts, and lack of truly prospective audio. The single next action
is to validate this frozen candidate without threshold changes on a new,
independent batch of long continuous positives and adversarial negatives
before authorizing production implementation.

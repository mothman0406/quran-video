# Frozen multi-signal long-path external validation

## Decision

**EXTERNAL VALIDATION FAILED.** The independent batch contains one false
negative and one false positive under the rule frozen before media inventory.
The rule is not justified for production implementation.

## Frozen rule and sequencing proof

Starting revision: `aef77daaab251b1b11d593d26cc8487e9984240b`.
Baseline was clean on `validate/multisignal-long-path-rule`; 474/474 tests
passed. Before the broader private-media inventory, the validation-only
`FROZEN_EXTERNAL_VALIDATION_THRESHOLDS` constant and the
`external-validation thresholds are exact, immutable, and fixture-independent`
test were added and passed. The evaluator imports only that frozen constant;
it has no threshold derivation, fitting, perturbation, or optimization path.

The candidate is exactly:

```text
existingSafetyGatesPass
AND totalGeneratedWindows >= 5
AND globalMargin >= 8
AND bestCoherentPathCtc >= -0.60
AND fractionCoherentCtcAboveMinus060 >= 0.25
```

No value changed after any validation result was observed.

## Unused private-media inventory

The inventory was privacy-preserving; private paths, filenames, UUIDs,
transcripts, hashes, Quran text, and personal metadata are not retained.

| Discovered group | Inventory | Validation disposition |
| --- | --- | --- |
| Independently labeled recitation lab | 87 audio recordings: 33 correct, 15 repeat, 17 skip, 19 wrong, and 3 noisy; labeled scopes include 1:1–7, 66:1–7, and shorter Fatiha ranges | One 7-window 1:1–7 positive and one 16-window 66:1–7 positive selected. Other takes remain unused. |
| Distinct published-reader clips | Two curated clips: a 23.72-second/3-window 3:98–99 passage and a 55.55-second/9-window 50:16–18 passage | The first is too short for the rule; the second was selected and supplied all three new negative derivatives. |
| Separate family-reader full-surah recordings | Al-Baqarah, Ali Imran, and Al-Ma'idah recordings, approximately 31–61 minutes | Not selected: full sources exceed the normal 15-minute media bound, and no independently verified subrange cuts were available. |
| Downloaded Quran clips | 55:1–5, 93:1–5, 3:33–35, and 74:1–8 | 55:1–5 and 93:1–5 are too short; 3:33–35 and 74 material were already used in design. |
| Unlabeled raw/WhatsApp recordings | Multiple possible recitations with no defensible range or reader provenance | Excluded rather than fabricating ground truth. |
| Existing timing cache and calibration derivatives | Alafasy, Hani Rifai, Husary, Muddaththir, and prior negatives | Excluded because they were used during rule design. |

All source and derived media remains ignored and uncommitted.

## External-validation corpus

Every fixture has `corpusRole: external-validation`. Positive ground truth was
established independently of this rule: two recordings carry pre-existing
route/range labels and word-level correctness review; the distinct-reader
passage was a separately curated continuous source. There are three positives,
three negatives, and two positive reader groups. Each browser run used one
source, one canonical audio preparation, one top-level identify call, normal
FastConformer passage decision, Whisper only after FastConformer abstention,
and forced alignment only after final acceptance.

The negative classes are new for this validation batch:

- complete 50:16–18 passage repeated twice;
- 3:98–99 followed by the non-contiguous cross-surah jump to 50:16–18;
- later half of 50:16–18 followed by its earlier half.

## Feature and distance table

Distances are `observed - frozen threshold`. `Safety` is the conjunction of all
existing non-CTC production gates. Counts are coherent candidates at or above
`-0.60` divided by all coherent candidates.

| Fixture | Expected | Safety | Windows (d) | Margin (d) | Best CTC (d) | >=-.60 count/fraction (d) | Frozen result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| reader A, 1:1–7 | positive | pass | 7 (`+2`) | 10.8931 (`+2.8931`) | -0.257126 (`+0.342874`) | 4/7 = 0.571429 (`+0.321429`) | pass |
| reader A, 66:1–7 | positive | pass | 16 (`+11`) | 15.0651 (`+7.0651`) | -0.422893 (`+0.177107`) | 1/13 = 0.076923 (`-0.173077`) | **fail** |
| reader B, 50:16–18 | positive | pass | 9 (`+4`) | 22.3071 (`+14.3071`) | -0.178168 (`+0.421832`) | 7/9 = 0.777778 (`+0.527778`) | pass |
| repeated complete passage | negative | pass | 18 (`+13`) | 29.9753 (`+21.9753`) | -0.066125 (`+0.533875`) | 14/18 = 0.777778 (`+0.527778`) | **pass / false positive** |
| cross-surah jump | negative | fail | 13 (`+8`) | 12.9855 (`+4.9855`) | -0.127074 (`+0.472926`) | 8/9 = 0.888889 (`+0.638889`) | reject: coherent-window support |
| backward passage halves | negative | fail | 9 (`+4`) | 8.2327 (`+0.2327`) | -0.093185 (`+0.506815`) | 3/6 = 0.500000 (`+0.250000`) | reject: coherent-window support |

Supporting retained fields:

| Fixture | Coverage | Coherent ratio | Agreement | Longest unsupported | Uniqueness | Anchor / advances |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| reader A, 1:1–7 | 1.0000 | 1.0000 | 1.000000 | 0 | 0.273628 | index 3 / 3 |
| reader A, 66:1–7 | 0.8301 | 0.8125 | 0.812500 | 2 | 0.308798 | index 7 / 8 |
| reader B, 50:16–18 | 1.0000 | 1.0000 | 1.000000 | 0 | 0.349247 | index 0 / 8 |
| repeated complete passage | 1.0000 | 1.0000 | 1.000000 | 0 | 0.363653 | index 0 / 15 |
| cross-surah jump | 0.6967 | 0.6923 | 0.692308 | 4 | 0.347899 | index 2 / 8 |
| backward passage halves | 0.7024 | 0.6667 | 0.666667 | 3 | 0.238141 | index 0 / 7 |

## Production, Whisper, and alignment observations

| Fixture | FastConformer proposal/outcome | Final authority/range | Forced alignment |
| --- | --- | --- | --- |
| reader A, 1:1–7 | 1:1–7; abstained on current coherent-path CTC | Whisper correctly rescued 1:1–7 | complete, 1:1–7 |
| reader A, 66:1–7 | 66:1–7; abstained on current coherent-path CTC | Whisper correctly rescued 66:1–7 | complete, 66:1–7 |
| reader B, 50:16–18 | 50:16–18; accepted | FastConformer, 50:16–18; no Whisper | complete, 50:16–18 |
| repeated complete passage | 50:16–19; accepted | FastConformer, 50:16–19; no Whisper | complete, 50:16–19 |
| cross-surah jump | 50:16–18; abstained on coherent-window support | Whisper incorrectly accepted 50:16–18 | complete, 50:16–18 |
| backward passage halves | 50:17–19; abstained on current CTC and coherent-window support | Whisper abstained (50:16–16 proposal only) | not run |

The repeated case is the requested edge observation: FastConformer added ayah
19 beyond the known 50:16–18 source, normal forced alignment completed the
unchanged 50:16–19 target, and no boundary correction occurred.

The known repeated-6:77 Whisper false positive and Husary 75:1–15 truncation
remain design-corpus findings and are not counted as new validation results.

## Boundary and length analysis

The smallest new-positive signed distance is the failed 66:1–7 fraction margin,
`-0.173077`. Among passing positives, the borderline-long 7-window case is the
closest by window count (`+2`) and margin (`+2.8931`). The closest rejecting
negative is the backward case: every new numeric condition passes, margin is
only `+0.2327`, and the retained coherent-window-support safety gate alone
rejects it. The repeated negative is already across every boundary and is
therefore a false positive rather than merely close to acceptance.

External validation did not widen confidence around `0.25`; it invalidated the
boundary. A known positive is at `0.076923`, while a repeated negative is at
`0.777778`. Length also exposes a failure mode: 7- and 9-window positives pass,
the 16-window positive fails, and extending a 9-window positive by repetition
to 18 windows turns it into an accepted negative. More windows can amplify
repeated evidence rather than demonstrate forward progression.

## Design-corpus regression and freeze proof

The frozen evaluator separately reports the original design corpus and the
external-validation corpus. Original behavior is unchanged:

- 5/5 known long positives pass;
- 5/5 original real negatives reject;
- 13/13 logical negatives reject.

There are no diffs from `main` under `src/lib/recognition`, `src/lib/media`,
`src/app/create`, or `public`. Recognition, thresholds, Whisper, VAD,
candidate retrieval, continuation anchoring, forced alignment, and media
handling were not modified. Normal CI and evaluation require no private media.

## Final conclusion

There is one new false negative (`66:1–7`) and one new frozen-rule false
positive (the repeated complete passage). Current production additionally lets
the cross-surah jump reach a Whisper false acceptance. These are recorded
without threshold changes or new conditions.

**EXTERNAL VALIDATION FAILED. Production implementation is not justified.**

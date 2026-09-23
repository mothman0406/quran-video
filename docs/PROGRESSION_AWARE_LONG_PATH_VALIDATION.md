# Progression-aware long-path validation (frozen, external)

**Conclusion: EXTERNAL VALIDATION FAILED.** One defensible new long positive
(reader H, 91:1–15) is a false negative; it is rejected by the *existing*
non-CTC safety gates, not by progression. No new adversary passed. The
candidate is not justified for production implementation and was not retuned.

No production recognition, Whisper, VAD, retrieval, continuation, alignment,
media, or public-asset behavior changed. Commands:

```sh
npm run calibration:progression:validation:capture -- <ignored-debug-log> <designated-id>
npm run calibration:progression:validation:evaluate
```

## 1. Frozen candidate

`FROZEN_PROGRESSION_VALIDATION_CANDIDATE` is the same frozen object as
`FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS`:

```text
existing non-CTC safety gates pass
AND totalGeneratedWindows >= 5
AND bestCoherentPathCtc >= -0.60
AND globalMargin >= 8
AND resetCount == 0
AND longestNoProgressRun <= 2
```

Novelty, revisit, efficiency, local-behind-frontier, reader, refrain and edge
facts are reported as observations only.

## 2. Freeze sequencing

1. Baseline (489 tests, lint, typecheck, build, all evaluators) passed.
2. `tests/progression-long-path-validation.test.ts` was written and passed at
   **2026-09-22 19:25:29 PDT**, before any new media was fetched. It proves the
   exact values, `Object.isFrozen`, a write throws, exact boundaries
   (windows 4, CTC `-0.600001`, margin `7.999999`, reset 1, run 3 reject;
   5 / `-0.60` / 8 / 0 / 2 accept), that observations cannot change a decision,
   and that validation tooling calls no calibration function and passes no
   thresholds other than the frozen constant.
3. Eleven cases were then designated (`PROGRESSION_VALIDATION_DESIGNATIONS`:
   role, reader group, source range, construction), **before** any validation
   recording was recognized. Audio was fetched only after that.
4. Each recording was captured once through the unchanged production app; no
   case was re-designated, dropped or re-captured after its result was seen.

Validation fixtures live in `tools/regression/fixtures/progression-validation/`
with provenance `progression-external-validation`; the design evaluator never
reads that directory, so they cannot affect any calibration.

## 3. Independent corpus inventory

| Source | Disposition |
| --- | --- |
| Public per-ayah recitations (EveryAyah), five readers not used anywhere in prior milestones (groups D–H) | **Selected.** Ground truth is each file's verse key; consecutive ayahs concatenated with FFmpeg into ignored `tmp/` media. Not model-derived. |
| Reader-A recitation lab (labeled takes) | Not used: access to its personal label data was declined by the environment's permission policy, and it is the already-represented reader A. |
| Family-reader full-surah Al-Baqarah / Ali Imran / Al-Ma'idah | Skipped: no independent timing or metadata exists to ground a subrange end without trusting recognition output. |
| Minshawi clips, 55:1–5 / 93:1–5 / 3:33–35 / 74 clips, WhatsApp/raw recordings | Already used, too short, or no defensible ground truth. |
| Alafasy / Hani / Husary caches and all prior derivatives | Used in design, validation or holdouts; excluded. |

Limitation: per-ayah concatenation joins studio ayah files, not one continuous
take; the same construction was used for the Alafasy/Hani/Husary positives.

## 4. Positive validation (all EXTERNAL-VALIDATION)

| Case | Refrain | Win/coh | Existing non-CTC safety | Best CTC (dist) | Margin (dist) | Resets | Run | Frozen | FastConformer | Whisper | Alignment |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| reader D 55:1–25 | yes | 19/19 | pass | -0.1295 (+.4705) | 53.24 (+45.24) | 0 | 0 | **accept** | accepted 55:1–25 | not entered | 55:1–25 |
| reader E 77:1–28 | yes | 16/16 | pass (fails CTC only) | -0.1977 (+.4023) | 40.50 (+32.50) | 0 | 0 | **accept** | abstained, 77:1–28 | **wrong: 77:1–15** | 77:1–15 |
| reader F 78:1–16 | no | 13/13 | pass | -0.0708 (+.5292) | 38.24 (+30.24) | 0 | 0 | **accept** | accepted 78:1–16 | not entered | 78:1–16 |
| reader G 54:15–22 | yes | 11/11 | pass (fails CTC only) | -0.1737 (+.4263) | 25.16 (+17.16) | 0 | 0 | **accept** | abstained, 54:15–22 | correct 54:15–22 | 54:15–22 |
| reader H 91:1–15 | no | 7/4 | **fail: coherent-window support** | -0.9914 (**-.3914**) | 5.90 (**-2.10**) | 0 | 0 | **reject: existing safety** | abstained, 91:8–15 | **wrong: 91:2–15** | 91:2–15 |

Five reader groups; all five readers are new to progression design. E and G
are FastConformer abstentions that the candidate would recover with the exact
range (Whisper truncated E). Reader H is the **false negative**: three leading
windows produce no coherent candidate (anchor never activates), CTC and margin
also miss. Progression itself is clean (reset 0, run 0).

## 5. Hard-negative validation (all EXTERNAL-VALIDATION)

| Case | Construction | Win/coh | Existing non-CTC safety | Best CTC | Margin | Resets | Run | Frozen (failed conditions) | FastConformer | Whisper | Alignment |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| reader F 78 ×2 | 1–16, 1–16 | 26/26 | pass | -0.0001 | 64.14 | 1 | 13 | reject: noReset, run | **accepted 78:1–17** | not entered | 78:1–17 |
| reader E 77 partial reset | 1–14, 15–28, 1–14 | 23/23 | pass | -0.1977 | 43.23 | 1 | 7 | reject: noReset, run | abstained 77:1–28 | **accepted 77:1–15** | 77:1–15 |
| reader D 55 refrain out of order | 17–25, 5–16 | 17/17 | pass | -0.0036 | 29.32 | 1 | **0** | reject: **noReset only** | **accepted 55:4–25** | not entered | 55:4–25 |
| reader E 77 repeat after progress | 1–28, 15–28 | 27/27 | pass | -0.1977 | 56.00 | 1 | 11 | reject: noReset, run | abstained 77:1–28 | **accepted 77:1–15** | 77:1–15 |
| reader G 54 ×3 | 15–22 ×3 | 35/32 | pass | -0.1037 | 51.48 | 2 | 21 | reject: noReset, run | abstained 54:15–22 | abstained | not run |
| reader F 78 alternating | 1–8, 9–16, 1–8, 9–16 | 26/26 | pass | -0.0001 | 64.14 | 1 | 13 | reject: noReset, run | accepted 78:1–17 | not entered | 78:1–17 |

**Designation error:** the alternating case concatenates the same ayah
sequence as 78 ×2 and produced identical evidence, so it is **not independent**
and is not counted. That leaves five independent hard negatives across four
readers. All pass existing non-CTC safety, so the frozen progression stage was
the only protection. Production FastConformer **accepts three of them today**
(78:1–17 twice, 55:4–25), and Whisper accepts both reader-E adversaries.
No false positive.

## 6. Trajectory, overlap and coverage

| Case | Overlap med/max | Novelty | Revisit | Efficiency | Local behind | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| D 55:1–25 | .50/.63 | .562 | 0 | 1 | 0 | 9 → 95, steady |
| E 77:1–28 | .50/.56 | .537 | 0 | 1 | 0 | 9 → 87, steady |
| F 78:1–16 | .50/.67 | .527 | 0 | 1 | 0 | 8 → 49, steady |
| G 54:15–22 | .47/.67 | .583 | 0 | 1 | **1** | 9 → 49, steady |
| H 91:1–15 | .50/.58 | .635 | 0 | 1 | 0 | 0,0,0 → 33 |
| F 78 ×2 | .50/.63 | .273 | .52 | .318 | 1 | plateau 51 (13 windows) |
| E partial reset | .50/.88 | .370 | .32 | .152 | 1 | plateau 87 (7) |
| D out of order | .48/.63 | .582 | 0 | -.062 | 1 | 10 → 89, no plateau |
| E repeat after progress | .50/.67 | .343 | .42 | .472 | 1 | plateau 87 (11) |
| G 54 ×3 | .44/.86 | .198 | .68 | .218 | 4 | plateau 49 (21) |

**Normal overlap:** every positive has ≈50% adjacent overlap, zero resets and
longest no-progress run **0**. Every coherent window, including the tail,
added new canonical words. No overlap false alarm.

## 7. Internal-refrain analysis

- **D 55:1–25** (refrain at 13, 16, 18, 21, 23, 25): no local winner returns
  to an earlier refrain occurrence; the coherent path stays forward; resets 0,
  run 0, local-behind 0. No false alarm.
- **E 77:1–28** (refrain at 15, 19, 24, 28): the same, with no cross-surah
  local winner either (the 77:15 phrase also occurs in 83:10).
- **G 54:15–22** (54:22 repeats 54:17 verbatim): in the final window the
  **local winner returns to 54:17** (behind-frontier 1, forced-forward 1), while
  the coherent path correctly stays at 54:21–22. resetCount did not fire, and
  the no-progress run did not grow. The frozen candidate accepts it.
- **D refrain out of order** (adversary): the backward jump is a genuine
  reset (1) with *no* plateau (run 0), so only `resetCount == 0` rejects it.

## 8. Local-winner-behind-frontier observation (not a rule condition)

The prior "zero in genuine recordings" pattern **does not hold**: genuine
refrain positive G has 1. A `localBehind <= 0` condition would have produced a
second false negative. Every hard negative has 1–4. The feature stays
observational.

## 9. Recording length

| Windows | Positives | Negatives |
| --- | --- | --- |
| 5–7 | H (reject: existing safety) | – |
| 8–10 | – | – |
| 11–20 | D, E, F, G accept (run 0) | D out of order (reset) |
| 21+ | – | all five independent adversaries (runs 7–21, resets 1–2) |

Valid recordings of 11–19 windows show no natural no-progress growth.
Repetition gets harder to pass as it gets longer (54 ×3: reset 2, run 21).
Duration was not exploitable in this corpus.

## 10. Identity vs edge (FastConformer proposal)

| Case | Identity | Edge |
| --- | --- | --- |
| D, E, F, G | correct | exact |
| H 91:1–15 | overlapping (91:8–15) | **wrong start** |

Accepted adversaries are *identity*-plausible, but they are not recordings of
a single canonical range. 78 ×2 aligns to an extra 78:17, and the out-of-order
case aligns to 55:4–25. Known edge errors (Husary 75:1–16, 66:1–6, repeated
50:16–19) are unchanged and unaddressed.

## 11. Whisper fallback (unchanged)

| Case | Whisper result |
| --- | --- |
| E 77:1–28 positive | **truncates** to 77:1–15 |
| G 54:15–22 positive | correct rescue |
| H 91:1–15 positive | **truncates** to 91:2–15 |
| E partial reset / repeat after progress | **wrong accept** 77:1–15 |
| G 54 ×3 | abstains |

Whisper rescue is not counted as frozen-rule evidence.

## 12. Original corpus regression

Committed trajectory fixtures produce the same frozen-candidate results as the
progression milestone. Accepted: the 6 design/external positives, reader-A
1:1–7 take b, and Husary (edge-wrong). All 14 real negatives are rejected.
Repeated 50 is rejected at progression, mixed non-contiguous is rejected at
margin, and all 13 logical negatives reject. The CTC, multi-signal and old
validation evaluators are byte-identical to the baseline.

## 13. Failures and decision

- **False negative:** reader H 91:1–15. It fails existing coherent-window
  support, best CTC is `-0.3914` below the floor, and margin is `-2.10` below.
  The identity is partially correct (91:8–15) with a wrong edge. Whisper
  truncated it, and alignment followed Whisper to 91:2–15. It was not patched.
- **False positives:** none.

Every other PASSED criterion held: ≥3 positives, ≥2 reader groups, abstention
positives present, ≥3 hard negatives with ≥2 passing existing safety, no
refrain reset false alarm, original corpus unchanged. **EXTERNAL VALIDATION
FAILED.** Production implementation is **not** justified. Progression itself
behaved as designed on every case. The failure sits in the retained existing
gates for a short (7-window) recording, which the candidate inherits
unchanged.

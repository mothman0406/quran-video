# Progression-aware long-path calibration (offline)

Offline sequence/progression analysis only. No production recognition, Whisper,
VAD, retrieval, continuation, alignment, media, or public-asset behavior
changed. Commands:

```sh
npm run calibration:progression:capture -- <ignored-debug-log> --id <id> --expected <positive|negative> \
  --intent '<meaning>' --provenance <design|external-validation|progression-design-support|progression-held-out> \
  --reader-group <label> [--negative-type <type>] [--surah N --start-ayah N --end-ayah N] --output <fixture.json>
npm run calibration:progression:evaluate
```

## 1. Why the previous frozen rule failed

The multi-signal candidate (`safety AND windows>=5 AND margin>=8 AND best
CTC>=-0.60 AND fraction(CTC>=-0.60)>=0.25`) failed external validation
(`docs/MULTISIGNAL_LONG_PATH_VALIDATION.md`). It remains a **FAILED externally
validated candidate** and was not retuned. Correct 66:1–7 fell at `1/13 =
.076923`; the repeated complete 50:16–18 passed every condition (fraction
`.777778`, margin `29.9753`) and FastConformer accepted 50:16–19. Local CTC
quality plus margin cannot distinguish genuine progression from repetition.

## 2. Hypothesis

Genuine continuous recitation shows sustained forward coverage of the canonical
passage; repetition revisits covered spans, resets, or stops adding canonical
content. This milestone tests whether that is visible in the *existing* winning
coherent path.

## 3. Trajectory schema

The production debug event `ctc-gate-input` already emits, per generated
window, the winning coherent-path candidate and the independent per-window
winner with surah/ayah/global-word coordinates; `fastconformer-window-result`
emits the continuation event. No production change was needed: offline parsing
only (`tools/regression/progression-trajectory.ts`).

Fixtures (`tools/regression/fixtures/progression-trajectory/`) are the existing
schema-v1 capture fields plus `provenance`, `readerGroup`, `negativeType`, and
`trajectory.windows[]`:

| Field | Meaning |
| --- | --- |
| `index` | generated window index (12 s / 6 s hop) |
| `coherent` | `null`, or `{surah, startAyah, endAyah, start, end, ctc, origins}` selected by the winning coherent path |
| `localWinner` | independent window winner `{surah, startAyah, endAyah, sameSurah, start, end, ctc}`; `start/end` only when in the path's surah |
| `anchorEvent` | continuation event |

`start/end` are inclusive canonical word positions **relative to the minimum
coherent-candidate start** (`coordinateOrigin: minimum-coherent-start`).
Absolute global/canonical word indices, text, transcripts, media, PCM, hashes,
filenames and paths are never retained (enforced by
`tests/progression-trajectory.test.ts`). Re-parsing each of the 17 retained
ignored logs reproduced its committed schema-v1 capture exactly.

Trajectory is **missing** for design positives 2:258–259 and 6:74–77: their
source recordings were never in the workspace and only coherent-CTC arrays were
retained. They are marked missing, never invented.

## 4. Feature definitions (`computeProgressionFeatures`)

Over coherent windows in chronological order (null windows carry coverage
forward and are transparent). Tolerance `T = 2` words — identical to the
production solver's own backward boundary (`movement < -2`).

- **deltaStart / deltaEnd**: current minus previous coherent start/end.
- **candidate overlap**: `|prev ∩ cur| / |cur|`.
- **forward-consistent**: `deltaStart >= -T and deltaEnd >= -T`;
  **monotonicity ratio** = forward-consistent / transitions.
- **backward transition**: `deltaStart < -T`; **backward ratio**.
- **reset**: backward *and* `cur.end < prev.start` (lands wholly behind the
  previous candidate — impossible under ordinary 50% window overlap).
  **resetAfterProgress**: resets after at least one coverage-adding transition.
- **new words**: canonical positions in the span not covered by earlier
  coherent candidates. **Cumulative coverage**: distinct positions after each
  generated window.
- **novelty ratio**: distinct covered positions / Σ coherent span lengths.
- **progression efficiency**: net midpoint displacement / Σ |midpoint
  movement| (midpoints absorb span widening; `1` = never moves back).
- **revisit window**: new words `< 0.25 ×` span; **revisit ratio** over
  coherent windows after the first.
- **no-progress window**: zero new words; **longest no-progress run** over
  consecutive coherent windows.
- **local/global**: agreement (local winner within `T` of the coherent
  candidate), **behind-frontier** (same-surah local winner ending more than `T`
  before the previous coherent start), **forced-forward** (behind-frontier while
  the coherent path stays forward).

## 5. Normal overlapping-window behavior (genuine long positives)

| Fixture | Prov. | Win/coh | Overlap med/max | New words med/min | No-prog / longest | Mono | Resets | Revisit | Novelty | Eff. | Coverage growth |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 2:258–259 | design | 19 | missing | | | | | | | | missing |
| 6:74–77 | design | 11 | missing | | | | | | | | missing |
| Alafasy 93:1–11 | design | 9/9 | .50 / 1.00 | 4 / 0 | 1 / 1 | 1 | 0 | .125 | .563 | 1 | 11,16,22,24,27,32,36,40,40 |
| Alafasy 94:1–8 | design | 5/5 | .47 / .57 | 4.5 / 3 | 0 / 0 | 1 | 0 | 0 | .619 | 1 | 8,12,18,23,26 |
| Hani 3:33–35 | design | 6/6 | .50 / .70 | 6 / 3 | 0 / 0 | 1 | 0 | 0 | .581 | 1 | 11,17,23,29,32,36 |
| Reader A 1:1–7 | external | 7/7 | .56 / 1.00 | 3.5 / 0 | 1 / 1 | 1 | 0 | .167 | .553 | 1 | 4,10,14,17,23,26,26 |
| Reader A 66:1–7 | external | 16/13 | .44 / .63 | 8 / 3 | 0 / 0 | 1 | 0 | 0 | .636 | 1 | 15,25,31,31,49,…,104,112,112,112 |
| Reader B 50:16–18 | external | 9/9 | .50 / 1.00 | 3 / 0 | 1 / 1 | 1 | 0 | .125 | .527 | 1 | 6,9,13,16,19,22,26,29,29 |

Expected adjacent candidate overlap is ≈50% (median `.44–.56`), matching the
6 s hop. Every non-final coherent window adds new canonical words (min 3 where
not the tail); the only zero-novelty window in any genuine trajectory is the
**final tail window** re-covering the recitation end (93, 1:1–7, 50). No genuine
trajectory has a backward transition, reset, or efficiency below 1. Novelty
stays in `.527–.636` despite the overlap, so 50% overlap is *not* repetition.

## 6. Correct 66:1–7 (external) trajectory

16 windows, 13 coherent (nulls at 3, 14, 15). Coherent spans (relative words):
`[0,14] [7,24] [21,30] — [36,53] [46,60] [54,68] [64,76] [71,84] [79,88] [84,91]
[89,99] [95,108] [102,116] — —`. Every transition moves forward (monotonicity
`1`, backward `0`, resets `0`, efficiency `1`), each coherent window adds
3–18 new words (median 8), no-progress run `0`, revisit `0`, novelty `.636`.
Coverage grows steadily `15 → 112`. The anchor only activates at window 7
(first seven windows `none`), then advances every window; post-anchor progress
is uninterrupted. Local CTC is weak (1/13 at `>= -0.60`) but the canonical
trajectory is textbook forward progression. Window 2's local winner is in
another surah (68:1) — local/global agreement `.5`, behind-frontier `0`.

## 7. Repeated complete 50:16–18 (external adversary) trajectory

18 windows, all coherent: `[1,6] [4,9] [8,13] [11,16] [14,19] [16,22] [19,26]
[23,29] [27,30] | [0,4] [2,6] [5,13] [11,15] [14,18] [16,21] [19,25] [22,29]
[26,29]`.

1. **Yes, it visibly resets.** Window 8 → 9 moves from `[27,30]` to `[0,4]`
   (`deltaStart -27`), wholly behind the previous candidate.
2. The solver does **not** disguise the repeat as forward content; it follows
   the local evidence back to 50:16.
3. Not applicable — the path is not artificially forward.
4. Windows 9–17 (9 of 18 windows) revisit already-covered spans; 8 add zero new words.
5. Distinct coverage reaches 31 words by window 8 and never grows again.
6. Coverage **plateaus**: `6,9,13,16,19,22,26,29,30,31,31,…,31`. It creeps
   into ayah 19 by exactly one word.
7. Resets `1` (after progress), backward ratio `.059`, monotonicity `.941`,
   revisit `.529`, novelty `.282`, efficiency `.312`, longest no-progress run
   `8`, candidate overlap median `.5` / max `1`.
8. Why current gates pass it: coverage/coherent ratio/agreement are all `1`
   because every window *is* Quran from the same passage; margin is `29.98`
   because no other surah explains it; structural validity only checks the
   aggregate span (min start … max end), never path order; the solver's
   backward-jump penalty (≈`-13`) is a one-time cost smaller than keeping nine
   strong windows instead of nine null states (`-2.25` each).
9. **Yes.** Window 8 (audio 48–60 s: end of 50:18 + start of the repeat) is
   selected as 50:18–19 `[27,30]` while its independent winner is 50:18–18
   `[27,29]`; the transition score's `entersNextAyah` geometry bonus favors the
   forward extension. The repeated opening acoustically fills the "next" slot.
   The aggregate span therefore ends at 50:19.
10. Local winners agree with the coherent path in 17/18 windows (`.944`);
    behind-frontier `1` (at the reset). The local evidence points back to
    50:16 and the coherent path *follows* it.

## 8. Strongest differences, genuine 66:1–7 vs repeated 50

| Feature | 66:1–7 genuine | repeated 50 |
| --- | ---: | ---: |
| Local CTC fraction `>= -0.60` | `.077` | `.778` |
| Margin | `15.07` | `29.98` |
| Resets / backward | `0 / 0` | `1 / 1` |
| Longest no-progress run | `0` | `8` |
| Novelty | `.636` | `.282` |
| Efficiency | `1` | `.312` |
| Revisit ratio | `0` | `.529` |
| Coverage growth | steady to 112 | plateau at 31 |

Every acoustic/identity signal favors the adversary; every progression signal
favors the genuine recording.

## 9. Real-negative progression table

| Fixture | Prov. | Win/coh | Safety | Margin | Resets | Backward | Longest no-prog | Revisit | Novelty | Eff. | Local behind | Coverage |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| isolated Muddaththir excerpt | design | 1/1 | pass | 2.27 | 0 | 0 | 0 | – | 1 | – | 0 | 4 |
| repeated 93:1 | design | 7/7 | pass | 6.59 | 0 | 0 | 5 | .833 | .214 | .333 | 0 | 2,…,2,3 |
| repeated 6:77 | design | 9/3 | fail | – | 0 | 0 | 0 | 0 | .647 | 1 | 2 | 14,18,22,22,… |
| mixed non-contiguous | design | 9/7 | pass | 6.56 | 0 | 0 | 0 | .167 | .603 | 1 | 0 | 7,11,14,14,14,23,29,37,38 |
| backward 6:77→74 | design | 10/3 | fail | 6.13 | 0 | 0 | 0 | .5 | .594 | 1 | 7 | 14,18,19,… |
| repeated complete 50:16–18 | external | 18/18 | pass | 29.98 | 1 | 1 | 8 | .529 | .282 | .312 | 1 | plateau 31 |
| cross-surah jump | external | 13/9 | fail | 12.99 | 0 | 0 | 1 | .125 | .556 | 1 | 0 | 0,0,0,0,7,…,30 |
| backward halves | external | 9/6 | fail | 8.23 | 0 | 0 | 1 | .2 | .548 | 1 | 3 | 7,11,15,15,16,17,… |
| Alafasy 94:1–8 ×2 | design-support | 11/7 | fail | 15.00 | 0 | 0 | 2 | .333 | .491 | .872 | 3 | 8,…,27 plateau |

Distributions (design-visible, long positives vs repetition negatives):
resets `0/0/0` vs `0–1`; backward `0` vs `0–1`; novelty `.527–.636` vs
`.214–.647`; revisit `0–.167` vs `0–.833`; efficiency `1` vs `.312–1`;
longest no-progress `0–1` vs `0–8`; local behind-frontier `0` vs `0–3`.

## 10. New repetition adversaries (ignored media, roles fixed before capture)

Built with FFmpeg from ignored per-ayah cache audio and one unused published
clip; no media committed. Roles were recorded before any capture.

| Adversary | Role | Construction |
| --- | --- | --- |
| Alafasy 94:1–8 ×2 | **DESIGN-SUPPORT** | longer passage repeated twice |
| reader C 55:1–5 ×4 | **HELD-OUT VALIDATION** | different reader + surah, short passage ×4 |
| Alafasy 93:1–11 ×2 | **HELD-OUT VALIDATION** | longer passage repeated twice |
| Alafasy 94 partial reset (1–4, 5–8, 1–4) | **HELD-OUT VALIDATION** | partial reset |
| Alafasy 93 alternating (1–3, 4–6, 1–3, 4–6) | **HELD-OUT VALIDATION** | alternating halves |
| Hani 3:33–35 ×2 | **HELD-OUT VALIDATION** | different reader repeated twice |

## 11. New held-out positives

No unused *different-reader* long continuous recording with independent ground
truth exists (full-surah family recordings lack verified subrange cuts; other
clips are too short or were used). Three unused reader-A takes with pre-existing
human `correct` labels were designated **HELD-OUT VALIDATION** before capture:
66:1–7 take b, 66:1–7 take c (≈99 s, 16 windows), and 1:1–7 take b (34 s,
5 windows).

## 12–13. Rule families and threshold ranges

Base = existing non-CTC safety gates + ≥5 windows + retained production
best-coherent-CTC `>= -0.60`. Design-visible results:

| Family | Thresholds tested | Result |
| --- | --- | --- |
| A reset ≤ N | 0, 1 | N=0 rejects repeated 50; mixed passes (needs margin) |
| B novelty ≥ X | .25, .3, .4, .45, .5 | ≥.3 rejects repeated 50; mixed passes; .25 admits repeated 50 |
| C efficiency ≥ X | .5, .75, .9, 1 | all reject repeated 50; mixed passes |
| D revisit ≤ X, run ≤ N | .25/.5 × 1/2/3 | all reject repeated 50; mixed passes |
| E margin ≥ M + reset=0 + run≤2 | 5, 7, 8, 9, 10 | 7–9 clean; 5 admits mixed; 10 loses Hani 3:33–35 |
| F reset=0 + run≤2 + local behind ≤ K | 0, 1, 2 | clean with margin; not frozen (see §22) |
| G staged margin≥8 + reset=0 + run≤N | 1, 2, 3 | clean for all N on design data |
| margin ≥ 8 alone | – | admits repeated 50 |

No progression signal alone rejects mixed non-contiguous Quran (it skips
forward over null windows); the identity margin is required.

## 14. Held-out methodology and frozen candidate

`calibrateProgressionThresholds` is deterministic: reset limit = max
training-positive resets; no-progress limit = max training-positive run + 1
(one window of tolerance for an interior pause); margin = ⌈strongest training
real negative admitted by safety + progression⌉ + 1, failing if above any
training positive margin. Progression limits use **positives only**, so a
repetition negative can never tune them.

The candidate was frozen (`FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS`, immutable
test) at 2026-09-22 14:06 PDT with only the 18 design-visible fixtures present;
no held-out log had been converted or inspected.

```text
STAGE 1  existing non-CTC safety gates AND windows >= 5 AND best coherent CTC >= -0.60 (retained)
STAGE 2  global margin >= 8
STAGE 3  resetCount == 0 AND longestNoProgressRun <= 2
```

## 15. Held-out results

Leave-one-positive-out (every fold recalibrated to the frozen values):

| Held-out positive | Result | Distance margin / reset / run |
| --- | --- | --- |
| Alafasy 93:1–11 | accept | +12.81 / 0 / 1 |
| Alafasy 94:1–8 | accept | +4.59 / 0 / 2 |
| Hani 3:33–35 | accept | +1.17 / 0 / 2 |
| Reader A 1:1–7 | accept | +2.89 / 0 / 1 |
| Reader A 66:1–7 | accept | +7.07 / 0 / 2 |
| Reader B 50:16–18 | accept | +14.31 / 0 / 1 |
| 2:258–259 | non-progression stages pass (+30.51); progression not evaluable | – |
| 6:74–77 | non-progression stages pass (+9.26); progression not evaluable | – |

Leave-one-repetition-negative-out: repeated 50 (held out) **rejects at
progression** (reset −1, run −6); repeated 93:1, repeated 6:77, and Alafasy
94×2 reject at existing safety.

Frozen candidate on held-out evidence:

| Held-out case | Safety | Margin | Resets | Run | Novelty | Local behind | Frozen result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 93:1–11 ×2 | pass | 31.26 | 1 | 10 | .274 | 1 | **reject: progression** |
| 55:1–5 ×4 | pass | 15.16 | 0 | 7 | .167 | 0 | **reject: progression** |
| 94 partial reset | fail (support) | 12.43 | 0 | 0 | .628 | 3 | reject: existing safety |
| 93 alternating | fail (support) | 10.17 | 0 | 1 | .561 | 2 | reject: existing safety |
| Hani 3:33–35 ×2 | fail (support) | 8.23 | 0 | 1 | .561 | 3 | reject: existing safety |
| Reader A 1:1–7 take b | pass | 10.82 | 0 | 1 | .558 | 0 | **accept** (FastConformer already accepts it) |
| Reader A 66:1–7 take b | fail (support) | 12.45 | 0 | 0 | .679 | 0 | reject: existing safety; FastConformer proposed 66:1–6 |
| Reader A 66:1–7 take c | fail (support) | 10.49 | 0 | 0 | .669 | 0 | reject: existing safety; FastConformer proposed 66:1–6 |

Both gate-passing held-out repetitions — including 55:1–5 ×4, where the solver
never resets but stalls in place — are rejected by progression. **Three of five
held-out repetitions are invisible to progression**: the solver encodes the
repeated audio as null windows and resumes on covered or forward content;
only existing coherent-window support rejects them (Hani ×2 clears margin by
only `+0.233`). Both 66:1–7 takes have genuine progression but fail existing
support and carry a FastConformer edge error.

## 16. Recording-length sensitivity

| Windows | Accepted | Rejected |
| --- | --- | --- |
| 5–7 | 94:1–8, 3:33–35, 1:1–7 (both) | repeated 93:1 (safety) |
| 8–10 | 93:1–11, 50:16–18 | 55×4 (progression), mixed (margin), backward ×2, repeated 6:77, partial reset, alternating (safety) |
| 11–20 | 66:1–7 | repeated 50 & 93×2 (progression), 94×2, Hani×2, cross-surah (safety); 2:258/6:74 not evaluable; held-out 66 takes (safety) |
| 21+ | Husary (edge-wrong) | – |

Repeating the genuine 50:16–18 trajectory synthetically 2/3/4× in reset form
gives resets 1/2/3 and runs 10/19/28 — **harder**, not easier, to pass with
length; the prior length exploit is closed for coherent-coded repetition.
Null-coded repetition leaves progression unchanged at any length and relies on
existing support/unsupported-run gates.

## 17. Normal-overlap false-alarm analysis

Adjacent candidates overlap ≈50% (median `.43–.56`), yet each non-final
window adds new canonical words; the only zero-novelty window is the terminal
tail (never interior). Longest run ≤1, resets `0`, backward `0`, efficiency `1`
for all 10 evaluable long genuine recordings including held-out and Husary. The
reset definition (landing wholly behind the previous candidate) cannot be
triggered by 12 s/6 s overlap.

## 18. Mixed/backward resistance

Mixed non-contiguous: margin `6.56 < 8`. Backward 6:77→74 and backward halves:
existing coherent-window support (solver nulls the backward material; local
behind-frontier 7 and 3). Cross-surah jump: existing support. Logical
wrong-surah/backward/invalid-structure fixtures: existing safety; logical
isolated-strong-window: margin. All 13 logical negatives reject without any
trajectory.

## 19–20. Identity vs edge accuracy; Husary

Progression addresses identity confidence only. Repeated 50 is rejected, so
its 50:19 edge never reaches alignment. Husary 75:1–15 has a clean genuine
trajectory (19/23 coherent, resets 0, run 0, novelty `.677`, margin `29.86`)
and the candidate **would accept it**, exposing FastConformer's 75:1–16 to
forced alignment, which has no proven automatic edge trim. Held-out 66:1–7
takes show FastConformer 66:1–6 (short edge). Edge refinement is a separate,
unsolved milestone.

## 21. Whisper implications (unchanged; not fixed)

| Recording | FastConformer | Whisper | Correct? | Candidate would accept FC? |
| --- | --- | --- | --- | --- |
| 1:1–7, 66:1–7 (external), 93:1–11 | abstain | correct rescue | yes | yes (fallback avoided) |
| Hani 3:33–35 | abstain | abstained (2:127) | **no** | yes |
| Husary 75:1–15 | abstain (75:1–16) | 75:1–13 | **no** | yes, but 75:1–16 edge |
| repeated 6:77 | abstain | 6:77–78 | **no** | no |
| cross-surah jump | abstain | 50:16–18 | **no** | no |
| Alafasy 94×2 (design-support) | abstain | 94:1–8 | **no** | no |
| held-out 93:1–11 ×2 | abstain | 93:2–11 | **no** | no |
| held-out 94 partial reset | abstain | 94:1–8 | **no** | no |
| held-out Hani ×2 | abstain (3:33–36) | 3:33–35 | **no** | no |
| held-out 66:1–7 take b | abstain (66:1–6) | 66:1–3 | **no** | no |

Keeping good recordings out of fallback is safe only where FastConformer's
own range is right; every adversary still reaches Whisper, which incorrectly
accepted 8 recordings above (6 repetition/manipulation negatives, 2 edge-wrong
positives) and abstained on correct Hani 3:33–35. Separate Whisper calibration
remains necessary.

## 22. Limitations

- Progression cannot see repetition the solver encodes as nulls (3/5 held-out
  adversaries); protection there is the existing coherent-window support gate.
  The same-surah local behind-frontier count (0 for all 12 genuine
  trajectories, short ones included; 1–7 for 9 of 14 real negatives) is the best already-computed complement,
  but it was **not** frozen and is unvalidated; refrain-heavy surahs (e.g. 55,
  77) could legitimately point local winners backward.
- 2:258–259 and 6:74–77 trajectories are missing.
- All held-out positives are reader A; only one passes, and it is one
  production already accepts. No held-out evidence yet shows recovery of a
  current FastConformer abstention.
- Margin `8` equals the failed rule's value (re-derived independently); the
  closest positive is +1.17 (Hani 3:33–35) and the closest negative −1.44
  (mixed).
- Capture: one run lost its terminal forced-alignment console event; the
  identity evidence was complete and was re-captured with a scratch variant
  that flushes the log (production unchanged).

## 23. Candidate

**A progression-aware candidate is justified for another frozen
external-validation milestone** (not production):

```text
existing non-CTC safety gates pass
AND totalGeneratedWindows >= 5
AND bestCoherentPathCtc >= -0.60          (retained existing component)
AND globalMargin >= 8
AND resetCount == 0                       (reset: start < prev.start - 2 AND end < prev.start)
AND longestNoProgressRun <= 2             (consecutive coherent windows adding 0 new canonical words)
```

The coherent-path mean-CTC requirement and the failed CTC-fraction condition
are not part of it.

## 24. Next evidence needed

A frozen external validation with: at least two new *different-reader*
continuous long positives on which current FastConformer abstains; new
repetition adversaries in which coherent-window support passes; refrain-heavy
genuine surahs; and recaptured 2:258–259 / 6:74–77 if the sources reappear.

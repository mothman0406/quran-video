# Short genuine FastConformer gate failures (offline)

**Conclusion: NO CANDIDATE.** The analysis found two independent genuine
short-recording failure shapes, but no rule is justified for another frozen
external validation. Production recognition, thresholds, Whisper, VAD,
retrieval, continuation, alignment, media handling, and the frozen progression
candidate are unchanged.

Commands:

```sh
npm run calibration:short-gate:capture -- <ignored-debug-log> <designated-id>
npm run calibration:short-gate:evaluate
npm run calibration:short-gate:privacy
```

## 1. Held-out reader H failure

Ground truth is `91:1–15`. FastConformer proposed `91:8–15` and abstained;
Whisper accepted `91:2–15`; forced alignment followed `91:2–15`. H remains
held-out failure evidence: it is absent from `SHORT_GATE_DESIGNATIONS`, no
threshold is derived from it, and no reader- or surah-specific condition exists.

The first loss of `91:1–7` occurs in the **global coherent-path/Viterbi
selection**, not candidate retrieval or local ranking. Windows 0–2 independently
select correct-surah spans `91:1–5`, `91:4–8`, and `91:6–10`, collectively
covering the missing beginning, but the Viterbi path selects its explicit null
state for all three. The aggregate span therefore starts at the first non-null
candidate, `91:8–12` in window 3. No later aggregation step trims an earlier
selected start.

### H window reconstruction

All candidates below are Quran-wide `global` candidates. “Early” means overlap
with ayat 1–7. The retained log has only the independent winner, not every
alternate candidate; a one-pass ignored offline rerun confirmed that each
early window's top five reranked candidates stays in the correct local Surah-91
region.

| W | Voiced ms | Independent winner | Local CTC | Coherent candidate | Coherent CTC | Coverage / tokens | Anchor | Null | Early | Local/global |
| ---: | ---: | --- | ---: | --- | ---: | --- | --- | --- | --- | --- |
| 0 | 11,904 | 91:1–5 | -4.983366 | – | – | local .619048 / 39 | none | yes | yes | diverge |
| 1 | 12,000 | 91:4–8 | -4.039982 | – | – | local .508772 / 29 | none | yes | yes | diverge |
| 2 | 12,000 | 91:6–10 | -4.773106 | – | – | local .569231 / 37 | none | yes | yes | diverge |
| 3 | 12,000 | 91:8–12 | -1.937908 | 91:8–12 | -1.937908 | .641791 / 43 | none | no | no | agree |
| 4 | 12,000 | 91:10–13 | -1.004394 | 91:10–13 | -1.004394 | .622642 / 33 | none | no | no | agree |
| 5 | 12,000 | 91:13–14 | -2.259492 | 91:13–14 | -2.384734 | .517857 / 29 coherent | none | no | no | slight span divergence |
| 6 | 10,176 | 91:14–15 | -0.991440 | 91:14–15 | -0.991440 | .813953 / 35 | none | no | no | agree |

Every independent winner overlaps expected `91:1–15`; all seven are in the
correct surah. Exact whole-span `91:1–7` was not retained as a candidate, but
correct local candidates covering every part of ayat 1–7 clearly existed and
won their windows. Candidate generation and local ranking therefore succeeded.

## 2. Why the three H windows are null

The Viterbi null state scores `-2.25` per window. The winning candidates in
windows 0–2 have normalized CTC values `-4.98`, `-4.04`, and `-4.77`; their
bounded lexical terms are far too small to overcome that difference. Each
candidate loses to null locally before continuity can help. The null path also
retains the last acoustic hypothesis, so null does not authorize an unsafe
backward jump.

This is an acoustic/model-quality failure expressed through coherent-path
selection. It is not candidate absence, candidate retrieval, local-ranking,
VAD, silence, or target-capacity failure:

- VAD coverage is `.9927`; each full window is 99.2–100% voiced and the tail is
  97.7% voiced.
- Target coverage is `.5088–.8140`, with 29–43 target tokens; no candidate is a
  trivial short target.
- Correct-surah local evidence exists in 7/7 windows and is monotonically
  ordered.
- Only acoustic scores are uniformly poor, especially the first three.

## 3. Continuation and start acquisition

Continuation never activates. The anchor requires normalized CTC `>= -0.60`;
H's best independent window is still below that floor. Consequently every
window has 48 global candidates, zero local-continuation candidates, event
`none`, and no anchor span. Continuation did not activate late or incorrectly;
it had no qualifying acoustic seed. It therefore could neither preserve nor
recover the beginning.

The apparent “late lock” is the Viterbi path beginning at window 3, not a
continuation anchor. Identity recovery and exact edge repair remain separate:
the later evidence identifies Surah 91, but no retained mechanism restores
ayat 1–7 after those windows are nulled.

## 4. H CTC root cause

The coherent distribution is `[-1.937908, -1.004394, -2.384734, -0.991440]`;
the mean is `-1.579619`. The local-winner distribution is
`[-4.983366, -4.039982, -4.773106, -1.937908, -1.004394, -2.259492,
-0.991440]`.

`-0.991440` is exactly the maximum finite CTC among coherent-path candidates,
not a discarded better local score. Window 5 is the only selected local/global
span divergence, and neither value is close to `-0.60`. Thus the best-CTC
failure is not caused by throwing away a good local candidate. It reflects
weak Tilawa acoustic fit throughout this reader's recording. Full VAD coverage
rules out silence dilution. Comparable genuine recordings show that short
targets alone do not force this result: 5–9-window positives have best CTC from
`-0.168` to `-0.333`, while historical Hani 69:19–22 is an even weaker short
positive at `-1.319`.

## 5. H margin root cause

The deterministic all-null score for seven windows is `7 × -2.25 = -15.75`.
The retained margin `5.8973` reconstructs the H winner score as `-9.8527`.
Therefore the runner-up score is `-15.75`, and its range is **none**: the
strongest competitor explains no passage. An ignored pinned-model rerun
reproduced the shape (Surah-91 winner over tied all-null hypotheses); score
differences from browser decoding are not substituted for the retained values.

The margin is low because only four weak tail candidates improve on null. It
is not driven by another acoustically plausible passage or shared Quran
wording. Margin is an accumulated whole-path score, so fewer windows provide
less opportunity to separate from the null path. D–G have 11–19 coherent
windows and margins `25.16–53.24`; accepted 5–9-window positives still pass at
`9.17–22.31`, but have much less headroom.

## 6. Short-recording comparison

| Case | Type | Win/coh | Best / mean CTC | Margin | Cov. | Unsupported | FC | Identity / edge |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| new reader I 89:1–14 | design positive | 6/6 | -.323 / -1.826 | 9.01 | 1 | 0 | abstain: mean | correct / exact |
| new reader J 90:1–12 | design positive | 8/8 | -.206 / -.491 | 22.04 | 1 | 0 | accept | correct / exact |
| new reader K 92:1–14 | held-out positive | 8/8 | -.823 / -2.165 | 8.78 | 1 | 0 | abstain: CTC | correct / **end 15** |
| reader H 91:1–15 | held-out failure | 7/4 | -.991 / -1.580 | 5.90 | .563 | 3 | abstain: CTC/support | correct / **start 8** |
| reader I backward | design negative | 6/3 | -.345 / -.845 | 6.08 | .469 | 3 | abstain | plausible / wrong |
| reader J partial repeat | design negative | 9/5 | -.206 / -.520 | null | .578 | 4 | abstain | plausible / wrong |
| I→K cross-surah | held-out negative | 6/4 | -.366 / -1.483 | 3.01 | .671 | 2 | abstain | wrong / wrong |
| Alafasy 94:1–8 | historical positive | 5/5 | -.332 / -.595 | 12.59 | 1 | 0 | accept | correct / exact |
| Hani 3:33–35 | historical positive | 6/6 | -.207 / -1.262 | 9.17 | 1 | 0 | abstain: mean | correct / exact |
| reader A 1:1–7 | historical positive | 7/7 | -.257 / -.879 | 10.89 | 1 | 0 | abstain: mean | correct / exact |
| repeated 93:1 | historical negative | 7/7 | -1.648 / -1.750 | 6.59 | 1 | 0 | abstain: CTC | plausible / wrong |
| alternating 93 | historical negative | 8/5 | -.503 / -.775 | 10.17 | .600 | 3 | abstain | plausible / wrong |
| partial reset 94 | historical negative | 8/5 | -.248 / -.555 | 12.43 | .667 | 3 | abstain | plausible / exact-looking |

The new corpus was designated before recognition. Design support contains
reader-I and reader-J positives plus backward and repeated-partial negatives.
Held-out validation contains reader-K plus the I→K cross-surah mixture. Media
and raw logs remain ignored; only relative, privacy-safe recognition metadata
is committed.

## 7. Window-count sensitivity

| Windows | One bad | Two bad | Three bad | Ratio with three bad |
| ---: | ---: | ---: | ---: | ---: |
| 5 | .80 | .60 | .40 | fail |
| 7 | .86 | .71 | .57 | fail |
| 10 | .90 | .80 | .70 | pass ratio |
| 15 | .93 | .87 | .80 | pass ratio |

The production ratio floor `.60` systematically gives 5–7-window recordings
less tolerance. Independently, any contiguous run of three nulls fails at every
length because `longestUnsupportedRun >= 3`. H hits both conditions. There is
another discontinuity: five windows is classified as a long timeline and gains
the mean-CTC gate, while four windows does not. Global margin also accumulates
with path length. Short duration is therefore a real structural disadvantage,
although it is not sufficient by itself to cause failure.

## 8. Support and local-evidence distributions

New genuine positives have coherent ratios `1, 1, 1`; H has `.571`. New
negatives have `.50, .556, .667`. Absolute coherent count cannot rescue H:
H has 4, but the repeated-partial negative has 5 and historical repeated 93
has 7.

All new positives and H have a local winner in every window. Their independent
local paths have zero backward transitions, zero resets, and no no-progress
run. Both same-surah design adversaries also have a local winner in every
window, but their local paths reset once; the repeated case has a five-window
no-progress run. The held-out cross-surah mixture loses same-surah local
coverage. Ordered local evidence is the strongest observed discriminator, but
it is not enough to remove acoustic safety on this small corpus.

## 9. Rule families

- **A — short-sample support: REJECT.** Absolute-count or one/two-null
  allowances do not admit H (three nulls) safely; count `>=4` admits negative
  shapes.
- **B — local-evidence recovery: PROMISING, INSUFFICIENT.** All-window,
  same-surah, forward local evidence with no reset/no-progress pathology
  separates retained cases at margin 8. It would bypass both acoustic floors,
  however, and has only one new held-out acoustic failure. No candidate is
  frozen.
- **C — late lock/start edge: REJECT.** H has no anchor event. Later Surah-91
  evidence cannot establish the omitted beginning, and identity confidence
  cannot repair the edge.
- **D — support-conditioned margin: REJECT.** Margin 8 still rejects H.
  Choosing 5 because H is 5.8973 would directly tune against H. The same coarse
  range contains plausible negatives.
- **E — acoustic confidence without best CTC: REJECT.** Reader K's best is
  `-.823` and H's is `-.991`; no retained absolute acoustic floor admits both.
  Relative/local evidence is not yet independently validated enough to replace
  the floor.

## 10. Candidate decision and errors

**NO CANDIDATE.** Consequently there are no candidate design or held-out false
positives/negatives to report. Current production outcomes are one design false
negative (reader I), one held-out false negative (reader K, also edge-wrong),
and H remains a held-out false negative. All three new negatives reject.

The tempting local-recovery probe at margin 8 has zero retained negative
acceptances, but is not a candidate: it removes absolute acoustic evidence,
does not recover H, and its only new weak-acoustic held-out positive proposes
the wrong end edge. Lowering its margin to 5 would recover H but would be
H-derived tuning and is prohibited.

Historical real negatives and progression adversaries remain unchanged under
their frozen evaluators. Whisper remains a fallback only: it truncates H,
truncates reader I to its tail while abstaining, fails to terminate for reader K
within the bounded capture, and accepts the repeated-partial and cross-surah
negative tails. None of those results is design truth.

## 11. Limitations and next action

The original H capture did not retain whole-hypothesis scores or top-N ranks;
the exact winner and null-runner scores are reconstructed from the deterministic
solver, and a pinned-model rerun confirms the competition shape. The rerun is
diagnostic only because its decoder path produces slightly different CTC
values. Retained fixtures expose independent winners but not alternate ranks.

More evidence is required before another candidate: independently held-out
5–8-window weak-CTC positives with **exact** FastConformer edges, plus difficult
5–8-window same-surah repetition/reset negatives with plausible finite margins.
Future capture should retain privacy-safe global hypothesis summaries and
top-N coordinate/rank evidence. The single next action is to collect that
pre-designated corpus; do not change production gates.


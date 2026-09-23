# Canonical passage reconstruction (offline architecture investigation)

**Conclusion: CANDIDATE JUSTIFIED FOR ONE FROZEN EXTERNAL VALIDATION.** This
milestone adds offline analysis only. It does not change production recognition,
caption generation, forced alignment, media handling, acoustic thresholds, or
public assets.

Command:

```sh
npm run calibration:canonical-reconstruction:evaluate
```

## 1. Problem statement

The coherent FastConformer/Viterbi path may replace a weak but structurally
correct local Quran candidate with null. That is appropriate acoustic
abstention, but it must not decide that a canonical ayah ceases to exist after
the passage has been established. The intended architecture is:

`audio -> Quran-localization evidence -> canonical passage -> complete canonical verses -> forced alignment -> caption timing`

This investigation addresses passage identity and the complete inclusive
canonical range only. It does not alter or evaluate exact word timing.

## 2. Why threshold tuning stopped

Reader H is weak throughout: its first three correct local candidates have CTC
scores `-4.98`, `-4.04`, and `-4.77`, below the null score. Lowering acoustic
gates would discard an established safety boundary and would still conflate
identity with completeness. Reconstruction instead asks whether the ordered
candidate coordinates independently describe one passage. CTC remains in the
schema for diagnostics but is not an absolute deletion gate.

## 3. H motivating example

H recites `91:1-15`. Its seven local winners are `1-5, 4-8, 6-10, 8-12,
10-13, 13-14, 14-15`; all are Surah 91, every transition overlaps, the frontier
always grows, and there is no reset or plateau. The coherent path nulls the
first three and yields `91:8-15`. H was excluded from rule design and evaluated
only after constants were frozen.

## 4. Comparison with Quran Caption

The review was intentionally narrow and used the public repository and release
notes without cloning it:

- Its current local stack separates FastConformer transcription, Quran text
  matching, and CTC/phoneme alignment against known text. That separation
  supports our independently chosen identity-first, known-text-alignment-next
  architecture.
- Its Quranic Universal Aligner uses VAD, phoneme ASR, canonical anchors,
  constrained substring edit-distance alignment, retry/re-anchoring, and
  explicit wrap metadata for repetition. The portable idea is to reason about
  canonical coordinates and keep repetition state separate from match quality.
- We already independently implement browser-local FastConformer Quran-wide
  identification, VAD-constrained acoustic work, canonical target construction,
  and deterministic CTC forced alignment.
- The concrete implementation depends on Python, PyTorch/ONNX Runtime Python,
  native Tauri/Rust process management, Cython, and optional external MFA. It
  is not directly reusable in our TypeScript/ONNX Runtime Web/WebGPU/WASM
  browser architecture. Its phoneme model, external aligner, and native
  binaries are outside this milestone.
- The review did not materially change the frozen sequence rule. It reinforced
  the architectural boundary between passage location and known-text timing.

References: <https://github.com/zonetecde/QuranCaption>,
<https://github.com/zonetecde/QuranCaption/releases>, and the repository's
`src-tauri/python/quran-multi-aligner/README.md`.

## 5. Input evidence

The pure offline input contains a chronological window index, independent local
winner (surah, ayah edges, relative canonical word edges, CTC, optional coverage
and origin), coherent-path candidate, and anchor event. The adapter consumes
the existing privacy-safe `trajectory.windows` fixtures. Coverage and local
candidate origin were not retained in those fixtures and remain `null`; no new
production instrumentation was added. Retained fixtures contain only relative
coordinates and recognition metadata, not audio, Quran text, transcripts,
filenames, paths, hashes, or personal identifiers.

Top-N local candidates are not available in committed fixtures. Earlier ignored
debug evidence established H's top-five shape, but it is unnecessary for this
experiment. Zero new media captures were used.

## 6. Frozen reconstruction algorithm

The rule is deterministic and has no reader or surah exceptions:

1. Sort windows chronologically and count every local winner by surah.
2. Pick the dominant surah by count, then earliest support, then surah number.
3. Require at least 3 dominant-surah windows and dominant support in at least
   75% of all generated windows.
4. Form chronological runs from dominant-surah local winners. Split a run when
   either word edge moves backward by more than 2 canonical words, when the
   next start skips more than 6 words past the previous end, or when more than
   1 consecutive window fails to advance the canonical end frontier.
5. Pick the longest run, with deterministic span and earliest-window tie
   breaks. Require it to own at least 75% of all generated windows.
6. Infer the start and end from the minimum and maximum supported ayah edges in
   that run. A coherent candidate may supplement an edge only when the same
   accepted window is explicitly `anchor-advanced` and its sole origin is
   `local`; this preserves the retained `74:9` continuation edge without
   admitting global-only extensions such as K's `92:15` or Husary's `75:16`.
7. Expand an accepted inclusive range to every canonical ayah. Acoustic nulls
   do not remove any ayah from that target.

Frozen constants:

| Condition | Value |
| --- | ---: |
| Minimum supporting windows | 3 |
| Minimum dominant-surah fraction | .75 |
| Minimum continuous-run fraction | .75 |
| Backward word tolerance | 2 |
| Maximum skipped canonical words | 6 |
| Maximum consecutive no-progress windows | 1 |

## 7. Overlap and temporal progression

Normal 12-second windows with a 6-second hop overlap heavily. Overlap is
therefore positive continuity evidence, not repetition. Sequences such as
`1-5 -> 4-8 -> 6-10 -> 8-12` remain one run because starts and ends move
forward while the covered frontier grows. The result records adjacent overlap,
skipped distance, progression consistency, and supporting window indices.

## 8. Repetition and no-progress handling

Repetition is detected from canonical coordinates, not repeated wording. A
second `A B C D` pass creates a backward reset into a new run; a repeated ayah
without a coordinate reset creates a no-progress plateau. One isolated
no-progress observation remains tolerable, but a sustained plateau splits the
run. A full or partial repeated pass cannot own 75% of the original complete
timeline, so it rejects rather than being merged.

## 9. Reset, skip, and cross-surah handling

A backward move beyond the 2-word overlap tolerance splits the run. A forward
gap above 6 words also splits it, preventing non-contiguous Quran material from
being bridged. Cross-surah mixtures fail the 75% dominant-surah requirement or
the 75% continuous-run requirement. The genuine 54, 55, and 77 refrain cases
remain valid because their canonical coordinates move forward even when the
lexical refrain repeats. Reader G's single trailing local outlier is tolerated;
its 10-window forward run still owns 10/11 windows.

## 10. Edge inference and canonical completeness

Edges are evidence-derived; the algorithm never expands to an arbitrary
earlier or later ayah. It reports support count and first/last supporting
window separately for each edge. Multiple edge windows are stronger evidence,
but a single edge window is retained when the complete sequence is otherwise
accepted. `expandCanonicalAyahRange({surah: 91, startAyah: 1, endAyah: 15})`
returns all fifteen ayat, regardless of acoustic omissions. Production target
construction is deliberately unchanged in this milestone.

Proposed interface:

```ts
type ReconstructedPassage = {
  surah: number;
  startAyah: number;
  endAyah: number;
  confidence: {
    sequenceSupport: number;
    startSupport: number;
    endSupport: number;
  };
  edges: {
    firstStartSupportingWindow: number;
    lastStartSupportingWindow: number;
    firstEndSupportingWindow: number;
    lastEndSupportingWindow: number;
  };
  evidence: {
    supportingWindows: number[];
    dominantSurahWindowCount: number;
    totalWindowCount: number;
    resetCount: number;
    repeatedSpanRevisitCount: number;
    longestNoProgressRun: number;
    skippedCanonicalWords: number;
    adjacentOverlapCount: number;
    progressionConsistency: number;
  };
};
```

## 11. Genuine fixture results

“Local” is the dominant-surah union of independent winners. “Coherent” is the
current production proposal. Identity and exact edges are both correct for all
20 genuine fixtures.

| Fixture | Expected | Local | Coherent | Reconstructed | Start/end support |
| --- | --- | --- | --- | --- | ---: |
| Muddaththir | 74:1-9 | 74:1-8 | 74:1-9 | 74:1-9 | 1/1 |
| Alafasy 93 | 93:1-11 | 93:1-11 | 93:1-11 | 93:1-11 | 1/2 |
| Alafasy 94 | 94:1-8 | 94:1-8 | 94:1-8 | 94:1-8 | 1/1 |
| Hani 3 | 3:33-35 | 3:33-35 | 3:33-35 | 3:33-35 | 2/4 |
| Hani 69 | 69:19-22 | 69:19-22 | 69:19-22 | 69:19-22 | 2/2 |
| Husary 75 | 75:1-15 | 75:1-15 | 75:1-16 | 75:1-15 | 1/1 |
| Reader A 1 take B | 1:1-7 | 1:1-7 | 1:1-7 | 1:1-7 | 1/3 |
| Reader A 66 take B | 66:1-7 | 66:1-7 | 66:1-6 | 66:1-7 | 2/2 |
| Reader A 66 take C | 66:1-7 | 66:1-7 | 66:1-6 | 66:1-7 | 2/3 |
| Reader A 1 | 1:1-7 | 1:1-7 | 1:1-7 | 1:1-7 | 1/4 |
| Reader A 66 | 66:1-7 | 66:1-7 | 66:1-7 | 66:1-7 | 2/2 |
| Reader B 50 | 50:16-18 | 50:16-18 | 50:16-18 | 50:16-18 | 4/3 |
| Reader D 55 | 55:1-25 | 55:1-25 | 55:1-25 | 55:1-25 | 1/1 |
| Reader E 77 | 77:1-28 | 77:1-28 | 77:1-28 | 77:1-28 | 1/1 |
| Reader F 78 | 78:1-16 | 78:1-16 | 78:1-16 | 78:1-16 | 1/1 |
| Reader G 54 | 54:15-22 | 54:15-22 | 54:15-22 | 54:15-22 | 2/1 |
| Reader H 91 (held out) | 91:1-15 | 91:1-15 | 91:8-15 | 91:1-15 | 1/1 |
| Reader I 89 | 89:1-14 | 89:1-14 | 89:1-14 | 89:1-14 | 1/1 |
| Reader J 90 | 90:1-12 | 90:1-12 | 90:1-12 | 90:1-12 | 1/2 |
| Reader K 92 (held out) | 92:1-14 | 92:1-14 | 92:1-15 | 92:1-14 | 1/2 |

Exact-range reconstruction: **20/20**. Surah correctness: **20/20**.
Surah-correct but edge-wrong: **0**.

## 12. H held-out result

H excluded from design: **YES**. Local implied range: `91:1-15`. Current
coherent range: `91:8-15`. Reconstructed range: **`91:1-15`**, exact: **YES**.
All 7/7 windows support the dominant passage, all six adjacent transitions
overlap, progression consistency is 1, skipped distance is 0, reset count is 0,
and longest no-progress run is 0. Start ayah 1 is supported by window 0; end
ayah 15 is supported by window 6. Weak CTC never deletes those structural
observations.

## 13. K edge result

Expected: `92:1-14`. Current coherent: `92:1-15`. Reconstructed:
**`92:1-14`**, exact: **YES**. Start ayah 1 has one supporting window; end ayah
14 has two (windows 6 and 7). The global-only coherent extension through ayah
15 is not accepted as an edge, so reconstruction does not repeat the unsafe
extra-end behavior.

## 14. Adversarial fixture results

All **23/23** adversaries reject; false reconstructed continuous passages:
**0**.

| Adversary | Local implied | Coherent | Result | Primary reason |
| --- | --- | --- | --- | --- |
| backward 6:77->74 | 6:74-77 | 6:77-78 | reject | reset/run support |
| isolated 74 excerpt | 74:4-5 | 74:4-5 | reject | fewer than 3 windows |
| mixed non-contiguous Quran | 6:74-77 | 6:74-78 | reject | surah + run support |
| repeated 94 x2 | 94:1-8 | 94:1-8 | reject | reset/run support |
| alternating 93 | 93:1-6 | 93:1-7 | reject | reset/run support |
| partial-reset 94 | 94:1-8 | 94:1-8 | reject | reset/run support |
| repeated 93 complete | 93:1-11 | 93:1-11 | reject | reset/run support |
| repeated Hani 3 | 3:33-35 | 3:33-36 | reject | reset/run support |
| repeated 55 x4 | 55:1-5 | 55:1-5 | reject | plateau/run support |
| repeated 6:77 | 6:77-78 | 6:77-78 | reject | reset/run support |
| repeated 93:1 | 93:1-2 | 93:1-2 | reject | plateau/run support |
| backward reader B | 50:16-18 | 50:17-19 | reject | reset/run support |
| cross-surah jump | 50:16-18 | 50:16-18 | reject | surah + run support |
| repeated complete 50 | 50:16-18 | 50:16-19 | reject | reset/run support |
| 55 refrain out of order | 55:4-25 | 55:4-25 | reject | reset/run support |
| 77 partial reset | 77:1-28 | 77:1-28 | reject | reset/run support |
| 77 repeat after progress | 77:1-28 | 77:1-28 | reject | reset/run support |
| 78 alternating | 78:1-16 | 78:1-17 | reject | reset/run support |
| 78 x2 | 78:1-16 | 78:1-17 | reject | reset/run support |
| 54 x3 | 54:15-41 | 54:15-22 | reject | skip/reset/run support |
| reader I backward | 89:1-14 | 89:1-7 | reject | reset/run support |
| reader J repeated partial | 90:1-6 | 90:1-7 | reject | reset/run support |
| reader I->K mixture | 92:7-14 | 89:1-9 | reject | surah + run support |

Required spot checks: repeated 50 rejects; 78 x2 rejects; 54 x3 rejects; 55
out-of-order rejects; both 77 reset forms reject; backward forms reject;
cross-surah forms reject; mixed non-contiguous Quran rejects.

## 15. Limitations and evidence gaps

- This is retrospective offline evidence, not an independently frozen external
  validation. The maximum conclusion is therefore a candidate for one such
  milestone, never production integration.
- H and K each have only one start-edge window; H also has only one end-edge
  window. The full sequence makes those edges defensible, but their edge
  confidence is weaker than K's two-window end.
- Top-N alternatives, local coverage, and local candidate origin are absent
  from committed trajectories. The analysis cannot use rank stability or
  runner-up separation.
- The relative word coordinate origin comes from the retained coherent path.
  A future production design should expose passage-local canonical coordinates
  directly rather than inherit this offline capture convention.
- The 75% rule intentionally tolerates isolated local outliers. External
  validation must challenge cases with a long correct prefix followed by a
  short real reset and cases with boundary-only false extensions.

## 16. Browser feasibility, candidate, and next step

The algorithm is sorting, counting, integer interval comparison, and range
expansion over a small window list. It is deterministic, linear apart from
small tie sorting, has no model or server dependency, and is practical in the
browser.

**Candidate:** YES, for one frozen external-validation milestone only. Every
historical/design genuine passage is exact, refrain-heavy positives pass, H
recovers after exclusion from design, K does not over-expand, and all retained
repetition, reset, out-of-order, cross-surah, and non-contiguous adversaries
reject. There is no fixture-specific or surah-specific exception.

**Exact next step:** pre-designate one focused external-validation corpus that
stresses weak edges, short real resets, cross-surah mixtures, non-contiguous
same-surah jumps, and refrain-heavy forward passages; freeze this exact rule
and evaluator before any recognition. Do not integrate production until that
validation passes.

## 17. Verification and freeze proof

The required final pass succeeded: FFmpeg assets, Quran-ID fixture schema,
509/509 tests, strict TypeScript, quiet lint, production build, CTC evaluation,
multi-signal evaluation, progression evaluation, progression external
validation, short-gate evaluation, canonical reconstruction evaluation, and
`git diff --check`. The build retained only the existing ONNX/VAD bundler
warnings and the expected optional TikTok configuration reminder.

Diffs from `main` under `src/lib/recognition`, `src/lib/media`,
`src/app/create`, and `public` are empty. Production recognition and media are
therefore frozen. No secrets or media were added, and the fixture adapter uses
the existing privacy-safe retained metadata only.

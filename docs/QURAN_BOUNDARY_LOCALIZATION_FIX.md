# Quran boundary localization architecture fix

## Scope and invariant

This milestone changes only the representation and algorithm used to localize
the temporal edges of an already reconstructed canonical Quran core. Canonical
range identity remains owned by reconstruction and whole-recording integrity.
Boundary localization still cannot accept a range, add an ayah, bypass bounded
adjacent-edge verification, or replace final exact-range forced alignment.

The production CTC thresholds, VAD, 12-second identification window, 6-second
hop, FastConformer model and initialization, retrieval, continuation, anchors,
reconstruction, integrity, edge verification, forced-alignment constants,
Quran normalization/text, fallback authority, caption padding, and 225 ms
blur-fade are unchanged. `tests/quran-boundary-protected-constants.test.ts`
asserts the protected values from starting revision `0162587d`.

## The two regressions

### Case A — valid outer evidence was discarded

`tmp/regression-fixtures/case-a-timing.mov` is `20:100-103`. Its source is
32.979458 seconds and its canonical recognition PCM is 33.000 seconds. Audible
Quran begins at approximately 0.395 seconds and ends at approximately 32.913
seconds; VAD reports one continuous region from 0.384 to 32.928 seconds.

The old locator evaluated equal 12-second intervals while moving the proposed
cut over a six-second search span. It required the first/last forced token to
be within 200 ms of the proposed cut, then selected the valid candidate with
the greatest normalized target likelihood. That chose the interior emission
anchors 4.104 and 26.968 seconds. Final forced alignment was then constrained
to those cuts, so valid canonical audio outside them could never be recovered.

### Case B — the target representation was impossible

`tmp/regression-fixtures/case-b-recognition.mp4` reconstructs `2:258-259` from
18/19 coherent windows. Integrity is valid. The unchanged primary mean-CTC
gate abstains, as designed, while complete-range reconstruction provides the
safe recovery path.

The old boundary target was the first/last up to three complete ayahs. Because
the two-ayah core itself contains 248 CTC labels and each 12-second boundary
interval contains 150 frames, neither boundary target had a possible CTC path.
The failure was incorrectly represented as absent acoustic evidence, both
locators returned null, and whole-core proof never ran.

## CTC feasibility

For labels `l[0..n-1]`, the mathematical minimum is:

```text
minimumFramesRequired = n + count(i > 0 where l[i] == l[i - 1])
```

Every label needs a frame. Adjacent repeated labels need an intervening blank
because the CTC trellis cannot skip directly from one equal label to the next.
Initial and final blank states are optional.

Localization sizing also reserves one non-label frame per selected label,
derived from the alternating blank/label CTC topology:

```text
localizationFrameRequirement = minimumFramesRequired + n
```

This is a frame-derived topology rule, not a long-ayah token limit. Every
candidate separately checks its mathematical minimum before forward scoring or
forced alignment, so an impossible target is never knowingly submitted.

## Feasible canonical boundary representation

The source material remains the same canonical first/last up-to-three-ayah
edge stream, preserving established short-ayah behavior when it fits.

- Start localization takes the longest contiguous canonical token prefix that
  fits the actual minimum boundary-frame capacity.
- End localization takes the longest contiguous canonical token suffix that
  fits that capacity.
- A long first/final ayah is therefore sliced within that same boundary ayah;
  no word is skipped, summarized, reordered, normalized differently, or
  fabricated.
- The selected words are only the owners of those exact canonical tokens.
- The complete canonical core and exact final range are not truncated.

Case B now records the 248-label source as
`target-representation-infeasible`. Both local targets are contiguous 75-label
representations in 150 frames, with a mathematical minimum of 75 and a
blank-slack requirement of exactly 150. Start owns 31 canonical words from the
prefix of 2:258; end owns 30 canonical words from the suffix of 2:259.

## Outer canonical evidence preservation

The original equal-duration coarse/fine maximum-likelihood search remains the
emission-anchor search. An anchor can move outward only through a second,
bounded proof over the region between that anchor and the existing outer VAD
limit:

1. Collapse nonblank greedy CTC emissions in the outer region.
2. Find their ordered canonical subsequence within the already selected edge
   target.
3. Require at least the existing two-token boundary proof; VAD alone cannot
   satisfy this.
4. Construct exactly the canonical prefix ending at the last observed start
   token, or suffix beginning at the first observed end token.
5. Require that representation to fit the region's CTC frame topology.
6. Require its complete forced alignment and a strict normalized forward-CTC
   win over the blank-only hypothesis.
7. Use the first/last aligned token as the acoustic extent. Only contiguous
   blank-dominant frames inside the same proven VAD region may extend from the
   last token to acoustic completion (or equivalently back to onset).

There is no padding and no new acoustic acceptance threshold. Ordered
canonical emissions plus a strict canonical-over-blank comparison provide the
acoustic/canonical evidence. The six-second search span keeps this local and
bounded.

For Case A, the start outer region 0.384–4.104 seconds uses a four-label
canonical prefix, has two ordered canonical emissions, and scores -0.743362
per frame versus -1.350821 for blank. The corrected start is 0.384 seconds.
The end outer region 26.968–32.928 seconds uses a 12-label canonical suffix,
has four ordered emissions, and scores -0.769228 versus -1.349724 for blank.
Its final token ends at 32.686 seconds in the local proof; the remaining frames
are blank-dominant, continuously voiced, and adjacent to that proven suffix,
so acoustic completion is 32.928 seconds.

The final full-range alignment begins its first token at 0.399 seconds and
ends its final token at 32.661 seconds. Its ayah intervals are 20:100
0.399–8.944, 20:101 8.944–16.929, 20:102 16.929–26.192, and 20:103
26.192–32.928 seconds. Internal word timing is still produced by the unchanged
final exact-range aligner; the localizer does not stretch interior words.

## CTC blank handling

Leading/trailing blank is not automatically Quran evidence. A blank run is
associated with a boundary only after the bounded region has:

- the existing minimum ordered canonical emission proof;
- a complete feasible canonical prefix/suffix alignment;
- a strict canonical likelihood win over blank; and
- continuous VAD membership with no intervening greedy nonblank emission in
  the completion run.

Case A's start is emitted directly at the corrected first frame, so no leading
blank completion is applied. Its final canonical token is followed by a
blank-dominant voiced tail, so the end is retained through VAD acoustic
completion rather than stopped at the token emission.

## Safety invariants and regression results

- Boundary feasibility is not boundary acceptance.
- Canonical reconstruction remains the only range-identity authority.
- Whole-recording integrity, complete whole-core alignment, bounded adjacent
  edge verification, inclusive canonical expansion, and exact final forced
  alignment are still mandatory.
- Adjacent expansion remains at most one ayah per edge and still requires its
  unchanged complete-coverage/direct-win proof. Basmalah remains optional
  prelude evidence and never owns an ayah.
- Synthetic tests reject VAD-only, unrelated token emissions, reversed/wrong
  adjacent Quran tokens, and a target too small for the existing proof.
- Existing repeated/reset and out-of-order cases still reject before boundary
  localization can hide them.
- Short feasible targets remain unchanged, including exact token identity.
- Manual caption timing remains authoritative; no editor regeneration path was
  changed.

Retained evaluators remain H `91:1-15`, K `92:1-14`, Positive B `101:1-11`,
Negative A rejected with both integrity vetoes, historical genuine 20/20,
historical adversarial 23/23, and final complete-range validation 2/2 genuine
exact plus 2/2 adversarial rejected.

## Real fixture results and performance

Case A remains exactly `20:100-103`. The old selected range 4.104–26.968
seconds becomes 0.384–32.928 seconds; whole-core proof, both no-extension edge
decisions, and 4/4 ayah forced alignment pass. A warm browser harness measured
28.179 seconds before and 28.055 seconds after.

Case B changes from rejected after null boundary localization to exactly
`2:258-259`. Whole-core alignment is 248/248, adjacent 2:257 and 2:260 are not
added, and 2/2 final ayah alignment completes. The failed baseline measured
58.940 seconds and stopped before edge/final alignment. The successful path
measured 74.095 seconds because it additionally runs the two bounded edge
checks and final alignment that the old impossible representation never
reached.

Both paths retain one Quran-wide search, one retained FastConformer session,
reused canonical PCM/VAD/full-recording logits, and at most two bounded edge
inferences. Media preparation is unchanged.

The built production `/create` path also passed in isolated headless Chrome.
Case A saved exactly `20:100-103`: its raw CaptionSegments were 0.384–8.940,
8.940–16.936, 16.936–26.211, and 26.211–32.928 seconds. Case B preserved the
primary CTC abstention, recovered exactly `2:258-259`, completed final forced
alignment, and saved verse intervals 5.344–40.522 and 40.522–108.240 seconds.
Both browser runs used the native-safe WebCodecs preparation path, one global
Quran search, and one retained FastConformer session.

Final validation is 594/594 tests, strict TypeScript, quiet lint, production
build, and `git diff --check`. The production build retains only its established
ONNX dynamic-require and Transformers `import.meta` warnings.

## Presentation

Raw Case A caption coverage follows the corrected alignment envelope. The
unchanged 225 ms blur-fade remains presentation-only: the first caption ramps
in over its first 225 ms and the final caption ramps out over its final 225 ms.
No recognition boundary was padded or hidden by the transition.

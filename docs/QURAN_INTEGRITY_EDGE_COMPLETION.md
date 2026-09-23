# Quran integrity and bounded edge completion (offline investigation)

**Conclusion: NO CANDIDATE.** Whole-recording integrity is justified by the
retained corpus and fixes the frozen Negative A failure. Bounded edge completion
has a browser-feasible contract, but the retained captures do not contain the
comparative boundary-acoustic evidence required to calibrate or evaluate it.
Positive B therefore remains unrecovered. Nothing in production was changed.

Commands:

```sh
npm run calibration:integrity-edge:evaluate
npm run calibration:integrity-edge:privacy
```

## 1. Previous external-validation failures

The frozen canonical reconstruction passed historical evidence but failed two
new cases. Positive B expected `101:1-11`; its five local winners were `2-4,
4-6, 5-7, 7-9, 9-11`, every coherent candidate was null, production abstained,
and reconstruction returned none. Ayah 1 had no local winner evidence.

Negative A contained `100:1-11` followed by `100:1-5`. The first ten of thirteen
windows formed a valid run, so `.769231` exceeded the frozen `.75` run fraction
and reconstruction falsely accepted `100:1-11`. The complete trajectory had one
reset, four revisit windows, and a longest no-progress run of four.

## 2. Architecture decomposition

The evaluated decomposition is:

`audio -> Quran localization -> canonical core -> whole-recording integrity -> bounded edge completion -> inclusive canonical range -> forced alignment -> captions`

Identity, structural integrity, exact edges, and timing remain separate. The
historical reconstruction constants were not changed.

## 3. Whole-recording integrity input

Input is the selected core plus every chronological local-winner window. The
audit records core, before-core, after-core, and all outside-core window IDs;
outside dominant surah and relative positions; resets, revisits, already-covered
ayah evidence, no-progress behavior, incompatible forward runs, cross-surah
runs, and optional VAD voiced duration. Existing captures do not retain voiced
duration, so that metric is explicitly `null`, never inferred.

## 4. Contradiction and frozen integrity conditions

Weakness is not contradiction. Only positive local Quran winners may veto. The
frozen, deterministic conditions are:

1. At least two consecutive generated windows form the contradiction; gaps or
   intervening core windows break a run.
2. A same-surah outside run is contradictory when it resets more than two
   canonical words behind the final core start or revisits the covered frontier.
3. Two consecutive already-covered ayah windows veto only when a reset is also
   present; ordinary terminal overlap alone remains valid.
4. Two consecutive same-other-surah winners, or two consecutive same-surah
   winners beginning beyond the adjacent ayah, form incompatible runs.

The two-window condition is absolute rather than a percentage. Null windows,
silence, missing candidates, isolated weak/outlier winners, and one terminal
overlap never veto by themselves. Repetition is based on canonical coordinates,
not repeated wording, so refrain-heavy genuine surahs remain valid.

## 5. Integrity results

Design-visible results are 18/18 genuine passages exact and 23/23 adversaries
rejected. The historical aggregate, including internal holdouts, is 20/20
genuine exact and 23/23 adversaries rejected. H remains exactly `91:1-15`.

After freezing, Negative A's selected core uses windows 0-9. Windows 10-12 are
positive Surah 100 evidence at relative word spans `0-5`, `2-7`, and `6-10`.
All three lie behind the completed frontier and repeat covered ayat. The exact
vetoes are `reset-or-revisit-run` and `repeated-covered-quran-run`; the recording
is rejected as one continuous passage. Its outside-core no-progress run is
three windows (the earlier four-window statistic covered the full trajectory).

## 6. Bounded edge hypotheses

For a core `S:X-Y`, the start competition is no extension versus `S:(X-1)-Y`;
the end competition is no extension versus `S:X-(Y+1)`. Only an existing,
immediately adjacent ayah is allowed. Maximum expansion is one ayah per edge.
No other surah, skipped ayah, or wider search is representable by the interface.

## 7. Acoustic verification and no-extension comparison

The proposed browser-local verifier reuses the prepared PCM, loaded
FastConformer logits, known canonical tokens, and existing forward-CTC/forced
alignment machinery on only the boundary audio. Extension requires all of:

- usable voiced boundary audio;
- complete alignment and 100% target-token coverage;
- strict normalized log-likelihood win over the blank/no-extension hypothesis;
- temporal placement outside the core; and
- no overlap with audio required by the core.

This is direct hypothesis competition, not a new confidence model. A completed
forced alignment alone is insufficient because fixed-text CTC can force a path
without showing that it beats no extension. Missing comparative evidence means
no extension.

The contract tests show both start and end extensions winning with complete
comparative evidence, and show no extension winning for absent, partial,
misordered, core-stealing, non-adjacent, or acoustically losing evidence.
These are semantic tests, not empirical calibration captures.

## 8. Basmalah and canonical completeness

Optional basmalah-only audio is an explicit rejection reason for edge extension.
Existing `basmalah-prelude` behavior is unchanged and never becomes a canonical
ayah. Once a final inclusive range is accepted,
`expandCanonicalAyahRange` emits every ayah exactly once. Completeness passes.

## 9. Design corpus, captures, and holdout protocol

No new media was needed for integrity and no new media was captured for edges.
The design corpus excludes the four prior external-validation fixtures. H and K
remain internal holdouts and both pass: H is `91:1-15`; K is `92:1-14`, with no
attempt to add 92:15 because comparative end evidence is absent.

The integrity and edge constants are frozen objects. Only after evaluating 41
historical/design fixtures and the two internal holdouts does the evaluator load
the external-validation directory. Positive B and Negative A are named in the
reported calibration exclusions and cannot supply a rule parameter.

## 10. Positive B post-freeze result

Positive B remains **none**, not `101:1-11`. Its all-null coherent path means
the unchanged reconstruction does not yield the core required by the edge
layer. More importantly, the privacy-safe retained fixture has no boundary PCM,
logits, VAD interval, token coverage, or candidate-versus-no-extension score for
101:1. Its recorded forced-alignment completion cannot safely substitute for
that competition. There is therefore no acoustic evidence in the retained data
that can honestly cause ayah 1 to be included. The rule was not tuned further.

## 11. Runtime and privacy

Integrity is linear in the small window list. Each edge adds at most one
boundary-local forward-CTC comparison and reuses PCM, model, logits, and known
text; estimated extra work is two bounded boundary scores, not another
whole-Quran retrieval or model pass. It is practical in TypeScript with ONNX
Runtime Web on WebGPU/WASM.

No audio, PCM, transcript, path, filename, hash, device data, absolute Quran
word index, or new fixture is retained. The privacy validator covers all new
offline source/test files.

## 12. Limitations, decision, and next action

The integrity evidence is sufficient and deterministic. The edge verifier is
not empirically validated because prior privacy-safe captures retained only a
completion status, not competing boundary likelihoods. Positive B also exposes
a prerequisite gap: edge completion cannot operate when the unchanged core
reconstructor returns none.

Success criteria therefore fail despite zero historical false positives or
false negatives and a correct Negative A veto. Candidate justified for frozen
external validation: **NO**. Production implementation is not justified.

The single next action is a separate predesignated offline capture milestone
that retains privacy-safe boundary-local VAD duration, token coverage, and
candidate-versus-no-extension CTC scores for genuine weak-edge and exact-stop
cases, while separately deciding how an all-null coherent path may expose a
core without retuning canonical reconstruction.

# Complete Quran range final frozen validation

## 1. Purpose

This milestone externally validates the complete frozen offline Quran passage
architecture on four new, predesignated recordings/constructions. It changes
no production behavior and does not tune, repair, or replace any candidate.

## 2. Complete frozen architecture

`audio -> FastConformer local Quran evidence -> canonical/provisional core -> whole-recording integrity -> candidate-independent core boundaries -> bounded adjacent-ayah verification -> exact inclusive canonical range -> canonical completeness -> forced alignment -> caption timing`

The validation-only browser harness uses the production FastConformer model,
12-second/6-second-hop local evidence geometry, canonical Hafs corpus, VAD,
CTC normalization, and forced-alignment primitives. Ground truth is evaluated
only after the browser returns a decision.

## 3. Exact frozen conditions

The candidate is imported from the previously committed modules by object
identity and is `Object.freeze`d.

| Layer | Frozen values |
| --- | --- |
| Canonical reconstruction | minimum windows 3; dominant-surah fraction .75; continuous-run fraction .75; backward tolerance 2 canonical words; maximum skip 6 words; maximum no-progress run 1 |
| Provisional local core | minimum windows 3; dominant-surah ratio 3/4; run ratio 3/4; maximum skipped ayat 1; maximum no-progress windows 1 |
| Whole-recording integrity | minimum contradictory run 2 windows; reset tolerance 2 canonical words |
| Boundary localization | 6,000 ms search; 12,000 ms equal-duration evaluation; 200 ms coarse step; 40 ms fine step; 200 ms boundary-token tolerance; 3 target ayat; minimum 2 target tokens; complete boundary target and complete whole core required |
| Edge verification | maximum one adjacent ayah per edge; minimum 320 ms voiced; 100% target coverage; strict win over the real blank/no-extension path |
| Canonical completeness | inclusive, ordered, unique expansion of every ayah from X through Y |

The FastConformer model, VAD, Whisper behavior, retrieval, basmalah behavior,
media preparation, normalization, thresholds, and production forced alignment
remain unchanged.

## 4. Sequencing and freeze proof

Starting HEAD was `10a598313dd1371341beda254cb5fe10aa077513`.
The complete candidate and four roles were recorded at
`2026-09-24T05:37:21Z`, before source acquisition and before any recognition.
The four terminal artifact timestamps were `05:50:17Z`, `05:53:20Z`,
`05:57:44Z`, and `06:00:23Z`. Tests assert this ordering, immutability, exact
role count, and that the browser decision module imports no designation or
ground-truth range.

Exactly four completed media runs occurred. No case was replaced or rerun.

## 5. Four predesignated cases

| Role | Public reader/source | Construction / ground truth | Reason |
| --- | --- | --- | --- |
| Genuine start edge | Muhammad Siddiq al-Minshawi, EveryAyah | `81:8-22` | Short non-surah starting ayah and both adjacent-edge competitions |
| Genuine exact stop | Muhammad Jibreel, EveryAyah | `86:1-12`; 86:13 absent | Distinct reader and non-terminal exact stop |
| Same-surah reset | Ali al-Hudhaify, EveryAyah | `82:1-19, 82:1-6` | Complete progress followed by substantive reset/repetition |
| Same-surah out of order | Saad al-Ghamdi, EveryAyah | `84:16-25, 84:1-8, 84:9-15` | Later-to-earlier jump followed by partial forward progress |

These reader directories and recordings were not used to design the final
boundary-localization candidate. Public per-ayah filename keys supplied the
independent verse order; they were never inputs to recognition.

## 6. Case 1 result

Case 1 generated 13 windows. Local winners were `81:8-10, 9-11, 10-12,
12-14, 13-14, 14-15, 15-17, 16-18, 17-19, 19-20, 20-21, 21-22, 22-22`.
The coherent path covered the same exact passage, with the fourth window
ending at 13. Canonical reconstruction, provisional core, and selected core
were all `81:8-22`; all 13 windows supported the core. Integrity passed with
zero resets, revisits, no-progress run, or outside-core windows.

The locator selected 944 ms as core start and 75,712 ms as core end. Whole-core
coverage was 123/123 tokens. The absent start candidate 81:7 had 560 ms voiced,
7/7 target coverage, candidate likelihood -3.942274 versus blank -1.308614,
and correctly lost. The absent end candidate 81:23 had 2,240 ms voiced, 12/12
coverage, -4.930193 versus blank -1.457328, and correctly lost. Final range:
exact `81:8-22`; forced alignment completed 15/15 ayah timings. **PASS**.

## 7. Case 2 result

Case 2 generated 9 windows. Local winners progressed `86:1-3, 2-4, 4-5,
5-6, 6-7, 7-8, 8-10, 9-11, 10-12`; the coherent path retained windows 0,
7, and 8 and nulled the middle six. Canonical reconstruction and provisional
core nevertheless both yielded exact `86:1-12`. Integrity passed with no
outside-core evidence.

The selected core interval was 640-58,440 ms with 101/101 whole-core tokens.
Only 271 ms remained after the core, of which 120 ms was voiced. Candidate
86:13 aligned 0/7 tokens; its likelihood was unavailable and blank scored
-0.837137. It rejected for insufficient voiced audio, incomplete alignment,
incomplete coverage, and failure to beat no extension. Final range: exact
`86:1-12`; forced alignment completed 12/12 ayah timings. **PASS**.

## 8. Case 3 result

Case 3 generated 27 windows. Windows 0-20 formed canonical core `82:1-19`;
windows 21-26 returned to `82:1-6`. The provisional whole-recording core
rejected for `no-dominant-forward-run`, while canonical reconstruction exposed
the valid first sub-run for the integrity audit.

Integrity found six reset/revisit windows, six repeated-covered windows, a
six-window no-progress run, and vetoed with `reset-or-revisit-run` and
`repeated-covered-quran-run`. Boundary logic and forced alignment did not run.
Final result: rejected, `none`. **PASS**.

## 9. Case 4 result

Case 4 generated 20 windows. Local evidence progressed through `84:16-25`,
then reset to `84:1-8`, then advanced through `84:9-15`. Both the local and
coherent trajectories visibly contain the backward jump.

Canonical reconstruction rejected for `no-dominant-continuous-run` and the
provisional core rejected for `no-dominant-forward-run`. No core was selected,
so integrity, boundary logic, and forced alignment had no eligible input.
Final result: rejected, `none`, exact reason
`no-canonical-or-provisional-core`. **PASS**.

## 10. Exact-range evaluation

New genuine exact count is **2/2**. Case 1 is exactly `81:8-22`; Case 2 is
exactly `86:1-12`. There are zero new false negatives and no surah-only or
off-by-one credit.

## 11. Adversarial evaluation

New adversarial rejection count is **2/2**. Neither same-surah construction is
accepted as one continuous canonical passage. There are zero new false
positives.

## 12. Canonical completeness

Case 1 expands to ayat 8 through 22 exactly once in order. Case 2 expands to
ayat 1 through 12 exactly once in order. Both expansions equal their forced
alignment ayah counts; no weak interior window removes an ayah. **PASS**.

## 13. H regression

H remains exact `91:1-15`. **PASS**.

## 14. K regression

K remains exact `92:1-14`, without adding 92:15. **PASS**.

## 15. Positive B regression

The frozen combined candidate still extends provisional `101:2-11` to exact
`101:1-11`. **PASS**.

## 16. Negative A regression

Negative A remains rejected with both `reset-or-revisit-run` and
`repeated-covered-quran-run`. **PASS**.

## 17. Historical regression

Historical genuine behavior remains **20/20 exact** and historical adversarial
behavior remains **23/23 rejected**. Existing progression, reset, repetition,
short-gate, reconstruction, integrity, local-core, and boundary behavior is
unchanged.

The baseline was 541/541 tests. Final verification is 545/545 tests after four
focused validation tests, with FFmpeg assets, Quran-ID schema, strict
TypeScript, quiet lint, production build, all retained evaluators, and all
corresponding privacy validators passing.

## 18. Runtime observations

Across four runs, the harness executed 74 FastConformer passes: 69 local
recognition windows, two accepted-case whole-recording passes, and three
bounded adjacent-edge passes. It performed 148 coarse/fine boundary-search
evaluations. Total measured runtime was 760,398 ms (about 12m40s), including
96,461 ms of whole-recording inference and 4,417 ms of edge inference.

Boundary-search dynamic-programming time was not separately instrumented; it
is included in post-inference total time. Within each case, canonical PCM and
one loaded model session were reused. For accepted cases, the one
whole-recording logits tensor was reused for both locators, whole-core proof,
and final forced alignment. Negative cases stopped before unnecessary boundary
work. These are validation-harness costs, not an optimized browser estimate.

## 19. Privacy

Committed fixtures contain only aggregate windows, canonical coordinate
ranges, relative boundary durations, likelihoods, coverage, decisions, counts,
and runtimes. They contain no audio, video, PCM, transcript, Quran text,
private path, filename, hash, device data, or user metadata. The dedicated
privacy validator passes all four fixtures.

## 20. Limitations

The external set is intentionally only four cases. Case 1's independent local
evidence already included its exact first ayah, so it validated start-boundary
non-overextension rather than empirically requiring recovery of a missing
first-core ayah. The positive sources are public per-ayah studio files joined
in canonical order, not single continuous live takes. Boundary-localization
CPU time is not isolated from other deterministic post-inference work.

Production-freeze diffs from `main` are empty under `src/lib/recognition`,
`src/lib/media`, `src/app/create`, and `public`. Production recognition and
media behavior were not modified.

## 21. Final frozen validation decision

**FINAL FROZEN VALIDATION PASSED**

Both genuine cases are exact, both adversaries reject, H/K/Positive B/Negative
A retain required behavior, historical aggregates are unchanged, completeness
passes, constants stayed frozen, and four captures were used.

## 22. Production implementation decision

**PRODUCTION IMPLEMENTATION JUSTIFIED: YES**

This conclusion authorizes no production modification in this milestone.

## 23. Exact next action

Open a separate production implementation milestone that ports the already
frozen complete-range architecture into the production recognition path,
preserving these constants and fixtures as acceptance regressions.

# Candidate-independent Quran core-boundary localization (offline investigation)

**Conclusion: CANDIDATE JUSTIFIED FOR ONE FINAL FROZEN VALIDATION.** The
candidate-independent locator recovers H's genuinely present previous ayah,
rejects J's absent next ayah, and then recovers held-out Positive B exactly as
`101:1-11` without post-holdout tuning. Historical genuine recognition remains
20/20 exact, all 23 historical adversaries reject, Negative A retains both
integrity vetoes, K remains `92:1-14`, and canonical completeness passes.
Production behavior is unchanged.

Commands:

```sh
npm run calibration:core-boundary:evaluate
npm run calibration:core-boundary:privacy
```

## 1. Exact previous blocker

The prior H experiment used known audio `91:1-15` with test core `91:2-15`.
Core-only forced alignment placed ayah 2 only 176 ms after media start and left
80 ms voiced for ayah 1. The adjacent-ayah verifier correctly abstained: no
eight-token ayah-1 target can be proved in that region. This was a core-boundary
localization failure, not evidence that ayah 1 was absent.

## 2. Why fixed core alignment consumes adjacent speech

`viterbiCtcPath` expands the target to `blank, token, blank, ...`. At frame 0
only state 0 (blank) and state 1 (the first target token) are initialized.
Every later state must come from stay, one-state advance, or a legal two-state
CTC skip. The terminal state must be the final target label or final blank.

Consequently there is no free prefix state and no transition that ignores
arbitrary leading nonblank audio. Leading frames may remain only by emitting
the target trellis's initial blank or first token. When audio contains 91:1 but
the forced target begins at 91:2, the complete-path requirement can assign
91:1 frames to those early states and advance ayah 2 too soon. The path score
is divided by frame count only after Viterbi chooses this path; normalization
does not independently choose the onset. `forceAlignCtc` then defines the
first canonical onset as the minimum frame assigned to any non-repeated
canonical token. The behavior follows directly from the state initialization,
transition loop, terminal-state choice, and onset extraction in
`src/lib/recognition/ctc-forced-alignment.ts`.

## 3. Candidate-independent boundary concept

The offline locator reuses one whole-recording FastConformer logits tensor. For
each proposed cut, frames before a start cut or after an end cut are sliced out
before scoring. They need not resemble CTC blank and may contain an adjacent
ayah. Each candidate aligns the same complete three-ayah core-edge target in
the same 12-second acoustic duration. A candidate is valid only when the target
alignment completes, covers every token, and places its edge token within 200
ms of the proposed cut. The strongest normalized forward-CTC likelihood wins;
ties choose the earlier cut deterministically.

The whole known core must subsequently align completely between applicable
selected boundaries. A searched boundary is applied only when an immediately
adjacent canonical ayah exists. At ayah 1 or the final ayah of a surah there is
no extension hypothesis, so the established outer boundary is preserved.

## 4. Search bounds and temporal resolution

The start search begins at the first VAD speech onset and spans at most 6,000
ms. The end search terminates at the last VAD speech end and spans the preceding
6,000 ms. This is the overlap/hop geometry of the existing 12-second local
recognition windows, not a recording-wide arbitrary scan.

Coarse candidates use 200 ms steps. The best valid coarse location is refined
within plus/minus 200 ms at 40 ms steps. A normal edge evaluates 31 coarse and
8 new fine candidates. Equal 12-second candidate durations prevent a shorter
slice from winning merely because summed log probabilities are less negative.

## 5. Exact score and completeness

For target token sequence `y`, candidate logits `x[t:t+12s]` (or the symmetric
end interval), and `F` acoustic frames, the comparison score is:

`ctcForwardScore(x, y, blankId) / F`

This is the existing sum-over-paths CTC convention, normalized by the same
frame count for every candidate offset. It is not a weighted composite.
Forced alignment is used only to require full ordered target coverage and edge
proximity; a single strong token or partial suffix cannot qualify. After both
applicable cuts, all tokens of the complete known core must align in canonical
order. The adjacent verifier remains unchanged and still requires 320 ms
voiced audio, 100% candidate coverage, a strict likelihood win over the real
all-blank no-extension path, no core overlap/theft, and no basmalah-only result.

## 6. Start and end locators

The start locator scores the first three ayat of the known core in windows that
begin at each proposed onset. The end locator symmetrically scores the final
three core ayat in windows ending at each proposed core end. Audio outside the
cut never contributes to that candidate's core score. Synthetic tests cover
arbitrary leading speech, non-first-voiced onset, candidate comparison,
equal-duration normalization, partial-target loss, start/end symmetry,
canonical-edge applicability, and determinism.

## 7. Design cases and freeze

H (`91:1-15`, test core `91:2-15`) and J (`90:1-12`, candidate 90:13) were the
only empirical design cases. An initial H run exposed that two suffix ayat in a
6-second window were locally ambiguous. Before J and without inspecting
Positive B, the symmetric rule was corrected to three ayat in the existing
12-second window. J then rejected and a final H confirmation recovered. The
complete locator and unchanged edge verifier were frozen before Positive B.

Four actual capture runs were used: the initial H design exposure, J, final H
confirmation, and held-out Positive B. Three privacy-safe result fixtures are
retained. No optional new design case and no additional capture were used.

## 8. H result

The previous milestone's old inferred onset was 176 ms (80 ms voiced left).
Replaying the old forced-target rule against the new shared whole-recording
logits put it at 96 ms, confirming the same early-start failure. The frozen
locator selected 1,816 ms:

| Measure | H result |
| --- | ---: |
| Audio before selected onset | 1,816 ms |
| Voiced audio before selected onset | 1,720 ms |
| Ayah-1 normalized likelihood | -6.915958 |
| No-extension likelihood | -9.698248 |
| Relative evidence | +2.782290 |
| Target coverage | 8/8 (100%) |
| Whole-core coverage | 137/137 (100%) |
| Edge decision | extend start |
| Final range | `91:1-15` |

The start region is disjoint from the selected core and ayah 1 is now directly
acoustically recoverable.

## 9. J exact-stop result

The frozen end locator selected 50,872 ms. Only 264 ms remained, of which 200
ms was voiced—below the unchanged 320 ms edge minimum. The six-token 90:13
target aligned 0/6, no candidate likelihood was available, and the real blank
path scored -0.078268 per frame. The verifier rejected for insufficient voiced
audio, incomplete alignment/coverage, and failure to beat no extension. Final:
`90:1-12`; 90:13 was not added.

J's diagnostic start search is intentionally non-authoritative because its
core already begins at canonical ayah 1, where no previous-ayah hypothesis
exists. The tooling now codifies this canonical-edge applicability rule.

## 10. Positive B exclusion and post-freeze result

The evaluator loads the historical/design directories and exact H/J boundary
fixtures before it loads either canonical-validation data or the Positive B
boundary fixture. Frozen objects contain no reader, surah, or 101-specific
field. Tests assert the explicit exclusion and byte-identical deterministic
evaluation.

Only after the design pair passed was Maher Al-Muaiqly evaluated. Its
provisional core remained `101:2-11`, with whole-recording integrity PASS.

| Measure | Positive B result |
| --- | ---: |
| Selected core onset | 1,112 ms |
| Boundary duration | 1,112 ms |
| Boundary voiced duration | 920 ms |
| Ayah-1 normalized likelihood | -4.704490 |
| No-extension likelihood | -7.092373 |
| Relative evidence | +2.387883 |
| Target coverage | 4/4 (100%) |
| Whole-core coverage | 94/94 (100%) |
| Alignment completeness | complete |
| Edge decision | extend start |
| Final range | `101:1-11` |

No threshold or rule changed after this result.

## 11. Regressions and canonical completeness

Negative A (`100:1-11` then `100:1-5`) still rejects with the unchanged
`reset-or-revisit-run` and `repeated-covered-quran-run` vetoes. Historical H
remains `91:1-15`; K remains `92:1-14` and is not overextended. Historical
genuine cases remain 20/20 exact and historical adversaries remain 23/23
rejected. Every accepted inclusive range expands to every canonical ayah once,
in order; canonical completeness passes.

## 12. Browser cost, privacy, and production freeze

Each applicable edge evaluates 39 small CTC dynamic programs over slices of
already-produced logits. The intended production architecture reuses PCM, VAD,
the loaded model, and the full known-core inference that final forced alignment
already needs; the selected logits are reused again for whole-core validation.
Only an accepted edge requires one additional bounded FastConformer inference
for the unchanged adjacent-ayah competition. There is no additional Quran-wide
search. Measured cold/local harness totals were 84.6 s (H), 78.9 s (J), and
61.6 s (Positive B); the bounded edge inferences themselves were 1.9 s, 0.9 s,
and 1.4 s.

Fixtures retain only relative acoustic facts, scores, counts, decisions, and
aggregate runtime. They retain no media, PCM, transcript, Quran text, filename,
path, hash, device, or user data. Production recognition, media preparation,
create routes, and public assets have no milestone diff.

## 13. Limitations and next action

The empirical design set remains only one start-positive and one end-negative.
The three-ayah/12-second boundary target is deterministic and architecture-
derived but has not been externally challenged across reciters, passage
lengths, non-terminal end extensions, or slower long-ayah boundaries. The
capture harness currently performs a dedicated whole-recording inference;
production feasibility assumes exposing and reusing the equivalent known-core
logits rather than duplicating that inference. No production integration is
justified yet.

The exact next action is one separate frozen validation milestone with new
predesignated start/end positives and negatives. Do not modify production until
that validation passes without retuning.


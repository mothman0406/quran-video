# Canonical passage reconstruction validation (frozen external validation)

**Conclusion: EXTERNAL VALIDATION FAILED.** Positive B did not reconstruct its
exact known range, and Negative A was reconstructed as a valid continuous
passage. The candidate was not retuned or patched. Production implementation
is not justified.

Commands:

```sh
npm run calibration:canonical-reconstruction:validation:capture -- <ignored-debug-log> <designated-id>
npm run calibration:canonical-reconstruction:validation:evaluate
npm run calibration:canonical-reconstruction:validation:privacy
```

## 1. Starting revision and frozen rule

The starting revision was
`40e27ef8d0d3462dc6155fd6ba41b818a39d68f5`, the merge commit containing
`d9333766`. The branch was `validate/canonical-passage-reconstruction` and the
worktree was clean.

The validation imports the committed `FROZEN_CANONICAL_RECONSTRUCTION_RULE` by
object identity. Tests prove that it is frozen, mutation throws, and its exact
values are:

| Condition | Frozen value |
| --- | ---: |
| Minimum supporting windows | 3 |
| Minimum dominant-surah fraction | `.75` |
| Minimum continuous-run fraction | `.75` |
| Backward canonical-word tolerance | 2 |
| Maximum skipped canonical words | 6 |
| Maximum consecutive no-progress windows | 1 |

No validation fixture supplies, derives, or overrides a parameter.

## 2. Sequencing proof and four designations

At `2026-09-23T21:47:04Z`, before any validation source was fetched or
recognized, the starting revision, frozen-rule identity, six literal values,
historical corpus digest, and exactly four case designations were written to
`canonical-passage-reconstruction-validation.ts`, its focused test, and this
document. The freeze test passed before source preparation. The historical
fixture digest was
`f1fe29ee3bca705c858ee1d767a163fba1b7c64bb10fe5b9766e22c291585b6d`.

| Role | Public reader | Exact source/construction | Predesignated challenge |
| --- | --- | --- | --- |
| Positive A | Abdullah Basfar | `100:1-11` | Weak start acquisition across the short opening oath sequence |
| Positive B | Maher Al-Muaiqly | `101:1-11` | Repeated opening wording and exact terminal edge without over-extension |
| Negative A | Abdullah Basfar | `100:1-11, 100:1-5` | Same-surah complete progress followed by a short reset and repeat |
| Negative B | Maher Al-Muaiqly | `101:6-11, 101:1-5, 101:6-8` | Same-surah out-of-order reset followed by a partial revisit after progress |

All four remained fixed. Each was captured once through the ordinary
`/create?debugMedia=1` browser flow. There were no preliminary recognition
runs, replacements, drops, or recaptures. Each retained run records one
canonical PCM preparation and one top-level FastConformer decision.

## 3. Source and ground-truth methodology

The source was public EveryAyah per-ayah audio from two reader directories not
used in the reconstruction design corpus: `Abdullah_Basfar_192kbps` and
`MaherAlMuaiqly128kbps`. Each filename's six-digit surah/ayah key supplied
ground truth independently of recognition. Files were concatenated in the
predesignated order by packet copy, with no inserted silence and no
recognition-derived selection. Audio, PCM, raw logs, source filenames, paths,
hashes, and transcripts remain ignored and uncommitted.

## 4. Positive results

| Evidence | Positive A | Positive B |
| --- | --- | --- |
| Reader / expected | Abdullah Basfar, `100:1-11` | Maher Al-Muaiqly, `101:1-11` |
| Generated windows | 10 | 5 |
| Local winners | `1-3, 2-4, 4-5, 5-6, 7-8, 7-8, 9, 9-10, 10-11, 11` | `2-4, 4-6, 5-7, 7-9, 9-11` |
| Coherent path | `1-3, 2-4, 4-5, 5-6, 6-7, 7-8, 8-9, 9-10, 10-11, 11` | null in all 5 windows |
| Local implied | `100:1-11` | `101:2-11` |
| Production FastConformer | proposed `100:1-11`, abstained | no proposed range, abstained |
| Reconstructed | `100:1-11` | none |
| Dominant / continuous support | `1 / 1` | `1 / 0` |
| Start / end support | `1 / 2` | unavailable |
| Reset / revisit / no-progress | `0 / 1 / 1` | `0 / 0 / 0` in the unavailable-coordinate diagnostic |
| Exact result | **PASS** | **FAIL** |

Positive B is a defensible genuine positive with independent exact truth, so
its failure alone requires external-validation failure. Every local winner was
in Surah 101, but the first supported local edge was ayah 2 and the coherent
path was null in every window. The retained trajectory therefore had no
coherent-origin relative word coordinates from which the frozen reconstruction
could build a continuous run. Whisper later accepted `101:1-11`, but Whisper
is not reconstruction evidence and cannot repair this candidate result.

## 5. Negative results

| Evidence | Negative A | Negative B |
| --- | --- | --- |
| Construction | `100:1-11, 100:1-5` | `101:6-11, 101:1-5, 101:6-8` |
| Generated windows | 13 | 7 |
| Local implied | `100:1-11` | `101:1-11` |
| Production FastConformer | proposed `100:1-11`, abstained | no proposed range, abstained |
| Reconstructed | **`100:1-11`** | none |
| Dominant / continuous support | `1 / .769231` | `1 / 0` |
| Start / end support | `1 / 2` | unavailable |
| Reset / revisit / no-progress | `1 / 4 / 4` | unavailable relative-coordinate diagnostics |
| Result | **FAIL: false continuous passage** | **PASS: rejected** |
| Exact reason | The initial 10-window run owns `10/13 = .769231`, above the frozen `.75` threshold, despite the real reset and repeated tail | `no-dominant-continuous-run`; all coherent candidates were null, so the retained adapter supplied no local relative coordinates |

Negative A is a defensible same-surah reset adversary and was accepted as one
continuous canonical passage. That independently requires external-validation
failure. No condition was added after observing it.

## 6. Canonical completeness

The only accepted positive, Positive A, expands offline to exactly the eleven
keys `100:1` through `100:11`, in order, once each. No interior ayah is omitted
or duplicated. Positive B was not accepted and therefore has no range to
expand. Canonical completeness passes for every accepted positive but does not
rescue exact-positive failure.

## 7. Historical regression

The historical fixture digest is byte-for-byte unchanged. The unchanged
offline reconstruction corpus still reports:

- genuine exact reconstruction: **20/20**;
- genuine surah correctness: **20/20**;
- adversarial rejection: **23/23**, zero false continuous passages;
- H: local `91:1-15`, coherent `91:8-15`, reconstructed **`91:1-15`**;
- K: expected `92:1-14`, production proposal through `92:15`, reconstructed
  **`92:1-14`**.

The progression external evaluator and its adversaries remain a required final
regression. The new validation fixtures have distinct provenance and are read
only by the new frozen evaluator; no historical calibration reads them.

## 8. Privacy and production freeze

The privacy scan passes for all four fixtures. They contain relative
coordinates and recognition metadata only, with no media, transcript, Quran
text, filename, path, hash, device data, or absolute canonical word index.

Production recognition, Whisper, FastConformer, VAD, forced alignment, media
handling, candidate retrieval, continuation, captions, create routes, and
public assets were untouched. Diffs from `main` under `src/lib/recognition`,
`src/lib/media`, `src/app/create`, and `public` are empty.

## 9. Limitations

- Four captures across two new public readers are deliberately small and
  targeted rather than representative of all readers and surahs.
- Per-ayah packet-copy constructions have deterministic verse truth but are
  not identical to a naturally continuous studio recording.
- The retained trajectory's relative coordinate origin depends on a non-null
  coherent candidate. Positive B exposes that all-null coherent paths cannot
  currently express otherwise correct-surah local progression to the frozen
  offline reconstruction candidate.
- Negative A exposes a distinct rule failure: a short reset after a long valid
  prefix can leave the first run just above `.75`.

## 10. Conclusion and next action

**EXTERNAL VALIDATION FAILED.** New false negatives: 1 (Positive B). New false
positives: 1 (Negative A). Production implementation justified: **NO**.

The single next action is to stop this candidate and open a separate
investigation milestone, if authorized, using these frozen failures as held-out
evidence. Do not implement or revise canonical reconstruction in production.

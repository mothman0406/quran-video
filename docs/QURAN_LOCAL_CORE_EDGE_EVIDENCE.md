# Quran local-only core and boundary evidence (offline investigation)

**Conclusion: NO CANDIDATE.** A safe provisional local-only core closes the
all-null coordinate-origin gap and exposes Positive B as `101:2-11` without
accepting it. Real browser-local boundary evidence was captured, but the
design edge-positive and edge-negative both abstain: core-only forced
alignment consumes the adjacent boundary before it can be scored as disjoint
audio. The design pair therefore cannot freeze a useful YES/NO edge rule.
Positive B was not recaptured or used to retune. Production is unchanged.

Commands:

```sh
npm run calibration:local-core-edge:evaluate
npm run calibration:local-core-edge:privacy
```

## 1. Previous blocker and why Positive B was unevaluable

Positive B expects `101:1-11`. Its chronological local winners are `101:2-4,
101:4-6, 101:5-7, 101:7-9, 101:9-11`, while every coherent-path candidate is
null. The retained trajectory adapter defines local relative word coordinates
from the minimum coherent-candidate word index. With no coherent candidate,
the coordinate origin is null; all five local relative start/end coordinates
are null. `reconstructCanonicalPassage` consequently filters every local
winner before run selection. The exact prior blocker is therefore a missing
coordinate-origin prerequisite in core selection, not CTC acceptance gating,
edge support, or a failed local chronological sequence.

The previous fixture also retained no boundary PCM region, VAD duration,
canonical edge target coverage, adjacent-candidate likelihood, or real
no-extension likelihood. Forced-alignment completion alone could not establish
that ayah 1 was acoustically present.

## 2. Provisional local core definition and safety role

`ProvisionalLocalCore` is built only from generated-window order and each
independent local winner's surah and inclusive ayah start/end. CTC, coverage,
origin, voiced duration, and relative word coordinates may be retained as
diagnostics but do not create missing ayat. The result records the exact
supporting windows, supported inclusive range, reset/revisit/no-progress
metrics, overlap, skips, and edge support.

It is not passage acceptance. The evaluator permits it to feed only
whole-recording integrity and bounded adjacent-edge verification. Historical
final acceptance still requires the canonical reconstructor. Positive B's
provisional `101:2-11` therefore remains final `none` without a validated edge
decision.

## 3. Frozen local-core algorithm

The reader- and surah-agnostic rule was frozen from historical/design-visible
fixtures before the external validation directory was loaded:

1. At least three local-winner windows and at least 3/4 of all generated
   windows must select one dominant surah.
2. At least 3/4 of all generated windows must belong to one chronological run.
3. Within a run, start and end ayah coordinates may overlap or move forward,
   at most one ayah may be skipped, and at most one consecutive no-progress
   window is tolerated.
4. A backward start/end movement, larger skip, or longer plateau splits the
   run. The selected run exposes only its observed minimum start and maximum
   end; it never adds an edge ayah.

The constants use integers/rational comparisons rather than tuned decimals and
are `Object.freeze`d. No reader, reciter, surah, or Positive B value occurs in
the rule.

## 4. Local-core design and historical evidence

Across 43 historical fixtures, a provisional local core exists for 12/20
genuine recordings and 0/23 adversaries. The genuine cores include short and
long passages: `69:19-22`, `89:1-14`, `90:1-12`, H `91:1-15`, K `92:1-14`,
`55:1-25`, `77:1-28`, and `78:1-16`. One deliberately incomplete local view,
Al-Muddaththir, exposes only `74:1-8` while the canonical reconstructor remains
authoritative at `74:1-9`; this proves the provisional range does not invent a
missing edge or replace accepted reconstruction.

All historical adversaries reject local-core exposure, including repeated 50,
repeated 93, repeated 6:77, 78 x2, 54 x3, 77 partial reset, 77
repeat-after-progress, 55 out-of-order, backward cases, cross-surah mixtures,
and mixed non-contiguous Quran. Contract tests additionally show that a long
valid prefix may expose a provisional sub-run, but two subsequent reset/repeat
windows are still rejected by unchanged whole-recording integrity. That
internal sub-run is not a whole-recording acceptance.

## 5. Boundary acoustic primitive

The capture harness is tooling-only and browser-local. It reuses canonical
16 kHz mono PCM decoded in the browser, Silero VAD, the pinned Tilawa
FastConformer ONNX model, canonical token construction, exact forward CTC,
and deterministic CTC forced alignment. It performs no whole-Quran search,
Whisper call, server inference, Python runtime, native inference, embedding,
or LLM operation. No production recognition decision is modified.

For a start core beginning at ayah N, the intended region is
`[max(0, onset(N)-12000ms), onset(N))`. For an end core ending at N, it is
`[end(N), min(audioDuration, end(N)+12000ms))`. VAD voiced duration is the
intersection of retained VAD regions with that half-open interval. Ordering
requires the region to remain wholly outside the core, and any overlap is a
core-audio theft veto.

In this harness the onset/end comes from aligning the known core alone. The
design result exposed the remaining flaw: fixed-target core alignment can
consume a present adjacent ayah as blanks and place the first core token near
the recording start. It then leaves no adequate disjoint region for the
candidate. This is a localization failure, not permission to score overlapping
audio.

## 6. Competing hypotheses

The extension hypothesis is the exact immediately adjacent canonical ayah's
sum-over-paths forward-CTC log likelihood on the bounded frames, normalized by
the same frame count. Its forced path must complete and cover every canonical
target token in order.

The no-extension hypothesis is real, not fabricated: every bounded-region
frame emits the model's CTC blank token. Its log posterior is summed across
the same frames and normalized by frame count. Extension requires a strict
candidate win, at least 320 ms VAD speech, complete target coverage, valid
outside-core ordering, no core overlap, and no basmalah-only explanation.
Maximum expansion remains one ayah at the start and one at the end, without
recursion.

## 7. Privacy-safe fixture schema

Committed fixtures retain only role/expected polarity, edge and core range,
candidate ayah, relative boundary start/end and duration, VAD voiced duration,
target/aligned token counts and coverage, candidate and blank likelihoods,
difference, alignment completion, ordering, overlap/core theft,
basmalah-only status, decision/reasons, and aggregate runtime. They contain no
audio, PCM, transcript, Quran text, source filename/path, media hash, absolute
word index, device information, or user metadata.

## 8. Predesignated captures and results

All roles were designated before result inspection:

- Design edge-positive: reader H, known `91:1-15`, provisional test core
  `91:2-15`, candidate `91:1` at the start.
- Design edge-negative: reader J, exact known `90:1-12`, candidate `90:13`
  after the end.
- Optional local-core capture: skipped because retained fixtures sufficed.
- Held-out Positive B: Maher Al-Muaiqly `101:1-11`, eligible only if the design
  pair justified a frozen distinction.

Three media recognition/capture runs occurred. The first H run completed but
its aggregate result was lost when the new fixture directory did not yet
exist; it counts against the cap. The retained H recapture and J capture are
runs two and three. No fourth run was made.

The design edge-positive result is **NO**. Core-only localization put the
start of ayah 2 only 176 ms from audio start, leaving `[-176,0)` relative to
the core onset and only 80 ms voiced. The eight-token ayah-1 target aligned
0/8 tokens; candidate likelihood is unavailable, blank/no-extension is
`-1.855249` per frame, and no extension occurs.

The design edge-negative result is correctly **NO**. Its post-core region is
`[0,64)` relative to the core end with 0 ms voiced. The six-token ayah-13
target aligns 0/6; candidate likelihood is unavailable, blank/no-extension is
`-0.020661` per frame, and no extension occurs.

Because both roles abstain, they do not justify a robust acoustic distinction.
The rule was not weakened and no likelihood margin was tuned.

## 9. Frozen conditions and Positive B exclusion

Local-core constants are declared before any external fixture load. The
evaluator first loads the three historical/design directories and both
boundary design fixtures, then loads the external canonical-validation
directory. Tests assert the explicit exclusions
`canonical-validation-positive-reader-m-101-1-11` and
`canonical-validation-negative-reader-l-100-reset`, frozen objects,
deterministic byte-identical evaluation, and absence of reader/surah fields.

Positive B is evaluated post-freeze only from its previously retained local
trajectory: provisional core `101:2-11`, supporting windows 0-4, and integrity
PASS with no outside-core evidence. Per the precommitted rule, the failed
design distinction makes a held-out acoustic recapture ineligible. Its
candidate score, no-extension score, comparison, and edge decision are
therefore unavailable/not run—not guessed from prior alignment. Final combined
range is `none`, not `101:1-11`.

## 10. Regressions and completeness

Negative A remains rejected. Its initial core is `100:1-11`; outside windows
10-12 contain repeated/reset Surah-100 evidence. The exact unchanged vetoes
are `reset-or-revisit-run` and `repeated-covered-quran-run`.

H remains exactly `91:1-15`. K remains exactly `92:1-14`; no missing boundary
evidence can re-add ayah 15. Historical combined results remain 20/20 genuine
exact and 23/23 adversaries rejected, with zero false positives and zero
historical false negatives. Every accepted inclusive range expands to each
ayah in order exactly once; canonical completeness passes.

## 11. Runtime, privacy, and production freeze

The retained browser runs took about 149 seconds (design positive) and 115
seconds (design negative) on the cold/local browser path. Local-core and
integrity evaluation are linear in the small window list. A future usable edge
verification would add one bounded inference per tested edge and no Quran-wide
search.

Privacy validation passes for both fixtures. Media and PCM remain ignored and
uncommitted. Production recognition, media handling, create routes, and public
assets have no milestone diff. The existing basmalah-prelude contract is
preserved; optional basmalah-only evidence is an explicit edge veto.

## 12. Limitations, decision, and exact next action

The provisional local core is supported but remains offline and intentionally
non-authoritative. The edge capture corpus has only one positive and one
negative design recording. More importantly, its current core-only boundary
localizer cannot isolate a present previous ayah without allowing the core
alignment to consume it. Reusing the expected full range to choose the cut
would be circular for held-out evaluation, while allowing overlap would steal
audio required by the core.

Candidate justified for one final frozen external validation: **NO**.
Production implementation justified: **NO**.

The single next action is a separate predesignated investigation of a
candidate-independent core-onset locator (for example, a core-token onset
posterior constrained by VAD that cannot consume preceding speech), validated
on new design edge-positive and exact-stop cases before any Positive B run.


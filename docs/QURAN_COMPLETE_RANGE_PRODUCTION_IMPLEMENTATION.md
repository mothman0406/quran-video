# Quran complete-range production implementation

## 1. Frozen validation basis

This milestone ports the candidate frozen at `ee967a6` into the browser-local
recognition flow used by `/create` and the advanced editor. No frozen threshold
or fixture changed. The acceptance basis remains H `91:1-15`, K `92:1-14`,
Positive B `101:1-11`, Negative A rejected, final-validation positives
`81:8-22` and `86:1-12`, final-validation adversaries rejected, historical
genuine 20/20 exact, and historical adversarial 23/23 rejected.

## 2. Production architecture

The worker now owns the complete sequence:

`canonical PCM -> VAD -> one Quran-wide FastConformer identification -> canonical/provisional core -> whole-recording integrity -> independent core boundaries -> at most one adjacent ayah per edge -> exact inclusive range -> complete canonical target -> forced alignment -> CaptionSegment timing`

The quick-create job and editor both call the same retained worker operation.
No server inference, new model, model asset, media path, or UI redesign was
introduced.

## 3. Modules promoted and shared

The frozen canonical reconstruction, provisional local core, whole-recording
integrity, core-boundary locator, and bounded edge completion modules now live
under `src/lib/recognition`. Offline tooling retains its historical import
paths through direct re-exports, so the evaluator and production use identical
function objects rather than duplicated implementations. Shared boundary
acoustics contain the blank likelihood, voiced-duration, and bounded-region
helpers. `quran-complete-range.ts` supplies production types, evidence
adaptation, core selection, exact-range expansion, and canonical-span
construction.

## 4. Orchestration changes

After `identify`, the worker retains the identification result and receives one
`complete-range` command. It does not rerun global retrieval. A defensible core
continues through integrity, boundary, edge, completeness, and alignment in
the worker. A missing core preserves the prior Whisper fallback. An integrity
veto or failed boundary/completeness proof abstains and cannot be overridden by
Whisper. Development comparison may still execute Whisper, but its output does
not become timing or override a valid FastConformer result.

## 5. Canonical core behavior

Canonical reconstruction remains preferred and uses the exact frozen rules.
Production evidence is adapted directly from the retained independent window
winners, winning coherent path, and continuation events. No local window is
rerun and no new Quran-wide search is performed.

## 6. Provisional core behavior

When canonical reconstruction is unavailable, the frozen local-only rule may
expose a provisional core, including the all-null coherent-path case. The
provisional core cannot become a final range by itself. It must pass the same
integrity, independent boundary, whole-core completeness, bounded edge, and
final forced-alignment stages.

## 7. Whole-recording integrity

All retained local evidence outside the chosen supporting windows is audited.
Two-window reset/revisit, repeated-covered, incompatible forward, and
same-surah or cross-surah contradiction runs retain their frozen vetoes.
Null/weak windows remain transparent. Integrity rejection terminates the
continuous-passage interpretation before boundary inference.

## 8. Boundary localization

Accepted cores receive the frozen 6-second search and 12-second equal-duration
candidate evaluation with 200 ms coarse and 40 ms fine steps, three-ayah
targets, complete target coverage, and 200 ms edge-token tolerance. Only
applicable non-canonical-surah edges are searched. One full-recording logits
tensor is sliced for both locators and the whole-core proof.

## 9. Edge verification

Only the immediately previous and immediately next ayah can be tested, once
per edge. Each bounded inference reuses the same PCM, VAD regions, model
session, canonical assets, and core boundaries. Extension still requires at
least 320 ms voiced audio, complete ordered target coverage, a strict win over
the real blank hypothesis, no core overlap, and no basmalah-only explanation.

## 10. Canonical completeness

`versesForExactRange` expands every ayah in the accepted inclusive range once
and in order. Missing ASR evidence cannot remove an interior ayah. Empty or
partial corpus expansion is rejected before timing.

## 11. Forced-alignment integration

The final complete canonical target is forced-aligned from a slice of the
already-produced full-recording logits. Boundary localization chooses identity
range boundaries only; it does not generate display timing. The final interval
uses the localized core edge unless a verified adjacent ayah or canonical
surah edge requires the outer VAD boundary. Optional basmalah alignment retains
the existing explicit prelude selection and never owns a canonical verse key.

## 12. Abstention behavior

A no-core result may preserve the existing recoverable Whisper path only when
the shared rules found insufficient or absent local evidence. Surah
inconsistency or failure to form a dominant continuous/forward run is not
eligible for Whisper override and goes to correction. Integrity veto,
incomplete localized core, invalid exact range, or incomplete final alignment
also produces no automatic captions. The implementation never invents an ayah
to make a run succeed.

## 13. Performance and reuse

The worker retains one canonical 16 kHz mono PCM, one VAD result, one cached
FastConformer session, and the identification result. Accepted cases add one
full-recording inference whose logits are reused for both locators, whole-core
proof, and final alignment. Edge work is capped at two bounded inferences.
The previous diagnostic Tilawa whole-Quran oracle was removed from alignment,
leaving exactly one global Quran search per request. Caches remain in-memory
and request/session-local; no permanent server storage was added.

## 14. Acceptance regressions

Offline evaluators import the promoted production decisions directly. A
focused production suite covers canonical and provisional core selection,
integrity rejection, missing-start completion, false-extension rejection,
inclusive canonical expansion, deterministic results, retained worker reuse,
one global search, and final forced-alignment target construction. The frozen
complete-range evaluator continues to enforce all named exact/rejection and
historical aggregates without fixture weakening.

Final automated verification passed with 553/553 tests, strict TypeScript,
quiet lint, the production build, FFmpeg/VAD asset checks, Quran-ID schema,
all retained calibration/evaluation commands, every corresponding privacy
validator, and `git diff --check`. The build retained the existing
ONNX Runtime and Transformers webpack warnings only.

## 15. Manual browser QA still required

The automated environment verifies compilation, orchestration, fixtures, and
the production build. A real `/create` run must still confirm browser model
execution, detected range presentation, complete captions, editor loading,
playback synchronization, and absence of fatal console errors.

## 16. Limitations

The external final-validation corpus remains four recordings and uses public
per-ayah studio audio. Production tests mock or inspect expensive inference;
the committed real-audio evidence remains the offline acceptance source.
Boundary localization CPU time is not independently surfaced in the UI.

## 17. Exact next step

Run one manual browser-local `/create` smoke test with an already-available
known recording and record the detected exact range, caption completeness,
editor playback synchronization, and console result.

# Recognition and caption timing regression invariants

Future recognition and timing work must preserve these behaviors unless a
separate approved milestone intentionally changes the display contract.

- The first caption begins only when Quran recitation begins, never during
  earlier background audio.
- Automatic display uses one complete canonical ayah per caption set.
- Every displayed ayah is complete: no first, internal, or final canonical
  word may be omitted because ASR missed it.
- Passage identification uses the whole-recording Whisper transcript and does
  not depend on timestamp quality.
- VAD stays enabled and constrains acoustic timing work.
- Timeline and preview use the same editable `CaptionSegment` interval.
- There is exactly one authoritative automatic `CaptionSegment` timing array:
  `resolveGlobalAyahBoundaries` / `resolveVerseBoundaries` produces the generated ayah boundaries and caption
  generation consumes them once. Recognition, forced-alignment, display-set,
  and CTC timing are evidence or diagnostics only. Structural validity proves
  only that a CTC path is internally well-formed; it does not prove acoustic
  accuracy or authorize a hard timing corridor.
- Manual timeline edits remain authoritative over generated timing.
- The final caption remains through actual recitation completion.
- For any proposed CTC timing, each non-final ayah ends exactly at the next
  ayah's start; no automatic gap or overlap is allowed after Quran onset.
- A pause may refine a known canonical word boundary only. It never determines
  Quran identity and cannot introduce an intra-ayah caption split.
- Forced-alignment output is deterministic for equal audio, canonical target,
  model/version, and settings. Ties prefer stay, then one-state advance, then
  blank-skipping advance.

In `chunk-fallback`, local ASR is interval-only evidence: a point estimate may
come only from a shared VAD-corroboration predicate applied to the interval
that produced it. No unvalidated model may form a hard corridor that excludes
strong independent lexical/VAD evidence. No ayah boundary is repaired by
adding one millisecond, and unavailable/insufficient evidence uses an explicit,
ordered, contiguous, non-collapsing estimated fallback. In `word` mode CTC
remains diagnostic and cannot alter timestamped sequence alignment.

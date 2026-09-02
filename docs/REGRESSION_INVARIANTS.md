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
- Manual timeline edits remain authoritative over generated timing.
- The final caption remains through actual recitation completion.
- For any proposed CTC timing, each non-final ayah ends exactly at the next
  ayah's start; no automatic gap or overlap is allowed after Quran onset.
- A pause may refine a known canonical word boundary only. It never determines
  Quran identity and cannot introduce an intra-ayah caption split.
- Forced-alignment output is deterministic for equal audio, canonical target,
  model/version, and settings. Ties prefer stay, then one-state advance, then
  blank-skipping advance.

The CTC prototype is shadow-only. Its results may appear in development debug
output but must not replace `CaptionSegment` timing until comparison on real
recordings approves that change.

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
- There is exactly one authoritative automatic `CaptionSegment` timing array.
  A completed, structurally valid Tilawa FastConformer global canonical
  alignment generates it once. Passage identification remains the
  whole-recording Whisper matcher. If FastConformer cannot produce a valid
  result, recognition returns a typed, recoverable `quran-timing` failure and
  generates no automatic captions.
- Manual timeline edits remain authoritative over generated timing.
- The final caption remains through actual recitation completion.
- For a promoted FastConformer timing, each non-final ayah ends exactly at the
  next ayah's start; no automatic gap, overlap, or one-millisecond repair is
  allowed after Quran onset. Optional prelude words never own canonical ayah
  one's start.
- An acoustically selected optional basmalah is an explicit
  `basmalah-prelude` display segment with no canonical verse key. Its interval
  is exactly FastConformer's selected prelude interval; ayah one retains its
  canonical onset, and an absent or already-canonical basmalah creates no
  additional display segment.
- A pause may refine a known canonical word boundary only. It never determines
  Quran identity and cannot introduce an intra-ayah caption split.
- Forced-alignment output is deterministic for equal audio, canonical target,
  model/version, and settings. Ties prefer stay, then one-state advance, then
  blank-skipping advance.

Whisper word and chunk timestamps remain passage-identification evidence only;
they never produce authoritative Quran caption boundaries. VAD constrains the
FastConformer acoustic window and the absolute source offset is applied once.

# Long-ayah display segmentation

Automatic caption timing remains FastConformer-only. Display segmentation is a
separate deterministic step after a complete canonical ayah has already been
word-aligned.

- An ayah at or below `DEFAULT_MAX_ARABIC_VISIBLE_CHARS` (80) remains one
  `CaptionSegment`.
- An oversized ayah is cut only between canonical Quran words. Every word is
  retained once in contiguous order; no text is normalized or reconstructed.
- The planner evaluates all cuts together. It starts from the minimum feasible
  piece count, enforces the visible-character limit except for a single
  oversized word, then scores Quranic waqf quality, balanced size, and tiny
  trailing-piece avoidance deterministically.
- A piece transition is the FastConformer start time of the first word in the
  next piece. Thus intervals are half-open and adjacent without interpolation,
  gaps, overlap, or one-millisecond repair.
- Only an ayah's final display piece carries `showVerseNumberAtEnd: true`.
  Basmalah preludes are never split or numbered.

## Visible-character budget

This is a display-only approximation. It counts base letters, ordinary visible
punctuation, and one space between words. It ignores harakat, all bundled
Quranic annotation marks (`U+06D6`–`U+06ED`), tatweel, zero-width formatting,
the terminal ayah ornament, and Arabic-Indic digits. The stored/rendered
Uthmani Quran text is never changed.

## Bundled Tanzil waqf audit

The verbatim `tanzil-uthmani.txt` corpus attaches stop signs directly to the
preceding word, with no separate boundary token. The stop-related signs found
are: `ۘ` U+06D8 (22), `ۗ` U+06D7 (603), `ۚ` U+06DA (1,972), `ۛ` U+06DB (12),
`ۖ` U+06D6 (1,682), `ۙ` U+06D9 (68), and `ۜ` U+06DC (7). The corpus also has
other `U+06D6`–`U+06ED` Quranic annotations; they are ignored for length and
are not treated as cut cues.

The planner classes are: preferred (`ۘ`, `ۗ`), acceptable (`ۚ`, `ۛ`), weaker
continuation (`ۖ`), ordinary (unmarked boundary), and avoid (`ۙ`, `ۜ`).

## Translation and transliteration

Arabic is the only text split in this milestone. Translation and
transliteration remain whole-parent-ayah text because there is no canonical
semantic word-range mapping for either. They are never divided by character
count; semantic splitting is a separate milestone.

## Manual edits

The generated array remains the editor's normal editable `CaptionSegment[]`.
Manual split, merge, and timing edits operate on it directly and are not
regenerated during rendering or playback. A new recognition run is the
explicit reset-to-auto operation.

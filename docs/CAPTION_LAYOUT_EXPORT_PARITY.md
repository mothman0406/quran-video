# Caption layout and export parity

## Original failure

Caption presentation values were persisted correctly, but DOM previews and the
Canvas exporter interpreted them in different coordinate systems. A saved Quran
size of 30 was a literal 30 CSS pixels in the editor regardless of the preview
width. Export treated the same value as 30 pixels on a hard-coded 360-pixel-wide
reference and multiplied it by `outputWidth / 360`, making it 160 pixels in a
1920×1080 export. Size 25 still became 133.33 export pixels, so both settings
looked much larger than the editor and insufficiently different in practice.

Wrapping also differed independently. DOM captions wrapped against the physical
preview width, included invisible object padding and borders in their measured
box, and allowed `overflow-wrap:anywhere`. Canvas wrapped complete words against
the output width. Resizing the editor could therefore change line breaks, and a
font fallback during DOM measurement could change them again. Disabled caption
backgrounds also retained invisible padding in preview while Canvas omitted it.

## Shared logical coordinate system

Caption presentation is now authored on a 360-logical-pixel-wide stage. Its
logical height is derived from the selected output aspect ratio:

- preview scale = physical preview width / 360
- export scale = output width / 360
- device pixel ratio does not participate in layout

Create, the advanced editor, and Watch render the same fixed logical stage and
scale the completed stage to their host. A responsive preview can become larger
or smaller, but its font metrics, width constraint, and line groups remain
unchanged. Canvas resolves the same shared metrics directly at output scale.

The stored Quran size is a logical pixel value. For example, size 30 remains
30 logical pixels in preview and becomes 160 canvas pixels at 1920 output width.
This is one conversion, not a separate export interpretation.

## Shared typography and wrapping

`src/lib/editor/caption-layout.ts` is the authority for:

- Quran, translation, and transliteration font sizes
- Arabic line height (`Quran size × arabicLineSpacing`)
- translation/transliteration line height (`font size × 1.25`)
- Arabic and translation maximum widths
- Arabic-to-translation and transliteration gaps
- complete linked-block height and its Y anchor
- canonical word-based Arabic wrapping and whitespace-based translation wrapping

Both DOM preview and Canvas use Canvas `measureText()` with the same font strings,
logical widths, and greedy complete-word algorithm. Preview renders the returned
line groups explicitly. It never inserts a break within a Quran word, splits a
combining sequence, or special-cases an ayah. Long ayat are not auto-shrunk.

The default maximum width remains 90% of the logical/output width. A user-edited
width remains a normalized percentage and therefore has identical meaning at
all resolutions and aspect ratios.

Quick Create exposes that existing normalized setting in its Layout controls at
70%–96%. The live sample and generated project use the same
`positioning.maxWidthPercent` value consumed by the editor, Watch, and export;
linked translation width follows the selected caption width. Legacy projects
without an explicit maximum width hydrate to the unchanged 90% default.

## Editor direct manipulation

The advanced editor uses the same saved `positioning.maxWidthPercent` field for
its width slider, numeric control, and editor-only selection box. A selected
linked Arabic/translation/transliteration block shows left, right, top, bottom,
and four corner handles. Left/right and corners resize only available width in
the 70%–96% safe range using a deterministic center anchor; they never alter
Quran font size or content-driven height. Top/bottom drag the complete linked
block's vertical anchor, so Arabic is neither cropped nor vertically scaled.

Dragging inside the box updates normalized `positioning.x` and `positioning.y`
within the existing safe bounds. Pointer capture keeps interactions continuous
outside the box. The live editor state is updated on movement; the existing
local safety checkpoint is debounced and history commits on pointer release.
Selection UI is only rendered by editor-selected `CaptionPreview` instances,
so Watch and Canvas/MP4 export receive the same presentation values but never
the outline or handles.

The prior width-slider route crash came from dereferencing a React synthetic
event inside a deferred functional state updater. Under rapid input React had
cleared `event.currentTarget`, producing `TypeError: Cannot read properties of
null (reading 'value')`. Controls now capture the finite numeric value before
scheduling state work; positioning normalization also rejects non-finite legacy
input before calculating bounds.

## Font loading

The Quran font remains `UthmanicHafs`, sourced from Quran Foundation's
`UthmanicHafs1Ver18.woff2` for the default Uthmani style. The shared loader uses
`FontFace`, waits for the exact Arabic probe through `document.fonts.load()`, and
verifies it with `document.fonts.check()`. Preview text stays unmeasured/hidden
until the intended font is ready. Export waits for Quran, translation, and
transliteration fonts before its first measurement or frame.

## Position semantics

For linked Arabic and translation, `positioning.y` is the requested center of
the complete caption block. Arabic remains above translation in normal reading
order. The block is rebalanced as a unit when its measured height would leave
the existing safe range (6%–94%, with the existing 82% lower limit for 9:16).
Nothing moves Arabic independently. At position 78% in the landscape fixture,
the long two-line block reaches the bottom safe edge, so smaller Quran sizes move
its top downward while preserving the translation below it.

## Real Ar-Rahman QA

Fixture: `tmp/site-demo-source/recitation-demo-source.mp4`, 1920×1080, position
78%, Uthmani font, 15px logical translation, 90% width. Fresh MP4s were rendered
in headless Chrome, frames at 24s (55:7) and 33s (55:9) were decoded, and caption
pixels were measured against the dimmed source.

| Quran size | Output font | Output line box | Approx. decoded glyph height | 55:7 lines preview/export | 55:9 lines preview/export | linked block top/bottom for 55:9 |
| --- | ---: | ---: | ---: | --- | --- | --- |
| 38 | 202.67px | 273.6px | ~250px/line | 2 / 2 | 2 / 2 | 225.3px / 1015.2px |
| 30 | 160px | 216px | ~197px/line | 1 / 1 | 2 / 2 | 340.5px / 1015.2px |
| 25 | 133.33px | 180px | ~162px/line | 1 / 1 | 2 / 2 | 412.5px / 1015.2px |

The measured glyph change is approximately -21% from 38→30 and -18% from
30→25; line boxes change by -21.1% and -16.7% respectively. A 960px preview and
a 480px preview produced identical 55:9 line groups, with all physical metrics
scaling by exactly 2×.

At size 30 / position 78, 55:9 still overlaps the reciter's lower face/chin. At
size 25 / position 78, the obstruction is reduced but the upper Arabic line still
touches the chin/lower-face region. This is the truthful result of the selected
size, width, translation, and center anchor; the implementation does not tune or
shrink 55:9 to force a marketing result.

## Known limitations

- DOM glyph rasterization and Canvas glyph rasterization can differ by antialiasing
  details even when font, measured widths, line groups, and line boxes agree.
- Page-specific Madinah/QCF fonts still cannot be exported as one Unicode font;
  the existing explicit export rejection remains.
- A very tall linked block is clamped into the safe region, so its actual center
  may differ from the requested center. This is existing outer-edge visibility
  behavior, now shared by preview and export.

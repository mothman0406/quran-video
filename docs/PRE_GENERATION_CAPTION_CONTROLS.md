# Pre-generation caption controls

## Product flow

The primary flow is now Upload → Preview and style → Generate → Watch or
Download. The advanced editor remains an optional destination for manual
caption, timing, and project edits; it does not contain the five-section
pre-generation interface.

## Five sections

`/create` uses a compact single-panel navigator. Layout is active first, and
switching sections preserves the shared presentation state.

- Layout: 9:16, 1:1, 4:5, and 16:9 canvases; draggable/slider caption position;
  Arabic-to-translation spacing.
- Quran: export-safe Quran font, Arabic size, and color.
- Translation: the supported English Saheeh International edition; safe browser
  font, size, regular/semibold/bold weight, italic, and color.
- Effects: source dim level, shared Arabic/translation outline and outline
  color, bounded shadow, and caption fade duration.
- Toggles: translation, canonical ayah numbers, the existing read-so-far word
  highlighting, and a truthful locked-on Full Ayah indicator. Reset restores
  presentation defaults only.

## Defaults

Quick Create keeps its established vertical workflow, 38 px Uthmani/QPC Hafs
Arabic, white Arabic, 15 px Arial English translation, translation on,
read-so-far highlighting on, and ayah numbers off. It retains the established
linked caption placement, 8 px text spacing, restrained shadows, no source
dimming, no outline, and a 225 ms fade. An untouched upload can be generated
without visiting any control.

## Preview and generation parity

The live sample reads the same `CaptionPresentationSettings` object used to
construct the generated `SavedProject`. Style updates are React state changes;
they do not call media preparation or Quran recognition. Position dragging and
the Layout slider both write `positioning.y`.

The durable project fields remain the renderer authority: `format`,
`positioning`, `typography`, `captionBackground`, `transitionSettings`,
`captionEffects`, and `showVerseNumber`. Watch preview, direct finished-video
download, editor preview, and editor export consume those fields. Both preview
and export retain contain-fit media behavior, so aspect-ratio changes never
stretch the source.

## Persistence and optional editor behavior

Projects persist the selected presentation through local and cloud project
state. Legacy projects receive neutral defaults for source dim, translation
weight, and italic. Opening a generated project in the editor hydrates the
saved presentation, including dimming, without changing caption recognition or
manual timing state.

The editor keeps its prior Media/Canvas/Inspector/timeline structure and its
Settings/Subtitles inspector navigation. No Layout/Quran/Translation/Effects/
Toggles panel navigation was added there. Only state hydration, preview, and
export plumbing changed so the existing editor can preserve a Quick Create
project's appearance.

## Mobile behavior

Below 760 px, the existing create layout stacks preview and controls. The five
section buttons remain horizontally usable, the panel becomes content-height,
4:5 and 9:16 previews fit the viewport, and color/text inputs use bounded grid
columns without horizontal page overflow.

## Known limitations

- English Saheeh International is the only translation currently supported, so
  the language selector is intentionally locked to that truthful option.
- Madinah/QCF page fonts are excluded from Quick Create because a single static
  font file cannot safely render arbitrary pages during local export. Uthmani,
  IndoPak, and KFGQPC-backed options remain available.
- Full Ayah is informative and locked on because production recognition already
  generates complete canonical ayat; it is not a segmentation mode.
- Local MP4/WebM rendering still depends on browser WebCodecs/Mediabunny codec
  support and the existing account export authorization policy.

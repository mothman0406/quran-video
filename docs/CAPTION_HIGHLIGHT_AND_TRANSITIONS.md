# Caption Highlight and Transitions

## Reference behavior

Quran captions use the configured Arabic color as their visual foundation. The presentation is intended to remain substantial and cinematic: canonical glyph shaping is left untouched, full-opacity words retain the existing outline and shadow treatment, and highlighting no longer depends on a large neon glow.

Read-so-far presentation has three states:

- **Read:** the configured Quran color at full opacity.
- **Current:** the configured word highlight color at full opacity with a restrained glow.
- **Unread:** the configured Quran color at `0.32` opacity. The word remains rendered and keeps the same Quran font and shaping.

Ayah-number markers remain in the full-opacity read presentation. Words without reliable timing metadata also stay bright rather than being guessed as unread. Turning Word Highlighting off makes every Quran word bright and disables word-level dimming.

## Defaults and create sample

The default Quran color, word highlight color, and translation color are white (`#ffffff`). Translation defaults to full opacity. The `/create` sample uses the canonical shared Basmallah text:

> بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ

Its English sample follows the app's Saheeh International display convention: “In the name of Allah, the Entirely Merciful, the Especially Merciful.” With highlighting enabled, the deterministic sample shows one read word, one current word, and two unread words. With highlighting disabled, all four words use the bright read presentation.

## Color controls and persistence

Quick Create exposes browser spectrum pickers, visible swatches, and validated six-digit hex fields for the word highlight and translation colors. `translationMatchHighlightColor` links the rendered translation color to `wordHighlightColor`. The independent `translationTextColor` remains stored while linked, so unlinking restores it instead of overwriting it.

These typography fields persist through `CaptionPresentationSettings`, project storage, caption style snapshots, preview, and export. Legacy projects default to a white highlight and an unlinked translation color.

## Crossfade math

The existing 225 ms fade setting is interpreted as the crossfade duration. For an adjacent boundary, the outgoing and incoming layers overlap during the presentation-only interval ending at the boundary. Progress uses smoothstep easing:

```text
p = clamp((time - transitionStart) / duration, 0, 1)
eased = p² × (3 - 2p)
outgoingOpacity = 1 - eased
incomingOpacity = eased
```

The complementary opacities sum to `1`, avoiding a blank interval without showing two full-strength ayat. At the stored boundary the incoming ayah is fully visible. A zero duration switches instantly. Non-adjacent leading and trailing fades use the same smoothstep curve. Caption and recognition timing values are never moved.

## Preview/export parity

Editor/watch preview and Canvas/MP4 export both consume `arabicCaptionPresentationWords`, `resolveWordHighlightPresentation`, `effectiveTranslationColor`, and `captionVisualStatesAtTime`. Arabic, translation, and linked caption backgrounds share the same layer opacity, so translation crossfades with its ayah and never receives word-level dimming.

## Known limitations

- The static `/create` sample demonstrates a fixed progress point; it does not simulate audio playback.
- Unread opacity is a fixed design default rather than another user-facing setting.
- Browsers and Canvas implementations can rasterize the same Quran font with minor antialiasing differences, although color and opacity math is shared.

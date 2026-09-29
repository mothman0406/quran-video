# Caption Transition Parity

## Reported difference and root cause

The advanced editor looked smooth while Watch from `/videos` looked nearly
static. The Videos card itself is only a poster. Watch does not play a cached
or previously rendered MP4: it opens `ComposedVideoPreview`, which reconstructs
the saved project over its source media with `CaptionPreview`.

Both previews already called the same transition selector, but their clocks
were different. The editor supplied `MediaPlaybackClock` animation-frame
samples. Watch supplied `CaptionPreview` only with native `timeupdate` and
`seeked` state updates. Browser `timeupdate` delivery can be slower than the
225 ms transition, so Watch commonly displayed only the endpoints. Watch now
uses `MediaPlaybackClock` and passes it to the same `CaptionPreview` subtree as
the editor.

## Render paths

| Surface | Caption path | Time source | Presentation source |
| --- | --- | --- | --- |
| `/create` | Static canonical Basmallah sample | No caption timeline | `defaultCaptionPresentationSettings` and live controls |
| Advanced editor | `CaptionPreview` | `MediaPlaybackClock` animation frames | Live editor state |
| Watch / Videos Play | `ComposedVideoPreview` → `CaptionPreview` | `MediaPlaybackClock` animation frames | Saved project |
| Videos card | Poster only; opens Watch | None | Saved thumbnail/runtime poster |
| Generated MP4 | `offline-webcodecs` → `drawExportCaptions` | Deterministic output frame timestamps mapped to source time | Immutable export snapshot |

## Shared blur-fade

`captionTransitionEnvelope` in `src/lib/editor/captions.ts` is the shared pure
envelope used by `captionVisualStatesAtTime`. With normalized progress `p`:

```text
s = p² × (3 - 2p)
outgoingOpacity = 1 - s
incomingOpacity = s
outgoingBlurPx = 4 × s
incomingBlurPx = 4 × (1 - s)
```

Adjacent layers overlap with complementary opacity, so there is no blank gap
and never a point with two full-strength ayat. A zero duration switches
instantly with no residual blur. New projects default to `blur-fade` with the
existing 225 ms duration and a fixed logical maximum blur of 4 px. The Fade
control remains the transition-duration control. Explicit saved `fade` and
`none` choices remain intact; projects with no transition setting receive the
new default during hydration.

Arabic, translation, transliteration, and linked background are drawn inside
the same caption layer and receive the same opacity and blur. Word read/current/
unread opacity remains inside that layer: DOM parent opacity and Canvas
`globalAlpha` multiply the word presentation opacity instead of replacing it.
Translation has no word-level highlighting.

## Canvas and generated MP4 behavior

Export evaluates the shared state for every deterministic output frame.
`drawExportCaptions` saves the context, applies `ctx.filter = blur(...)` and
`globalAlpha` only while painting a caption layer, explicitly returns both to
neutral values, and restores the context. Source video and full-frame dimming
are drawn before captions and are never blurred.

A newly downloaded MP4 therefore bakes the outgoing fade/blur and incoming
blur/sharpen into its frames. The application does not persist rendered final
MP4s: Videos stores project data, source media, and a poster, and Download
renders a new MP4 from that state.

## Existing videos and QA

Saved project reconstructions use the fixed Watch clock immediately. Explicit
legacy transition choices remain respected. Any MP4 already downloaded before
this change is immutable and is not automatically updated; downloading again
creates a new render with the saved/current transition settings.

Automated QA covers smoothstep endpoints and midpoint, complementary opacity,
blur direction, zero duration, shared Arabic/translation layers, word-opacity
composition, Watch animation-frame wiring, legacy migration, saved duration,
Canvas blur scaling/reset, manual timing preservation, and recognition timing
preservation.

Production-browser QA used the existing 22-second Surah 74 fixture through the
real Generate → Videos → Watch flow. Generation produced nine ayat with the
new default. At the 74:1 → 74:2 boundary, Watch recorded 37 animation-frame
samples, including 13 distinct overlapping transition states; the editor also
recorded 13. Every overlap had complementary opacity and blur on both layers.

The production exporter then rendered a one-second H.264/AAC MP4 around that
boundary: 30 expected and 30 rendered frames, 1.008 seconds, with audio.
Extracted frames at 0.28, 0.39, 0.49, and 0.52 seconds visibly confirmed
outgoing blur/fade, simultaneous incoming blur/fade, incoming sharpening, no
blank interval, and no hard replacement.

# Product

## Editor assets and timeline interaction

The compact left sidebar exposes Media import, a contextual YouTube URL import
mode selector, a collapsed Project Assets bin, and Canvas controls. Project
Assets lists imported project media and logical Quran text sources without
turning caption segments into individual files. The desktop timeline is taller
for waveform and timing inspection and supports pointer-anchored trackpad
pinch-to-zoom in addition to its visible zoom and pan controls.

Quran-first caption editor for local recitation video or audio. The product identifies the recited surah and ayat, aligns canonical Hafs Arabic, and optionally shows Saheeh International translation and transliteration over video or an audio-only neutral canvas.

Defaults: vertical 9:16, centered Arabic with translation below, ayah-level timing, and editable fades. Users will eventually be able to adjust text, timing, position, style, typography, and output format.

## V1 plan entitlements

The V1 model is centralized in `src/lib/entitlements.ts`. Stripe Price IDs are deployment configuration and are mapped only on the server.

- Free ($0): unlimited local recognition, editing, and export count; 720p maximum output with a watermark and up to 3 cloud projects.
- Pro ($9.99/month or $99/year): unwatermarked 720p/1080p output. Paid cloud/storage policy remains TBD.
- Premium ($19.99/month or $199/year): Pro access plus unwatermarked 4K output. Paid cloud/storage policy remains TBD.

Export count is recorded for future accounting but is not a quota on any plan. Canonical Arabic, core recognition, manual timing/editing, and local-first workflows remain available on Free.

V1 is Hafs only. Recognition, canonical content, rendering, accounts, billing, and additional media features remain explicitly staged by milestone.

## Local-first product behavior

- Selecting a browser-playable video or audio file starts a browser-local editing session. Media stays local, and its object URL is released whenever the source changes or the editor unmounts.
- The product may send a temporary copy for a processing or rendering job when required. That copy is deleted when the job completes, including unsuccessful or expired jobs.
- Export downloads directly to the user. The service does not keep a rendered export by default.
- “Save Project” is an explicit opt-in action, separate from editing and exporting. Initially it saves lightweight project metadata and settings only—not source videos or rendered exports.
- When a saved project is reopened, the user may need to reselect the original local media. Without it, saved settings and caption work can be viewed or edited, but preview and recognition cannot resume.

## Current media timeline

The timeline is the shared time-navigation surface, in Text / Video / Audio order. Video sources populate both media rows without decoding or duplicating the source; audio-only sources leave Video empty and populate Audio. There is one non-destructive, persisted source-time trim range with linked Video/Audio handles for video sources and Audio handles for audio-only sources. Handle snapping uses the stationary playhead’s 8 CSS-pixel screen-space threshold; trimming never changes Quran caption timing or waveform data. Normal play/export use the selected range, while timeline scrubbing can still inspect the full source. YouTube import, cloud media saving, and multiple clips remain out of scope. Audio-only playback and recognition are supported; audio-only export is clearly unavailable for now.

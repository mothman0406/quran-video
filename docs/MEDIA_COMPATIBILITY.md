# Local media compatibility

Quran AutoCaption accepts media through the standard accessible browser file input and drag/drop. This is the path used by iPhone and iPad Photo Library, macOS Photos/Finder, Android pickers, and desktop file pickers; it does not require the File System Access API.

The picker accepts `video/*`, `audio/*`, and common explicit extensions including MOV, MP4, M4V, M4A, WebM, MKV, AVI, MPEG, transport streams, 3GP, OGV/Ogg, MP3, WAV, FLAC, and AIFF. Actual support is best effort: the selected browser and local decoder capability are authoritative, and protected/DRM media cannot be processed.

## Native first

On selection, the app reads local container metadata with Mediabunny before changing the current editor source. It checks that media is readable, whether an audio track is present, the basic codecs and duration when available, browser playback viability, and recognition-audio decoder support. A native H.264/AAC MP4 continues directly into the existing local recognition path without conversion.

If the original video can play but Web Audio cannot decode its recognition track, Quran AutoCaption keeps that original video as the preview and export source. It lazily loads a single-thread FFmpeg-WASM runtime, first decodes a one-second audio probe, then produces only mono 16 kHz float PCM for the local recognition worker. The PCM has the source media timeline; it is not percentage-rebased or used to alter caption timing.

If playback itself is unavailable, the same local runtime first runs a short audio/video decode probe. Only a successful probe permits a full local normalization to fast-start MP4 with H.264/yuv420p video and AAC audio (or an AAC M4A for audio-only input). The normalized file becomes the local editor source while original filename/type metadata remain available to the project. Audio-only sources never receive a manufactured video.

## Apple recordings

MOV/QuickTime, iPhone camera and screen recordings, M4V, and HEVC/H.265 sources follow the same native-first route. Safari can retain an already playable Apple source. A playable source whose audio path is unavailable receives audio-only extraction; an unplayable source is normalized only if the bundled local decoder proves it can decode the stream. Rotation/aspect ratio are left to decoder/container metadata and the existing contain-based preview/export path, avoiding portrait stretching. HDR/Dolby Vision, ALAC, ProRes, and unusual HEVC variants remain device/decoder dependent.

## Safety, privacy, and cleanup

Compatibility work never uploads media or calls a conversion backend. FFmpeg-WASM is imported only after a fallback is required; its pinned runtime assets are fetched once for that browser session, but selected media never leaves the device. It uses the single-thread core, so iPhone/iPad support does not depend on SharedArrayBuffer or cross-origin isolation. Native-compatible media retains the existing 500 MB local selection limit. A file requiring fallback is capped at 100 MB because the browser must hold source, decoder, and output buffers; it fails before the source is copied into the runtime.

The selection stays visibly **Checking your recording...** during preflight and **Preparing this recording for your browser...** during normalization. Re-selecting a file aborts active compatibility work; temporary runtime files are deleted after every probe/conversion, and the runtime is reusable only for the active session. Existing source and object URLs are not replaced until a new source has passed preflight.

Friendly terminal states are:

- No audio: “This video doesn't contain an audio track. Choose a recording where the recitation can be heard.”
- Corrupt/unreadable: “We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.”
- Protected: “This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.”
- Unsupported after a local probe: “We can't process this recording on this device yet. Try another copy of the video or export it from Photos and try again.”
- Too large for fallback: “This recording is too large to convert safely in your browser. Trim it to the part you want to caption and try again.”

For debugging, use the browser developer console/network panel to confirm only local object URLs, model assets, and FFmpeg-WASM assets are loaded; no selected media request should leave the browser. If an ordinary recording fails, choose the original unprotected Photos item or export/trim it from Photos and select that local copy.

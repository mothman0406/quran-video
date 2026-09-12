# Local media compatibility

Quran AutoCaption accepts media through the standard accessible browser file input and drag/drop. This is the path used by iPhone and iPad Photo Library, macOS Photos/Finder, Android pickers, and desktop file pickers; it does not require the File System Access API.

The picker accepts `video/*`, `audio/*`, and common explicit extensions including MOV, MP4, M4V, M4A, WebM, MKV, AVI, MPEG, transport streams, 3GP, OGV/Ogg, MP3, WAV, FLAC, and AIFF. Actual support is best effort: the selected browser and local decoder capability are authoritative, and protected/DRM media cannot be processed.

## Native first

On selection, the app reads local container metadata with Mediabunny before changing the current editor source. It checks that media is readable, whether an audio track is present, the basic codecs and duration when available, browser playback viability, and recognition-audio decoder support. A native H.264/AAC MP4 continues directly into the existing local recognition path without conversion.

If the original video can play but Web Audio cannot decode its recognition track, Quran AutoCaption keeps that original video as the preview and export source. It lazily loads a single-thread FFmpeg-WASM runtime, first opens and decodes a one-second **audio-only** probe, then maps only the first audio stream (`-map 0:a:0 -vn`) to mono 16 kHz float PCM for the local recognition worker. `-vn` makes the no-video-decode requirement explicit: a browser-playable HEVC/H.264 video stream cannot block AAC audio extraction. The PCM has the source media timeline; it is not percentage-rebased or used to alter caption timing.

If playback itself is unavailable, the same local runtime first runs a short audio/video decode probe. Only a successful probe permits a full local normalization to fast-start MP4 with H.264/yuv420p video and AAC audio (or an AAC M4A for audio-only input). The normalized file becomes the local editor source while original filename/type metadata remain available to the project. Audio-only sources never receive a manufactured video.

## Apple recordings

MOV/QuickTime, iPhone camera and screen recordings, M4V, and HEVC/H.265 sources follow the same native-first route. Safari can retain an already playable Apple source. A playable source whose audio path is unavailable receives audio-only extraction; an unplayable source is normalized only if the bundled local decoder proves it can decode the stream. Rotation/aspect ratio are left to decoder/container metadata and the existing contain-based preview/export path, avoiding portrait stretching. HDR/Dolby Vision, ALAC, ProRes, and unusual HEVC variants remain device/decoder dependent.

## Safety, privacy, and cleanup

Compatibility work never uploads media or calls a conversion backend. FFmpeg-WASM is imported only after a fallback is required; its pinned runtime assets are fetched once for that browser session, but selected media never leaves the device. It uses the single-thread core, so iPhone/iPad support does not depend on SharedArrayBuffer or cross-origin isolation.

## Production FFmpeg runtime

The original production fallback used the dynamically imported `@ffmpeg/ffmpeg` 0.12.15 wrapper, then used `@ffmpeg/util` to download `@ffmpeg/core` 0.12.10 from jsDelivr and turn both the core JavaScript and WASM into blob URLs. The wrapper created its own Next-bundled worker and called `load()` with those blob URLs. The production `runtimeLoad` trace therefore failed before a recording was mounted, probed, or converted: the external core fetch/blob/worker initialization chain was one collapsed rejection. It was not evidence that the MOV itself was unsupported.

The app now ships matching, pinned files with the deployment: `/ffmpeg/ffmpeg-worker.js`, its `const.js` and `errors.js` dependencies from `@ffmpeg/ffmpeg` 0.12.15, plus `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm` from `@ffmpeg/core` 0.12.10. They are root-relative same-origin paths, so on the canonical site they resolve to `https://qurancaptions.com/ffmpeg/...` even from `/editor` or `/editor?debugMedia=1`; no retired Netlify hostname, CDN, local filesystem path, or blob URL is used. The single-thread core has no companion `ffmpeg-core.worker.js`; that file is only relevant to a multi-thread core and is deliberately not deployed.

Before FFmpeg initializes, the fallback lazily imports the wrapper, starts the pinned module worker and receives its safe unknown-message response, validates the core JS response, and validates that the WASM response is successful, `application/wasm`, and begins with the WASM magic bytes. This identifies an HTML fallback/404 masquerading as WASM before initialization. `scripts/check-ffmpeg-assets.mjs` runs before and after `next build` and verifies every published runtime file byte-for-byte against its installed package source.

There is no blanket picker or native-source byte limit. Browser playback and the normal Web Audio path retain the selected `File` and an object URL; neither requires a whole-file JavaScript copy simply to play or exist. The compatibility preflight routes before applying any resource policy.

For recognition-only fallback, FFmpeg mounts the selected `File` with Emscripten `WORKERFS`. The pinned single-thread core includes WORKERFS and runs in FFmpeg's worker context, where its FileReaderSync-backed mount reads the selected `File` on demand. The browser transfers File/Blob metadata to the worker rather than `file.arrayBuffer()` bytes, and FFmpeg reads the required ranges while demuxing the mapped audio stream. This avoids a duplicate full source ArrayBuffer and MEMFS input, including the irrelevant high-bitrate video payload. The retained costs are the original File, FFmpeg decoder working memory, and the generated recognition PCM. Recognition PCM is bounded at 256 MiB (about 70 minutes at 16 kHz mono float); this is an audio-workload bound, not a source-video byte cap. Temporary PCM output and the WorkerFS mount are released immediately after the worker receives the PCM.

Full video normalization has a separate deterministic preflight policy because it must hold encoded output in WASM memory, retrieve it to JavaScript, and allocate video decode/encode surfaces. It accepts only sources at or below 250 MiB, 15 minutes, and 3840×2160 coded pixels. Any source outside one of those limits fails before FFmpeg starts with a trimming/smaller-copy recommendation. Those thresholds do not apply to native media or audio-only fallback.

Export has no separate selected-source byte policy: it uses the already accepted preview source and the existing browser WebCodecs/Mediabunny capability preflight. Export output is necessarily assembled in browser memory, so unusually long or high-resolution exports can still be constrained by the browser, but this milestone does not add a second source-size rejection.

The selection stays visibly **Checking your recording...** during preflight and **Preparing this recording for your browser...** during normalization. Re-selecting a file aborts active compatibility work; temporary runtime files are deleted after every probe/conversion, and the runtime is reusable only for the active session. Existing source and object URLs are not replaced until a new source has passed preflight.

FFmpeg setup, mount, container-open, no-stream, audio probe/demux, decoder, PCM-output, resource, protected, and corrupt-media failures retain separate internal codes. Runtime setup now specifically distinguishes `ffmpeg-wrapper-import-failed`, `ffmpeg-worker-create-failed`, `ffmpeg-core-load-failed`, `ffmpeg-wasm-load-failed`, and `ffmpeg-initialize-failed`. They retain the same concise customer-facing setup error. Friendly terminal states are:

- No audio: “This video doesn't contain an audio track. Choose a recording where the recitation can be heard.”
- Corrupt/unreadable: “We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.”
- Protected: “This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.”
- Runtime or WORKERFS setup: “We couldn't prepare this recording on this device. Try refreshing the page and selecting it again.”
- Audio decoder unavailable: “We found audio in this recording, but this device can't decode its audio format yet. Try exporting another copy of the recording and selecting it again.”
- Audio decode failure: “We found audio in this recording, but this device couldn't decode it locally. Try exporting another copy of the recording and selecting it again.”
- Full normalization outside the local resource policy: “This recording needs more conversion than this browser can safely handle. Try trimming it to the part you want to caption, or choose a smaller copy.”
- Recognition audio whose generated PCM would exceed the local bound: “This recording's audio is too long for this browser to prepare safely. Try trimming it to the part you want to caption, or choose a shorter copy.”

For a production-safe compatibility trace, open the editor with `?debugMedia=1`, open the browser console, select the recording, and copy the concise `[Quran AutoCaption media]` entries. Runtime fallback emits `runtime-wrapper-import-start/ok`, `worker-create-start/ok`, `core-load-start/ok`, `wasm-load-start/ok`, and `ffmpeg-initialize-start/ok`, or the matching `*-failed` event and exact internal code. The trace otherwise includes only the visible extension, file size, playback/native-audio capability, selected route, WORKERFS result, demux/audio-decode result, stream count, codec/sample rate/channels, PCM duration, and final internal error code. It never includes the filename, media contents, audio samples, URLs, account data, tokens, or raw FFmpeg logs. Mediabunny remains the first local MOV/MP4 container/track inspector and browser/WebCodecs capability check; the proven FFmpeg path needs no separate WebCodecs demux/decode implementation.

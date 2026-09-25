# Deterministic media preparation

## Problem and observed root cause

The real reproducer is a 281,360,367-byte (268.33 MiB), 50.253-second phone
recording. The original production path inspected its AAC track as browser
decodable, then called `File.arrayBuffer()` and passed the entire QuickTime
video container to `AudioContext.decodeAudioData`. Recognition therefore
materialized and handed 281 MB to Web Audio even though the selected audio
track contains only 784,840 encoded bytes. The editor waveform later repeated
the same whole-file operation.

There was a second capability error. Chrome's `canPlayType` returned an empty
MIME hint for this QuickTime/HEVC combination even though the actual source
blob loaded, decoded a frame, played, and reached `readyState = 4`. The old
router treated that hint as authoritative and selected full-video
normalization. Because the source exceeded the full-normalization safety
limit, the editor branch rejected. `/create` used `Promise.allSettled`, so it
continued waiting for the stalled whole-file Web Audio branch before it could
handle that rejection. Its catch path then suppressed the error after aborting
its own controller. Together these behaviors explain the observed indefinite
“Preparing video...” state.

No AirDrop, device, filename, extension, or manufacturer distinction is
involved.

## Source characteristics

The exact phone fixture remains local and ignored:

- QuickTime File Format / ISOBMFF, 281,360,367 bytes, 50.253 seconds
- HEVC Main 10 (`hev1.2.4.L186.B0` / `hvc1`), 2160×3840, constant 120 fps
- BT.2020 HLG color, no rotation or flip transform
- AAC-LC (`mp4a.40.2`), 44.1 kHz stereo, one audio track
- 6,029 video packets / 280,500,450 video bytes
- 2,166 audio packets / 784,840 audio bytes
- `mdat` precedes a 75,041-byte `moov` atom; the file is not fast-start

The Mac regression fixture is also local and ignored:

- QuickTime File Format / ISOBMFF, 154,990,091 bytes, about 33 seconds
- AVC (`avc1.4d0033`), 2376×1334, variable 12–60 fps (about 34.39 fps average)
- BT.709, no rotation or flip transform
- AAC-LC, 48 kHz stereo, one audio track

## Old production architecture

Selection created an original-source object URL immediately. Editor and
recognition preparation then ran concurrently and independently:

1. Mediabunny inspected tracks and metadata.
2. Editor playback trusted `canPlayType`; an empty answer attempted exact
   AVC/AAC transmux and then bounded FFmpeg full-video normalization.
3. Recognition trusted `InputAudioTrack.canDecode`, but “native” decoding still
   copied the complete `File` and passed the whole video container to Web
   Audio.
4. Web Audio returned all source-rate channels; JavaScript downmixed and
   linearly resampled them to 16 kHz mono.
5. Native failure used an audio-only FFmpeg-WASM command.
6. The editor separately decoded the complete working media again for its
   waveform.

The original source already remained authoritative for save, export, and
recognition, but the recognition acquisition and playback capability checks
were doing unnecessary or incorrect work.

## Deterministic capability router

One cached Mediabunny inspection determines container, tracks, deterministic
primary audio-track identity/number, codecs, dimensions, duration, browser
playback, and browser audio-decoder capability. MIME is only a hint: when
`canPlayType` is empty, a bounded media-element probe tests the actual source.

Recognition then executes exactly this ladder:

1. If the selected audio track reports browser decoder support, attempt the
   Mediabunny/WebCodecs audio-only path once.
2. If that capability is absent or that attempt fails, attempt the generic
   FFmpeg-WASM audio-only path once.
3. If the fallback fails, enter `failed` and return a typed preparation error.

The same inspection and runtime capabilities always select the same path.
Video codec support does not control recognition-audio decoding. The selected
Mediabunny primary track ID is reused by WebCodecs, and its stable 1-based audio
track number maps to the same FFmpeg stream when fallback is required.

## Preferred audio-only path

`BlobSource` remains range-backed by the original `File`. `AudioSampleSink`
demuxes the selected track and decodes only its encoded audio packets through
the browser's supported decoder. Each decoded sample is copied one channel at
a time, downmixed and linearly resampled directly into the final mono buffer,
and closed immediately. No video sample sink, `VideoDecoder`, video frame,
replacement video, complete-source `ArrayBuffer`, or source-rate whole-track
PCM allocation is involved.

The waveform consumes the same canonical PCM. It no longer performs a second
whole-container Web Audio decode.

## Generic compatibility fallback

FFmpeg-WASM remains lazy and local. It mounts the original `File` with
WORKERFS, maps only the inspected audio stream, disables video with `-vn`, and
emits mono 16 kHz `pcm_f32le`. It never encodes or transcodes video for Quran
recognition. Runtime files remain pinned and same-origin. Mounted files,
listeners, outputs, and directories are cleaned up in `finally` blocks.

Full-video normalization remains a separate editor-playback compatibility
operation only for sources the browser actually cannot play. It is not part of
the recognition path.

## Canonical PCM contract

Every successful input yields one caller-owned representation:

- 16,000 Hz
- one mono channel
- finite `Float32` samples
- linear interpolation resampling
- arithmetic channel averaging, preserving existing amplitude semantics
- exactly `frameCount * 4` bytes

This is the unchanged contract consumed by VAD and Quran recognition. No
FastConformer, VAD, reconstruction, integrity, boundary, or forced-alignment
decision changed.

## Memory behavior

For the phone fixture the preferred path retains the original `File`, reads
container metadata and the 784,840-byte encoded audio track on demand, holds
only one decoded audio sample's planar data at a time, and produces a
3,216,192-byte canonical output. It no longer allocates a 281,360,367-byte
source `ArrayBuffer`, Web Audio's decoded source-rate channels, or a duplicate
waveform decode. The recognition worker still makes its intentional disposable
copy so the caller-owned PCM remains reusable for retry.

## State, stalls, cancellation, and errors

The internal audio states are `inspecting`, `preparing-audio`,
`compatibility-fallback`, `ready`, and `failed`. Inspection is bounded at 30
seconds, browser audio decoding at 120 seconds, and the compatibility operation
at 15 minutes. A timeout aborts the owned operation and transitions to the one
allowed fallback or terminal failure; it cannot cycle.

Selecting another source or unmounting aborts the active operation. Mediabunny
inputs and decoded samples are disposed, stale job IDs cannot publish UI state,
temporary preview URLs are revoked without revoking the active source URL, and
FFmpeg resources are scoped and cleaned. A terminal error stops progress,
retains the selected source, and offers Retry or Choose another recording.

## Measured browser results

Measurements used headed Chrome 152.0.7977.85 on `/create?debugMedia=1`.
Recognition was not run; readiness proves canonical PCM was available and the
Generate action was enabled.

| Fixture | Before | Inspection | Audio metadata | Demux + decode | Downmix + resample | Audio total | `/create` total | Fallback |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Phone HEVC/AAC | >4 minutes, user-aborted/effectively stalled | 8 ms | 2 ms | 890 ms | 19 ms | 937 ms | 1,032 ms | No |
| Mac AVC/AAC | Previously successful; pre-change timing was not captured | 9 ms | 2 ms | 659 ms | 12 ms | 690 ms | 741 ms | No |

Mediabunny's `AudioSampleSink` intentionally fuses encoded-packet extraction,
demux scheduling, and WebCodecs decoding, so “Demux + decode” is the directly
observable boundary rather than a manufactured split. FFmpeg initialization
and processing were both zero/not invoked for these preferred-path runs.

Both previews reached `readyState = 4`, reported the correct duration, played
successfully, enabled Generate, emitted no fatal console errors, and retained
the original source blob. The phone source used direct original playback. The
Mac source also used direct original playback after the actual capability
probe; no FFmpeg route was introduced.

## Browser and mobile behavior

Routing uses feature and track capability detection. Browsers with WebCodecs
audio support use the preferred path. Safari/mobile environments without the
required decoder support select the single FFmpeg audio-only fallback. Wrong
or missing extensions and MIME values do not reject otherwise readable and
playable media. Protected, unreadable, no-audio, excessive-duration PCM, and
locally undecodable sources fail explicitly.

## Exact next step

Keep the two original files local as manual compatibility fixtures and rerun
`npm run regression:media-preparation:chrome -- <media-path>` after any future
media-library, browser-support, or ingestion change.

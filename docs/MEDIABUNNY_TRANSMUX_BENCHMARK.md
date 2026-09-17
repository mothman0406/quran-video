# Mediabunny MOV transmux benchmark

Date: 2026-09-16
Branch: `benchmark/mediabunny-transmux`
Starting commit: `5f9953ae6e8c5147d5d3406f0c33cfc93cf37f34`

This is a diagnostic milestone. Production media routing and Quran recognition
are unchanged.

## Decision

> Follow-up: bounded-memory output is now proven. See
> `docs/MEDIABUNNY_BOUNDED_TRANSMUX.md`. The winning diagnostic path writes a
> non-fragmented end-`moov` MP4 to OPFS and exposes bounded file-backed range
> responses for local playback. Production routing is still unchanged.

Mediabunny 1.57.0 can packet-copy this MOV's H.264 and AAC into a correct,
non-fragmented, fast-start MP4. The previous 0.911646-second audio displacement
is gone. The encoded packet counts, bytes, SHA-256 payload hashes, packet
timeline hashes, and decoder-description hashes are identical before and after
the conversion.

The path is not yet safe to wire into production. The only correct fast-start
Conversion configuration tested here uses `fastStart: "in-memory"` plus a
`BufferTarget`. In headed Chrome, used JS heap grew from 16,964,888 bytes to
562,881,033 bytes for the 154,990,091-byte fixture. A streaming OPFS fragmented
MP4 reduced memory, but Chrome reported 33.983333 seconds instead of 33.033333
seconds, exposing the 0.95-second video preroll; that mode is rejected.

Perceptual A/V sync also remains an explicit human check. Container timing,
packet identity, Chrome lifecycle, and decoded-frame seeking pass, but the
automated benchmark does not claim that it listened to the recording.

## Dependency and API audit

The dependency moved narrowly from 1.55.3 to the current stable 1.57.0. The
lockfile changed only the root requirement plus Mediabunny's version, resolved
tarball, and integrity.

Relevant changes after 1.55.3:

- 1.55.4 improved container/bitstream color-space propagation and fixed a rare
  missing audio timestamp offset.
- 1.55.5 fixed a browser-internal `BlobSource` leak and numeric `Infinity`
  validation; 1.55.6 and 1.55.7 contain parser/iterator fixes.
- 1.56.0 added `ConversionOptions.copy`, including `mode`, `shiftTolerance`,
  and `boundaryPolicy`, plus negative-timestamp muxing. ISOBMFF output now uses
  edit lists to suppress negative preroll.
- 1.56.1-1.56.3 add unrelated decoder/metadata/source cleanup fixes.
- 1.57.0 adds flip and full transformation-matrix pass-through, bitrate
  metadata, and `canEncodeVideo` frame-rate configuration. It deprecates
  `allowRotationMetadata` in favor of `allowTransformationMetadata`; existing
  APIs used by inspection and export remain available.

The production imports in `local-media-compatibility.ts` and
`offline-webcodecs.ts` compile unchanged. The exporter still uses explicit
sample/packet sinks and sources, MP4/WebM output formats, and BufferTarget; the
new benchmark does not enter that path.

## Fixture and source timeline

The source was read in place and not modified:

- 154,990,091 bytes, QuickTime/MOV
- H.264 Main `avc1.4d0033`, 2376×1334, yuv420p, square pixels
- variable frame rate: 60 fps lattice, 34.3867 fps average
- limited-range BT.709 primaries, transfer, and matrix
- rotation 0, no flip
- AAC-LC `mp4a.40.2`, 48 kHz stereo

The QuickTime movie header uses a 48,000 timescale and declares 32.979458
seconds. Its per-track media and edit lists explain the negative packet times:

| Track | Media timescale | Media duration | Edit media time | Exposed first packet | Edit segment |
| --- | ---: | ---: | ---: | ---: | ---: |
| Video | 600 | 33.950000 s | 570 = 0.950000 s | -0.950000 s | 32.978333 s |
| Audio | 48,000 | 33.024000 s | 1,841 = 0.038354167 s | -0.038354167 s | 32.979458 s |

An edit maps each track's own media time to movie presentation time zero. The
negative values are decoder/preroll packet time, not an instruction to delay
audio by the difference between track starts. Mediabunny 1.55.3 lacked full
negative-timestamp MP4 output; the old experiment shifted every track by the
video's 0.95 seconds, making audio start at `-0.038354 + 0.95 = 0.911646`
seconds. Version 1.57.0 leaves both encoded timelines unchanged and writes
separate edit-list media times of 0.950000 and 0.038354167 seconds. Both tracks
therefore begin presentation at 0 without a fixture-specific correction.

## Copy proof and timing

The accepted configuration is:

```ts
copy: { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" }
video: { codec: "avc", allowTransformationMetadata: true }
audio: { codec: "aac" }
trim: { start: 0 }
```

In forced mode, a track requiring decoding/encoding is discarded as
`cannot_copy`. Both tracks were utilized and `discardedTracks` was empty. The
Node run has no WebCodecs encoder/decoder available. Full packet scans then
proved:

- video: 1,169 packets / 154,529,523 payload bytes, identical payload and
  timeline SHA-256;
- audio: 1,548 packets / 429,751 payload bytes, identical payload and timeline
  SHA-256;
- AVC and AAC decoder-description SHA-256 values were identical.

No video or audio decode/encode and no FFmpeg-WASM occurred.

| Path | Wall time | Bytes | Container duration |
| --- | ---: | ---: | ---: |
| Mediabunny headed Chrome, non-fragmented fast-start | 0.1125 s | 154,986,036 | 33.033333 s |
| Mediabunny Node control, non-fragmented fast-start | 0.3074 s | 154,986,036 | 33.033333 s |
| Native FFmpeg copy, cold run | 0.54 s | 155,004,343 | 33.017 s |
| Native FFmpeg copy, warm run | 0.16 s | 155,004,343 | 33.017 s |

The source's computed packet end is 33.033333 seconds; its movie header is
32.979458 seconds. Mediabunny preserves the complete last video packet and is
16.333 milliseconds longer than the FFmpeg control, within one 60 Hz frame.
Mediabunny's final raw timestamps are video 33.033333 and audio 32.985646, a
47.688-millisecond end difference. FFmpeg's are video 33.016667 and audio
32.979458, a 37.208-millisecond difference. Both outputs start presentation at
zero through their edit lists.

The accepted output has `ftyp` at byte 0, `moov` at byte 28, and `mdat` at byte
26,754, proving fast start. It is not expected to be byte-identical to FFmpeg.

## Chrome, geometry, color, and seeking

Real headed Chrome 152.0.7977.85 returned `probably` for the MP4 codec string,
loaded 33.033333 seconds at 2376×1334 with readyState 4, fired `canplay`,
`play`, `playing`, and `ended`, and decoded a new frame after every seek:

| Requested | Resolved | Decoded frame media time | Dropped at checkpoint |
| ---: | ---: | ---: | ---: |
| 1 s | 1.017282 s | 1.033333 s | 0 |
| 10 s | 10.017019 s | 10.033333 s | 0 |
| 20 s | 20.017632 s | 20.033333 s | 0 |
| 30 s | 30.013491 s | 30.033333 s | 0 |

The complete short run reported 177 decoded frames and one dropped frame. No
seek stayed frozen or failed to produce a frame. Automated validation did not
listen for delayed audio or inspect a visual/audio event perceptually.

Packet copy preserves yuv420p pixels. The browser also needs the AVC decoder
configuration, coded/display dimensions, pixel aspect ratio, transformation
matrix, and color declaration. Source and output match at 2376×1334, square
pixels, identity matrix, rotation 0, no flip, limited range, and BT.709
primaries/transfer/matrix. FFmpeg independently probes both output files as
H.264 Main yuv420p(tv, BT.709) plus AAC-LC 48 kHz stereo.

## Memory and large-file implications

`BlobSource` performs ranged reads and does not eagerly copy the entire input.
The accepted output does buffer aggressively: `fastStart: "in-memory"` retains
media for finalization and `BufferTarget` retains the complete output. Headed
Chrome's used JS heap increased by 545,916,145 bytes; the Node process's peak
RSS increased by 632,242,176 bytes. This is already more than three times the
155 MB source size and is unsafe to extrapolate to the 500 MB, 2 GB, or 10 GB
provisional limits.

Mediabunny `StreamTarget` can write directly to a
`FileSystemWritableFileStream`, including OPFS, with backpressure. The tested
fragmented fast-start OPFS path used much less memory (Node RSS increase
137,609,216 bytes), but Chrome exposed 33.983333 seconds and is rejected.
Non-fragmented `fastStart: "reserve"` would stream, but Conversion does not
provide the required per-track `maximumPacketCount` metadata. `fastStart:
false` can stream correctly but puts `moov` at the end; it was not promoted as
the requested fast-start route in this milestone.

## Reproduction

Start the development server on loopback, then open the local-only page:

```text
http://127.0.0.1:3000/debug/transmux
```

Choose the exact MOV, keep **Non-fragmented fast-start (RAM)** selected, click
**Generate MP4**, then **Run Chrome suite**. Turn sound on and play/seek around
a clearly visible tap, click, or UI transition. Confirm the heard event remains
aligned before approving perceptual sync. The route returns 404 in production.

The repeatable CLI commands are:

```sh
npm run benchmark:mediabunny-transmux -- /path/to/source.mov
npm run benchmark:mediabunny-transmux:chrome -- /path/to/source.mov buffer-fast-start
```

Generated files stay in the system temporary directory or browser OPFS and are
not committed.

# Bounded-memory Mediabunny MOV transmux

Date: 2026-09-17
Branch: `benchmark/mediabunny-transmux`
Starting commit: `d389fad1fe66d808d189ecafa7f1cf18cc8c6b85`

This is benchmark and reusable working-file infrastructure only. Production
media routing, cloud storage, and Quran recognition remain unchanged.

## Decision

The exact audited 154,990,091-byte QuickTime recording can be copied to a
correct, browser-playable MP4 with bounded media-byte memory. The winning path
is:

1. `File` -> Mediabunny `BlobSource` ranged reads;
2. forced AVC and AAC packet copy;
3. non-fragmented MP4 with `fastStart: false`;
4. Mediabunny `StreamTarget` -> asynchronous OPFS
   `FileSystemWritableFileStream` with 16 MiB chunks and backpressure;
5. a same-origin service-worker URL that returns file-backed `Blob` byte-range
   responses from OPFS for editor playback.

The `moov` box is at the end. That is acceptable for local editor playback
because the playback URL supports ranges: Chrome obtained metadata in 13.1 ms,
then played, sought, decoded, and ended normally. No full output Blob is
materialized in JavaScript.

The direct OPFS `File` object URL stalled in Chrome 152. The range URL is
therefore part of the proven architecture, not an optional optimization.

## Where the previous heap went

The source `File` was not the problem. `BlobSource` holds the file by reference,
uses ranged reads, and defaults to an 8 MiB cache. Stage instrumentation on the
RAM path measured:

| Stage | Used JS heap |
| --- | ---: |
| After source inspection | 19,918,567 bytes |
| After target creation | 19,918,567 bytes |
| After `Conversion.init()` | 19,918,567 bytes |
| Immediately after `execute()` | 564,387,456 bytes |
| After wrapping the result in a Blob | 564,387,456 bytes |
| After output inspection/GC opportunity | 446,042,550 bytes |

The immediate increase was 544,468,889 bytes, matching the earlier roughly
545.9 MB observation. Source inspection and conversion planning added no
measurable heap. The large allocations are visible in Mediabunny 1.57.0 source:

- `fastStart: "in-memory"` retains 154,959,274 bytes of encoded packet payload
  until finalization;
- `BufferTarget` grows geometrically to a 268,435,456-byte capacity buffer;
- `BufferTarget._finalize()` slices a second exact 154,986,036-byte output
  buffer;
- the Blob and object URL added no measurable JS-heap step;
- packet/cache/transient allocations overlap these lifetimes and garbage
  collection, so the exact allocation sizes are not expected to sum to the
  sampled heap peak.

The abstractions that had to change were both output layers: in-memory MP4
media retention and `BufferTarget`. The source representation did not need to
change.

## Mediabunny 1.57.0 API audit

Installed source and declarations expose:

- `BufferTarget`: complete output in an `ArrayBuffer`; unsuitable for large
  media;
- `StreamTarget`: arbitrary-position writes to a
  `WritableStream<StreamTargetChunk>`, backpressure, optional 16 MiB chunking,
  and at most two chunk buffers retained by the chunker;
- `AppendOnlyStreamTarget`: sequential only; not suitable when the muxer must
  patch box sizes or offsets;
- `FilePathTarget`: Node/Bun/Deno wrapper around `StreamTarget`;
- no named OPFS target; `StreamTarget` directly accepts
  `FileSystemWritableFileStream` write commands;
- `fastStart: false`: writes `ftyp`, then a progressive `mdat`, patches its
  header, and appends `moov` at finalization;
- `fastStart: "reserve"`: reserves a bounded front region, requires
  `maximumPacketCount` on every track, progressively writes `mdat`, then seeks
  back to write `moov` plus `free`;
- `fastStart: "in-memory"`: buffers all packet payloads until it can write a
  compact front `moov`;
- `fastStart: "fragmented"`: progressively writes `moof`/`mdat`, but is not
  timeline-correct for this source.

There is no need for a synchronous access handle on the main thread. The
asynchronous writable stream is directly supported, applies backpressure, and
keeps large writes off a synchronous main-thread loop.

## Candidates

| Candidate | Result | Time | Memory | Bytes | Layout |
| --- | --- | ---: | ---: | ---: | --- |
| RAM baseline | Correct but unsafe | 150.7 ms instrumented repeat | +544.5 MB JS heap at execute | 154,986,036 | non-fragmented, front `moov` |
| Node file, `fastStart:false` | Correct control | 182.3 ms | +112.7 MB peak RSS | 154,986,044 | non-fragmented, end `moov` |
| Node file, reserve | Correct control | 176.4 ms | +104.5 MB peak RSS | 155,090,064 | non-fragmented, front `moov` + 104,020-byte `free` |
| Browser OPFS reserve + range URL | Correct | 246 ms | +97.1 MB sampled JS heap | 155,090,064 | non-fragmented, front `moov` |
| Browser OPFS end `moov` + range URL | **Winner** | 238 ms final run | +98.8 MB sampled JS heap | 154,986,044 | non-fragmented, end `moov` |
| Browser OPFS fragmented | Rejected | 139.5 ms Node control | +149.0 MB Node RSS repeat | 154,985,896 | fragmented, front `moov` |

The final end-`moov` repeat loaded metadata through the local range URL in
13.1 ms. Browser measurements include diagnostic packet-stat scans and output
inspection that production does not need.

The bounded path retains source caches, at most two 16 MiB `StreamTarget`
chunks, the muxer's current roughly 0.5-second media chunk, small per-packet
sample-table metadata, and transient range-response Blob views. It does not
retain media bytes proportional to the complete source or output. Per-packet
metadata still grows with packet count, but not with encoded byte size.

## Timeline and copy proof

The winning Node control and browser output expose:

- raw first video timestamp: `-0.950000` seconds;
- raw first audio timestamp: `-0.038354166667` seconds;
- independent video edit-list media time: `0.950000` seconds;
- independent audio edit-list media time: `0.038354166667` seconds;
- presentation start: zero for both tracks;
- output duration: `33.03333333333333` seconds;
- final video timestamp: `33.03333333333333` seconds;
- final audio timestamp: `32.985645833333336` seconds;
- end difference: about 47.688 ms.

The Node full scans prove exact identity:

| Track | Packets | Payload bytes | Payload SHA-256 | Timeline SHA-256 |
| --- | ---: | ---: | --- | --- |
| Video | 1,169 | 154,529,523 | `a90dd534ff8630659cd591f2d015abd63eb272fcd37bb33b6e374fbbb49f66c3` | `15264804bbc3462dfa2c9271139a59b504f5c0f729b0d40579cfbe46f2d3b5c1` |
| Audio | 1,548 | 429,751 | `fd9099aaacc2fbc2b8e453d429e2ed85202deb4511b91565c1ee8840f8ef64db` | `28cfb06c092931bc0cd2fbd047826ae67907add069c559654838fab76bf88c08` |

Source and output hashes match for both payload and timeline, and AVC/AAC
decoder-description hashes match. Forced-copy mode utilized both tracks and
discarded none. A track requiring decoding or encoding would be rejected as
`cannot_copy`. FFmpeg-WASM and WebCodecs were not used.

## Why fragmented MP4 is wrong here

This is a Mediabunny 1.57.0 fragmented-duration limitation, not an arbitrary
offset to compensate. In fragmented mode, `addSampleToTrack()` does not append
samples to the non-fragmented `trackData.samples` table. `moov` is emitted
before the first fragment, while `presentationSpan(trackData)` is therefore
zero. The result contains:

- `mvhd` duration 0;
- both `mdhd` durations 0;
- edit-list media times 0.950000 and 0.038354167, but segment durations 0
  (unknown);
- fragments whose per-track base times were normalized independently.

Chrome derives the visible duration from the fragment timeline and exposes the
video's full 33.983333-second raw span rather than applying the unknown-length
edit as the required 0.95-second trim. The fragmented video packet timeline
hash also differs at fragment duration boundaries. Patching a constant offset
would neither fix the unknown movie/track durations nor restore exact packet
timing, so fragmented MP4 is excluded.

## Chrome validation

Normal headed Chrome 152.0.7977.85 reported MP4 support as `probably`, loaded
2376x1334 at 33.033333 seconds, reached readyState 4, played, paused, sought at
1/10/20/30 seconds, decoded frames after seeks, and ended at 33.033333.
Geometry, square pixels, identity transformation, limited-range BT.709, H.264
Main, and AAC-LC 48 kHz stereo remain unchanged.

Manual perceptual A/V sync was not re-listened to during this milestone. The
previous RAM output passed that human check, and this output has identical
packet payloads, packet timelines, and edit-list semantics, but the explicit
human gate remains.

## Ownership, abort, and cleanup

Working media is ephemeral and separate from the immutable source `File`.
Names use the private `quran-video-transmux-` prefix and random UUIDs.

- cancellation calls `Conversion.cancel()`, disposes the input, empties the
  media element, revokes any Blob URL, and deletes the app-owned OPFS file;
- source replacement performs the same cleanup before enabling a new job;
- write, quota, malformed-packet, and playback-load failures remove the partial
  output;
- unmount/navigation performs best-effort cancellation and deletion;
- the next job sweeps stale app-owned benchmark files left by a crash/reload,
  while preserving unrelated OPFS entries;
- a future production owner must scope names/metadata by project and job so a
  tab never deletes another active tab's file;
- deleting a project should remove its owned working file; startup should reap
  expired/inactive job records.

The service worker only exposes app-owned prefixed names, uses `no-store`, and
returns correct 200/206 length, range, MIME, and `Accept-Ranges` headers. Its
response body is a file-backed Blob or Blob slice, never `arrayBuffer()`.

## Browser and storage limits

OPFS is broadly available, but this exact end-to-end path is proven only in
Chromium/Chrome 152. `FileSystemFileHandle.createWritable()` became Baseline in
September 2025, so current Chrome/Edge, Firefox, and Safari expose the required
asynchronous API in secure contexts. That API fact is not equivalent to a
playback proof: Safari and Firefox still need the exact 155 MB conversion,
service-worker ranges, seeking, abort, and cleanup suite before enabling the
route there. Older Safari requires a worker-only synchronous access handle and
should fall through.

OPFS is quota-managed and may be evicted unless storage is persisted. The
future route must call `navigator.storage.estimate()` and require conservative
free quota before writing. It must also handle `QuotaExceededError` and fall
through without mutating project state.

Safe initial policy:

- Chromium-only experimental route;
- maximum source size 500 MB;
- require reported free quota of at least `max(1.25 * source.size, source.size +
  256 MiB)` before starting;
- keep only one transmux output per source/job and remove it on release;
- do not enable 2 GB or 10 GB claims until real files at those sizes pass
  conversion, quota, reload, playback, seek, export-coexistence, and disk-full
  tests.

The 500 MB figure is a conservative engineering gate, not a promised plan
limit. Private browsing, low disk, browser eviction, and embedded WebViews may
make even that unavailable.

## Future routing contract

`canExactTransmux(source, environment)` should return supported only when all
of these media/environment facts are proven:

- the input container is parseable without corruption;
- exactly the selected primary video/audio tracks are representable in MP4;
- video is already AVC/H.264 in MP4-compatible packet form;
- audio is already AAC in MP4-compatible packet form;
- source packet timestamps can be represented without shifting either track;
- independent negative preroll can be represented with per-track edit lists;
- all transformation, aspect, dimensions, and color metadata are
  representable;
- forced-copy planning accepts every required track and discards none;
- OPFS async writable streams, service workers, byte-range playback, and
  sufficient quota are available;
- an `AbortSignal`/job owner and cleanup path are installed before writing.

Recognition outcome is not an input. Recognition continues independently from
the original source through `prepareRecognitionAudio(original)`, and can run
concurrently when resource pressure allows. A local-transmux failure must clean
up and return a typed fall-through result for the next compatibility route.

Production `routeMediaCompatibility()` is intentionally unchanged.

# Fast media ingest audit

Date: 2026-09-16  
Branch/starting commit: `fix/canonical-audio-selection` / `87afbff`

This milestone is diagnostic. It changes no production routing, cloud
infrastructure, billing, export, or Quran recognition behavior.

## Current coupling

`inspectLocalMedia()` uses Mediabunny for tracks and MIME metadata. Video
playback support is then reduced to `video.canPlayType(input.getMimeType())`.
For the inspected screen recording, Mediabunny returns
`video/quicktime; codecs="avc1.4d0033, mp4a.40.2"`; Chrome declines that
QuickTime MIME type even though the elementary streams are H.264/AAC.

`routeMediaCompatibility()` returns `full-normalization` for every
`browserPlayback:false` result after only the resource-envelope check. It does
not consult `nativeRecognitionAudio` in that branch. `prepareLocalMedia()` then
loads FFmpeg-WASM, mounts the original through WORKERFS, probes it, decodes and
software-encodes video with `libx264`, encodes AAC, reads the complete encoded
output back from WASM, copies it into another typed array, and creates an MP4
`File`.

Three concerns then share that one working `File`:

- Quick Create awaits `prepareLocalMedia(original)` before it calls
  `prepareRecognitionAudio(result.file)`. The prepared file and PCM are handed
  together to `/videos` through `videoJobManager`.
- The editor awaits `prepareLocalMedia(original)` before `loadSelectedSource()`
  can establish the object URL and automatic recognition request.
- `videoJobManager` uses its single runtime file for playback, thumbnail,
  recognition fallback, and the later Supabase source upload. The editor uses
  its single `videoFile` for playback, waveform, recognition, and local export.

The narrow boundaries to split are therefore the return contract of
`prepareLocalMedia()`, Quick Create's sequential preparation, the editor's
`loadSelectedSource()` input, and `VideoRuntime`/editor state ownership. A
source asset needs separate original, recognition-audio, editor-media, and
export-source representations with one source-time coordinate system.

## Real screen-recording evidence

The source was found in place at the Desktop path whose filename contains a
narrow no-break space before `PM`. It was not copied or modified.

| Property | Result |
| --- | --- |
| Bytes | 154,990,091 |
| Container | Apple QuickTime MOV, `qt  ` major/compatible brand |
| Structure | Non-fragmented; `ftyp` at 4, `mdat` at 32, `moov` at 154,959,314 |
| Duration | FFmpeg 32.98 s; Mediabunny metadata 33.000 s / computed 33.033 s |
| Overall bitrate | 37.596 Mb/s |
| Video | AVC/H.264 Main, `avc1.4d0033`, yuv420p, progressive |
| Dimensions | 2376×1334, square pixels, rotation 0 |
| Color | limited-range BT.709 primaries/transfer/matrix |
| Frame rate | variable; 60 fps time base/underlying rate, about 34.43 fps average by FFmpeg |
| Video bitrate | 36.413 Mb/s |
| Audio | AAC-LC, `mp4a.40.2`, 48 kHz stereo, about 104 kb/s |
| Raw first timestamps in Mediabunny | video -0.950 s; audio -0.038354 s |

The codecs are legal in MP4 and can be packet-copied. The source's QuickTime
container, tail `moov`, and edited/negative raw timestamps—not codec
incompatibility—are the relevant complications.

## Measured paths

### Packet-copy control

Native FFmpeg with `-map 0:v:0 -map 0:a:0 -c copy -movflags +faststart`
completed in **0.23 s**. The output was 155,004,343 bytes, MP4/H.264 Main/AAC,
2376×1334, and 33.02 s. Both tracks were copied; no decoder or encoder ran.

This proves that this media class admits a sub-second local remux without
quality loss. It does not by itself prove that the installed browser library
can preserve the same edit-list semantics.

### Installed Mediabunny 1.55.3

The installed Conversion API predates the current documented `copy` option.
Its implementation supports MOV input, MP4 output, and automatic encoded
packet copy when no transformation is required. AVC and AAC are supported by
the MP4 muxer.

For this file, Conversion clamps its default start to zero while both primary
tracks expose negative first timestamps. The installed implementation treats
`firstTimestamp < startTimestamp` as a required video/audio transcode. A
diagnostic that forced the copy path by starting at -0.950 s finished in
0.136 s, but produced a 33.983 s timeline (video at 0, audio at 0.911646 s),
not the 33.033 s source timeline. That output is rejected as semantically
invalid. Stock Mediabunny 1.55.3 therefore cannot yet replace FFmpeg for this
specific edit-list case, despite the codecs being transmuxable.

Before production work, upgrade Mediabunny in an isolated milestone and test
the version whose Conversion API exposes `copy: { mode, shiftTolerance,
boundaryPolicy }`. Accept it only if the forced-copy plan preserves duration,
first audible/video presentation, A/V sync, frame coverage, rotation/color,
and Chrome playback. Do not use a non-zero shift merely to win the benchmark.

### Hardware conversion control

The existing local exporter already proves the application has a Mediabunny
demux + WebCodecs decode/encode + MP4 pipeline. The exact AVC decoder config is
`avc1.4d0033`, 2376×1334, BT.709; the intended audio can remain packet-copied
AAC. A headless Chrome Conversion run did not complete in a reliable benchmark
window, so no browser time or observable hardware claim is fabricated.

As a same-machine hardware feasibility control, native FFmpeg using the macOS
VideoToolbox H.264 encoder, 12 Mb/s video, copied AAC, and fast-start MP4
completed in **8.46 s**. It emitted a 46,862,683-byte, 32.98 s H.264 High/AAC
MP4 with matching dimensions and BT.709 metadata. Maximum RSS was 341,262,336
bytes. This establishes that hardware conversion is viable and comfortably
faster than real time on this Mac, but production WebCodecs still needs an
interactive Chrome benchmark and A/V/content validation.

The existing FFmpeg-WASM path was not rerun: the supplied real-browser
measurement is about five minutes. Relative to that observation, native packet
copy is roughly three orders of magnitude faster and the native hardware
control roughly 35× faster.

## Recommended ingest ladder

1. **Direct original.** Use the selected original when HTML media playback and
   seeking validate. Independently start canonical audio preparation.
2. **Exact local transmux.** When container playback fails but all primary
   tracks can be copied into MP4, perform a forced-copy diagnostic plan and
   validate duration, first/last timestamps, A/V sync, track presence,
   rotation/color, and Chrome metadata/play/seek. Fall through on any shift or
   edit-list ambiguity.
3. **Local WebCodecs editor proxy.** If copy cannot be exact but WebCodecs can
   decode the input video and encode AVC, create an H.264/AAC MP4 proxy using
   hardware preference. Packet-copy AAC when source-time semantics permit.
4. **Cloud fallback.** If local decode/encode is unsupported, validation fails,
   memory risk is high, or a short pilot predicts unacceptable latency, upload
   the original directly and generate a native cloud proxy asynchronously.
5. **FFmpeg-WASM.** Retain only as an explicit offline/no-cloud fallback and
   for inexpensive audio-only extraction. Do not use it as the normal full
   video path.

Route selection is based only on media capability, exact timeline validation,
resource risk, and estimated latency. Quran recognition outcomes never choose
a media route.

## Independent representations

Introduce a source-asset runtime contract conceptually containing:

- immutable local original and source identity;
- one canonical 16 kHz mono recognition PCM;
- editor media (`original`, exact transmux, local proxy, or cloud proxy);
- authoritative export source (`original` locally when WebCodecs can read it,
  otherwise the private cloud original);
- a shared source-time mapping, initially required to be identity.

Recognition calls `prepareRecognitionAudio(original)` immediately after the
single inspection and never waits for editor compatibility. An editor object
URL may arrive later. A proxy must not silently replace the export master.
Local export should read the original through Mediabunny when its tracks are
WebCodecs-decodable even if an HTML `<video>` rejects only the container. When
that is impossible, a future cloud render consumes the private original plus
the saved caption/edit snapshot; the editor proxy is never the implicit final
master.

## Editor proxy

Use fast-start MP4, H.264 High/Main yuv420p, AAC-LC 48 kHz stereo, baked
orientation, and preserved SDR BT.709 metadata. Default to a maximum 1920×1080
bounding box (1280×720 for a deliberately bandwidth-light Free proxy), preserve
aspect ratio, cap variable/high-rate inputs at 30 fps, use a two-second GOP with
scene cuts, and choose speed-optimized VBR around CRF 23–25 or approximately
4–6 Mb/s at 1080p / 2.5–4 Mb/s at 720p. AAC at 128 kb/s is sufficient for
editing. Preserve source frame rate only when motion fidelity requires it or
the source is already cheap.

Hardware encoding is appropriate for editor readiness; it is not a reason to
discard the original. Proxy validation must check duration tolerance, first and
last media, audio presence, first timestamps, seekability, and a small set of
decoded frame/audio checkpoints.

## Cloud fallback recommendation

For a production fallback, prefer **AWS S3 + AWS Elemental MediaConvert** over
the other evaluated options for the first deployment:

- direct browser multipart/resumable S3 upload, mature lifecycle rules and
  private IAM boundaries;
- managed asynchronous MOV-to-H.264/AAC MP4 jobs, queues, status events,
  retries, regional co-location, and no custom FFmpeg fleet to operate;
- Supabase remains identity/project metadata authority; a Netlify server route
  verifies Supabase identity, enforces quota, creates server-chosen S3 keys and
  short-lived upload authorization, and submits the job only after checksum,
  size, MIME, and ownership verification;
- EventBridge/Lambda or a tightly authorized status endpoint projects job
  progress into the existing project/job record. The browser receives only
  short-lived access to its exact objects.

Use MediaConvert Basic, speed-optimized single pass for the editor proxy. Keep
source, proxy, and future final render in one AWS region. A later styled final
renderer may require a custom ECS/Batch worker, but that is independent of the
proxy milestone.

Existing Supabase Storage plus external compute minimizes initial storage
change and has TUS resumability, but it adds cross-provider transfer, signed
input plumbing, and a compute fleet; the current standard browser upload is
also non-resumable. Cloudflare R2 has compelling $0.015/GB-month Standard
storage, free internet egress, multipart/temporary credentials, and lifecycle
rules. Cloudflare Containers can run native FFmpeg, but current documentation
still requires explicit instance routing/scaling, limits standard instances to
4 vCPU/12 GiB, and documents no hardware video encoder. It is a strong future
cost optimization, not the lowest-risk first production fallback. AWS has
higher egress cost but the most mature managed video pipeline.

## Retention, upload, concurrency, and security

Twenty-four hours is a sensible **maximum temporary-media policy**, separate
from subscription packaging. It covers same-day editing, retry, and export
while keeping abuse exposure bounded. Deleting at 24 hours should be enforced
by an application `expires_at` plus a storage lifecycle backstop; lifecycle
execution is not an exact user-visible timer. Successful final export, explicit
project deletion, and canceled jobs should attempt early deletion. Explicitly
saved persistent projects belong under a separate prefix/bucket and policy,
never by silently extending temporary retention.

Use 8–16 MiB multipart parts, three or four concurrent uploads, per-part retry,
progress, AbortController cancellation, persisted upload ID/ETags for resume,
and an incomplete-multipart lifecycle rule. Upload credentials should last
about 15 minutes and be refreshable after reauthorization. Observe the first
16–32 MiB to estimate throughput, but never upload at all when direct or exact
transmux succeeds. Choose between local hardware and cloud using a bounded
local capability/pilot estimate versus upload + queue + proxy ETA; the same
155 MB source has demonstrated both 15 s and 130 s upload times.

After selection, share one inspection and fan out:

```text
original
├─ canonical audio → VAD/Quran recognition
├─ direct/transmux OR local proxy OR multipart cloud upload
└─ waveform/thumbnail when their required representation is readable
```

Do not run FFmpeg-WASM and WebCodecs video conversions together. Native audio
decode and packet copy may overlap. Cloud upload may overlap recognition. If
local hardware conversion and FastConformer materially contend, serialize
their heavy phases using a browser media-work scheduler while model download
and I/O continue.

Buckets remain private. Server code authenticates the Supabase user, chooses
opaque `user/job/random` keys, applies size/type/duration quotas, records an
idempotency key, and authorizes only that exact prefix. Never accept arbitrary
output keys from the client. Require checksum/size completion, validate the
actual container server-side, scan/probe before decode, cap FFmpeg resources,
and make job submission idempotent. Signed URLs/temporary credentials are
bearer secrets: short TTL, HTTPS only, never persisted in project state or
logs. Configure exact-origin CORS. Use retry limits and a dead-letter state,
delete failed/orphaned outputs, abort incomplete multipart uploads, sweep
expired database rows, and reconcile storage against job records. Guests need
Turnstile or equivalent abuse proof, IP/device velocity limits, strict daily
minutes/bytes, and no persistent save.

## Cost and product limits

The major cost is video compute, followed by proxy/original delivery egress;
24-hour storage and request operations are minor. A 155 MB object held for one
day is about 0.0052 GB-month, roughly $0.000078 at R2's documented Standard
rate before free allowance. AWS MediaConvert charges normalized output minutes;
an HD >30–60 fps output has a higher multiplier, which is another reason for a
30 fps editor proxy. Original upload ingress is free on AWS; proxy downloads
and later final downloads drive outbound transfer.

Keep user-facing limits simple and initially conservative:

- **Free:** local paths unlimited within device safeguards; cloud fallback 3
  videos or 15 source minutes per month, max 10 minutes / 500 MB each, 720p
  proxy, 24-hour temporary retention, watermarked existing Basic export.
- **Pro:** 60 cloud-processing minutes per month, max 30 minutes / 2 GB each,
  1080p proxy, 24-hour temporary retention; persistent projects use the
  existing project entitlement rather than implicit temp retention.
- **Premium:** 240 cloud-processing minutes per month, max 120 minutes / 10 GB
  each, 1080p proxy with priority queue, higher cloud-render allowance, and an
  explicit persistent-storage quota.

Local direct/transmux work should not consume cloud quota. Revisit numbers
after measuring p50/p95 uploaded bytes, proxy normalized minutes, retries, and
egress; do not change Stripe products in the ingest implementation.

## Minimal implementation milestones

1. Add representation types and pure route-plan/validation tests; keep
   recognition inputs and behavior byte-for-byte unchanged.
2. Upgrade Mediabunny in isolation and add an exact forced-copy planner plus a
   repeatable real-browser benchmark. Ship transmux only after edit-list,
   duration, A/V, seek, rotation, and color validation passes this fixture.
3. Split Quick Create/editor orchestration so canonical audio recognition uses
   the original immediately while editor media resolves independently.
4. Add the local WebCodecs proxy path by reusing exporter primitives, with a
   bounded scheduler, cancellation, progress, memory guard, and output
   validation. Keep FFmpeg-WASM only as explicit offline fallback.
5. Add private S3 temporary storage, multipart resume/cancel, server-side
   authorization/quota/idempotency, lifecycle/sweeper cleanup, and no compute.
6. Add asynchronous MediaConvert proxy jobs, status projection, retries/DLQ,
   and editor hot-swap to the validated proxy.
7. Make export-source selection explicit and add the later cloud final-render
   worker only after the original/proxy contract is stable.
8. Add metering and enforce simple plan limits only after real cost/latency
   telemetry exists.


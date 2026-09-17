import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import {
  ALL_FORMATS,
  Conversion,
  EncodedPacketSink,
  FilePathSource,
  FilePathTarget,
  Input,
  type InputAudioTrack,
  type InputTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

type Box = { type: string; start: number; size: number; headerSize: number; children?: Box[] };
type Edit = { segmentDuration: number; mediaTime: number; mediaRate: number };
type TrackTimeline = {
  trackId: number;
  handler: string | null;
  mediaTimescale: number | null;
  mediaDuration: number | null;
  edits: Edit[];
};

const CONTAINER_BOXES = new Set(["moov", "trak", "edts", "mdia", "minf", "stbl"]);

function assertSafeOutput(inputPath: string, outputPath: string) {
  if (inputPath === outputPath) throw new Error("Refusing to overwrite the input file.");
  const allowedPrefixes = [`${tmpdir()}/`, "/tmp/"];
  if (!allowedPrefixes.some((prefix) => outputPath.startsWith(prefix))) {
    throw new Error(`Output must be inside ${tmpdir()} or /tmp.`);
  }
}

function uint64(view: DataView, offset: number) {
  const value = view.getBigUint64(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ISOBMFF integer exceeds JavaScript's safe range.");
  return Number(value);
}

function int64(view: DataView, offset: number) {
  const value = view.getBigInt64(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error("ISOBMFF integer exceeds JavaScript's safe range.");
  }
  return Number(value);
}

async function readBoxes(filePath: string) {
  const handle = await open(filePath, "r");
  const fileSize = (await handle.stat()).size;

  async function parse(start: number, end: number): Promise<Box[]> {
    const boxes: Box[] = [];
    let position = start;
    while (position + 8 <= end) {
      const header = Buffer.alloc(16);
      await handle.read(header, 0, 16, position);
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      let size = view.getUint32(0);
      const type = header.toString("ascii", 4, 8);
      let headerSize = 8;
      if (size === 1) {
        size = uint64(view, 8);
        headerSize = 16;
      } else if (size === 0) {
        size = end - position;
      }
      if (size < headerSize || position + size > end) break;
      const box: Box = { type, start: position, size, headerSize };
      if (CONTAINER_BOXES.has(type)) box.children = await parse(position + headerSize, position + size);
      boxes.push(box);
      position += size;
    }
    return boxes;
  }

  try {
    return { fileSize, boxes: await parse(0, fileSize) };
  } finally {
    await handle.close();
  }
}

function child(box: Box, type: string) {
  return box.children?.find((candidate) => candidate.type === type) ?? null;
}

async function readBoxPayload(filePath: string, box: Box) {
  const handle = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(box.size - box.headerSize);
    await handle.read(bytes, 0, bytes.byteLength, box.start + box.headerSize);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } finally {
    await handle.close();
  }
}

async function inspectIsobmffTimeline(filePath: string) {
  const { fileSize, boxes } = await readBoxes(filePath);
  const moov = boxes.find((box) => box.type === "moov") ?? null;
  const mdat = boxes.find((box) => box.type === "mdat") ?? null;
  if (!moov) throw new Error("No moov box found.");

  const mvhd = child(moov, "mvhd");
  let movieTimescale: number | null = null;
  let movieDuration: number | null = null;
  if (mvhd) {
    const view = await readBoxPayload(filePath, mvhd);
    const version = view.getUint8(0);
    movieTimescale = view.getUint32(version === 1 ? 20 : 12);
    movieDuration = version === 1 ? uint64(view, 24) : view.getUint32(16);
  }

  const tracks: TrackTimeline[] = [];
  for (const trak of moov.children?.filter((box) => box.type === "trak") ?? []) {
    const tkhd = child(trak, "tkhd");
    const mdia = child(trak, "mdia");
    const mdhd = mdia ? child(mdia, "mdhd") : null;
    const hdlr = mdia ? child(mdia, "hdlr") : null;
    const elst = child(trak, "edts") ? child(child(trak, "edts")!, "elst") : null;
    if (!tkhd) continue;
    const tkhdView = await readBoxPayload(filePath, tkhd);
    const tkhdVersion = tkhdView.getUint8(0);
    const trackId = tkhdView.getUint32(tkhdVersion === 1 ? 20 : 12);
    let mediaTimescale: number | null = null;
    let mediaDuration: number | null = null;
    if (mdhd) {
      const view = await readBoxPayload(filePath, mdhd);
      const version = view.getUint8(0);
      mediaTimescale = view.getUint32(version === 1 ? 20 : 12);
      mediaDuration = version === 1 ? uint64(view, 24) : view.getUint32(16);
    }
    let handler: string | null = null;
    if (hdlr) {
      const view = await readBoxPayload(filePath, hdlr);
      handler = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    }
    const edits: Edit[] = [];
    if (elst) {
      const view = await readBoxPayload(filePath, elst);
      const version = view.getUint8(0);
      const entryCount = view.getUint32(4);
      let offset = 8;
      for (let index = 0; index < entryCount; index += 1) {
        const segmentDuration = version === 1 ? uint64(view, offset) : view.getUint32(offset);
        const mediaTime = version === 1 ? int64(view, offset + 8) : view.getInt32(offset + 4);
        const rateOffset = offset + (version === 1 ? 16 : 8);
        const mediaRate = view.getInt16(rateOffset) + view.getUint16(rateOffset + 2) / 65_536;
        edits.push({ segmentDuration, mediaTime, mediaRate });
        offset += version === 1 ? 20 : 12;
      }
    }
    tracks.push({ trackId, handler, mediaTimescale, mediaDuration, edits });
  }

  return {
    fileSize,
    topLevelBoxes: boxes.map(({ type, start, size }) => ({ type, start, size })),
    fastStart: Boolean(moov && mdat && moov.start < mdat.start),
    movieTimescale,
    movieDuration,
    movieDurationSeconds: movieTimescale && movieDuration !== null ? movieDuration / movieTimescale : null,
    tracks: tracks.map((track) => ({
      ...track,
      mediaDurationSeconds: track.mediaTimescale && track.mediaDuration !== null
        ? track.mediaDuration / track.mediaTimescale
        : null,
      edits: track.edits.map((edit) => ({
        ...edit,
        segmentDurationSeconds: movieTimescale ? edit.segmentDuration / movieTimescale : null,
        mediaTimeSeconds: track.mediaTimescale && edit.mediaTime >= 0 ? edit.mediaTime / track.mediaTimescale : null,
      })),
    })),
  };
}

function hashDescription(description?: AllowSharedBufferSource) {
  if (!description) return null;
  const bytes = ArrayBuffer.isView(description)
    ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength)
    : new Uint8Array(description);
  return createHash("sha256").update(bytes).digest("hex");
}

async function inspectPacketIdentity(track: InputTrack) {
  const payloadHash = createHash("sha256");
  const timelineHash = createHash("sha256");
  let count = 0;
  let totalBytes = 0;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    payloadHash.update(packet.data);
    timelineHash.update(`${packet.timestamp.toFixed(12)}:${packet.duration.toFixed(12)}:${packet.type};`);
    count += 1;
    totalBytes += packet.byteLength;
  }
  return {
    packetCount: count,
    packetBytes: totalBytes,
    payloadSha256: payloadHash.digest("hex"),
    timelineSha256: timelineHash.digest("hex"),
  };
}

async function inspectTrack(track: InputTrack) {
  if (!track.isVideoTrack() && !track.isAudioTrack()) throw new Error(`Unsupported track type: ${track.type}`);
  const decoderConfig = await track.getDecoderConfig();
  const common = {
    type: track.type,
    codec: await track.getCodec(),
    codecParameterString: await track.getCodecParameterString(),
    internalCodecId: await track.getInternalCodecId(),
    firstTimestamp: await track.getFirstTimestamp(),
    finalTimestamp: await track.computeDuration(),
    metadataDuration: await track.getDurationFromMetadata(),
    timeResolution: await track.getTimeResolution(),
    decoderDescriptionSha256: hashDescription(decoderConfig?.description),
    packets: await inspectPacketIdentity(track),
  };

  if (track.isVideoTrack()) {
    const videoTrack = track as InputVideoTrack;
    return {
      ...common,
      codedWidth: await videoTrack.getCodedWidth(),
      codedHeight: await videoTrack.getCodedHeight(),
      squarePixelWidth: await videoTrack.getSquarePixelWidth(),
      squarePixelHeight: await videoTrack.getSquarePixelHeight(),
      rotation: await videoTrack.getRotation(),
      flip: await videoTrack.getFlip(),
      transformationMatrix: await videoTrack.getTransformationMatrix(),
      colorSpace: await videoTrack.getColorSpace(),
      frameRate: await videoTrack.computeFrameRateMetrics({ targetPacketCount: Infinity }),
    };
  }

  const audioTrack = track as InputAudioTrack;
  return {
    ...common,
    sampleRate: await audioTrack.getSampleRate(),
    numberOfChannels: await audioTrack.getNumberOfChannels(),
  };
}

export async function inspectMedia(filePath: string) {
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(filePath) });
  try {
    const [video, audio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    return {
      path: filePath,
      size: (await stat(filePath)).size,
      mimeType: await input.getMimeType(),
      format: (await input.getFormat()).name,
      duration: await input.computeDuration(),
      video: video ? await inspectTrack(video) : null,
      audio: audio ? await inspectTrack(audio) : null,
      isobmff: await inspectIsobmffTimeline(filePath),
    };
  } finally {
    input.dispose();
  }
}

async function main() {
  if (process.argv[2] === "--inspect") {
    const inspectPath = process.argv[3];
    if (!inspectPath) throw new Error("Usage: npm run benchmark:mediabunny-transmux -- --inspect <media-path>");
    console.log(JSON.stringify(await inspectMedia(inspectPath), null, 2));
    return;
  }
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error("Usage: npm run benchmark:mediabunny-transmux -- <input.mov> [output.mp4] [in-memory|fragmented|off]");
  }
  const outputPath = process.argv[3] ?? join(tmpdir(), `mediabunny-transmux-${process.pid}.mp4`);
  const fastStartOption = process.argv[4] ?? "in-memory";
  if (!(["in-memory", "fragmented", "off"] as const).includes(fastStartOption as "in-memory" | "fragmented" | "off")) {
    throw new Error("Fast-start mode must be in-memory, fragmented, or off.");
  }
  const fastStart = fastStartOption === "off" ? false : fastStartOption as "in-memory" | "fragmented";
  assertSafeOutput(inputPath, outputPath);

  const inputStats = await stat(inputPath);
  if (!inputStats.isFile()) throw new Error("Input is not a regular file.");

  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(inputPath) });
  const format = new Mp4OutputFormat({ fastStart });
  const target = new FilePathTarget(outputPath);
  const output = new Output({ format, target });
  const copyPolicy = { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" } as const;

  let peakRss = process.memoryUsage().rss;
  const memorySampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 2);
  const rssBefore = process.memoryUsage().rss;
  const startedAt = performance.now();
  let conversion: Conversion | null = null;
  try {
    conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim: { start: 0 },
      video: { codec: "avc", allowTransformationMetadata: true },
      audio: { codec: "aac" },
      copy: copyPolicy,
      showWarnings: false,
    });
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      throw new Error(`Forced-copy plan rejected tracks: ${JSON.stringify(conversion.discardedTracks.map((item) => ({
        type: item.track.type,
        reason: item.reason,
      })))}`);
    }
    if (conversion.utilizedTracks.length !== 2) {
      throw new Error(`Expected exactly two utilized tracks, got ${conversion.utilizedTracks.length}.`);
    }
    await conversion.execute();
  } finally {
    clearInterval(memorySampler);
    input.dispose();
  }
  const elapsedMilliseconds = performance.now() - startedAt;
  peakRss = Math.max(peakRss, process.memoryUsage().rss);

  const [source, result] = await Promise.all([inspectMedia(inputPath), inspectMedia(outputPath)]);
  const report = {
    tool: "mediabunny",
    version: "1.57.0",
    sourceName: basename(inputPath),
    outputPath,
    conversion: {
      wallClockMilliseconds: elapsedMilliseconds,
      state: conversion?.state,
      copyPolicy,
      utilizedTrackTypes: conversion?.utilizedTracks.map((track) => track.type) ?? [],
      discardedTracks: conversion?.discardedTracks.map((item) => ({ type: item.track.type, reason: item.reason })) ?? [],
      videoStrategy: "copy",
      audioStrategy: "copy",
      decoderOrEncoderUsed: false,
      proof: "Forced-copy mode rejects every track that would require transcoding; both tracks were utilized and none were discarded.",
    },
    memory: {
      rssBefore,
      peakRss,
      rssIncrease: Math.max(0, peakRss - rssBefore),
      outputMode: `FilePathTarget with MP4 fastStart=${String(fastStart)}`,
    },
    source,
    output: result,
    packetCopyIdentity: {
      videoPayloadEqual: source.video?.packets.payloadSha256 === result.video?.packets.payloadSha256,
      videoTimelineEqual: source.video?.packets.timelineSha256 === result.video?.packets.timelineSha256,
      audioPayloadEqual: source.audio?.packets.payloadSha256 === result.audio?.packets.payloadSha256,
      audioTimelineEqual: source.audio?.packets.timelineSha256 === result.audio?.packets.timelineSha256,
      videoDecoderDescriptionEqual: source.video?.decoderDescriptionSha256 === result.video?.decoderDescriptionSha256,
      audioDecoderDescriptionEqual: source.audio?.decoderDescriptionSha256 === result.audio?.decoderDescriptionSha256,
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

await main();

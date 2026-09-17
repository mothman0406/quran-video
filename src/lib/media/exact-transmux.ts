import {
  ALL_FORMATS,
  BlobSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  NullTarget,
  Output,
  StreamTarget,
  type InputAudioTrack,
  type InputVideoTrack,
  type StreamTargetChunk,
} from "mediabunny";
import type { MediaInspection } from "../media-compatibility.ts";
import { mediaDebug, visibleFileExtension } from "../recognition/media-debug.ts";
import {
  createEphemeralOpfsFile,
  removeEphemeralOpfsFile,
  removeStaleEphemeralOpfsFiles,
  type EphemeralOpfsFile,
} from "./ephemeral-opfs-file.ts";
import { ensureOpfsPlaybackController, hasOpfsPlaybackFeatures, opfsPlaybackUrl, requestOpfsPlaybackDeletion } from "./opfs-playback.ts";
import { editListStartsAtPresentationZero, isTransmuxDurationAccepted } from "./transmux-timeline-validation.ts";

export const MAX_EXACT_TRANSMUX_SOURCE_BYTES = 500 * 1024 * 1024;
export const EXACT_TRANSMUX_STALE_AGE_MS = 24 * 60 * 60 * 1_000;
const COPY_POLICY = { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" } as const;

export type ExactTransmuxReason =
  | "eligible"
  | "browser-playable"
  | "not-video"
  | "source-too-large"
  | "unsupported-environment"
  | "unvalidated-browser"
  | "quota-unavailable"
  | "quota-insufficient"
  | "parse-failed"
  | "unsupported-container"
  | "missing-primary-track"
  | "unsupported-video-codec"
  | "unsupported-audio-codec"
  | "unsupported-metadata"
  | "mp4-playback-unavailable"
  | "forced-copy-rejected"
  | "timeline-validation-failed"
  | "cancelled"
  | "write-failed";

export type ExactTransmuxEligibility = {
  eligible: boolean;
  reason: ExactTransmuxReason;
  sourceContainer: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sourceBytes: number;
  quotaHeadroomBytes: number | null;
  requiredHeadroomBytes: number;
};

export type ExactTransmuxEnvironment = {
  opfsAsyncWritable: boolean;
  serviceWorkerRangePlayback: boolean;
  chromiumValidated: boolean;
  mp4Playback: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  abortCleanupOwned: boolean;
};

export type ExactTransmuxResult = {
  file: File;
  playbackUrl: string;
  temporaryFile: EphemeralOpfsFile;
  outputBytes: number;
  durationSeconds: number;
  elapsedMilliseconds: number;
  videoStrategy: "copy";
  audioStrategy: "copy";
  dispose(): Promise<void>;
};

type TrackFacts = {
  input: Input;
  video: InputVideoTrack;
  audio: InputAudioTrack;
  container: string;
  duration: number;
  videoCodecParameter: string;
  audioCodecParameter: string;
  videoFirstTimestamp: number;
  audioFirstTimestamp: number;
  videoMetadata: Awaited<ReturnType<typeof videoMetadata>>;
  audioMetadata: Awaited<ReturnType<typeof audioMetadata>>;
};

function abortError() { return new DOMException("Media preparation cancelled.", "AbortError"); }
function assertNotAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
function isAbort(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }

export function exactTransmuxRequiredHeadroom(sourceBytes: number): number {
  return Math.ceil(Math.max(sourceBytes * 1.25, sourceBytes + 256 * 1024 * 1024));
}

export function evaluateExactTransmuxEnvironment(
  sourceBytes: number,
  inspection: Pick<MediaInspection, "browserPlayback" | "kind">,
  environment: ExactTransmuxEnvironment,
): Pick<ExactTransmuxEligibility, "eligible" | "reason" | "quotaHeadroomBytes" | "requiredHeadroomBytes"> {
  const requiredHeadroomBytes = exactTransmuxRequiredHeadroom(sourceBytes);
  const quotaHeadroomBytes = environment.quotaBytes === undefined || environment.usageBytes === undefined
    ? null
    : Math.max(0, environment.quotaBytes - environment.usageBytes);
  if (inspection.browserPlayback) return { eligible: false, reason: "browser-playable", quotaHeadroomBytes, requiredHeadroomBytes };
  if (inspection.kind !== "video") return { eligible: false, reason: "not-video", quotaHeadroomBytes, requiredHeadroomBytes };
  if (sourceBytes > MAX_EXACT_TRANSMUX_SOURCE_BYTES) return { eligible: false, reason: "source-too-large", quotaHeadroomBytes, requiredHeadroomBytes };
  if (!environment.opfsAsyncWritable || !environment.serviceWorkerRangePlayback || !environment.abortCleanupOwned) return { eligible: false, reason: "unsupported-environment", quotaHeadroomBytes, requiredHeadroomBytes };
  if (!environment.chromiumValidated) return { eligible: false, reason: "unvalidated-browser", quotaHeadroomBytes, requiredHeadroomBytes };
  if (!environment.mp4Playback) return { eligible: false, reason: "mp4-playback-unavailable", quotaHeadroomBytes, requiredHeadroomBytes };
  if (quotaHeadroomBytes === null) return { eligible: false, reason: "quota-unavailable", quotaHeadroomBytes, requiredHeadroomBytes };
  if (quotaHeadroomBytes < requiredHeadroomBytes) return { eligible: false, reason: "quota-insufficient", quotaHeadroomBytes, requiredHeadroomBytes };
  return { eligible: true, reason: "eligible", quotaHeadroomBytes, requiredHeadroomBytes };
}

function chromiumHasValidatedPath(): boolean {
  const browserNavigator = navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } };
  return browserNavigator.userAgentData?.brands?.some(({ brand }) => /Chrom(?:e|ium)/u.test(brand)) ?? false;
}

async function currentEnvironment(sourceBytes: number, inspection: MediaInspection): Promise<ExactTransmuxEnvironment> {
  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;
  if (hasOpfsPlaybackFeatures()) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    } catch {
      // Missing evidence makes this route ineligible.
    }
  }
  const element = document.createElement("video");
  const codecs = [inspection.videoCodec === "avc" ? "avc1.42E01E" : "", inspection.audioCodec === "aac" ? "mp4a.40.2" : ""].filter(Boolean).join(", ");
  return {
    opfsAsyncWritable: hasOpfsPlaybackFeatures(),
    serviceWorkerRangePlayback: "serviceWorker" in navigator,
    chromiumValidated: chromiumHasValidatedPath(),
    mp4Playback: Boolean(codecs && element.canPlayType(`video/mp4; codecs="${codecs}"`)),
    quotaBytes,
    usageBytes,
    abortCleanupOwned: typeof AbortController !== "undefined" && sourceBytes >= 0,
  };
}

async function videoMetadata(track: InputVideoTrack) {
  const [codedWidth, codedHeight, squarePixelWidth, squarePixelHeight, rotation, flip, transformationMatrix, colorSpace] = await Promise.all([
    track.getCodedWidth(), track.getCodedHeight(), track.getSquarePixelWidth(), track.getSquarePixelHeight(),
    track.getRotation(), track.getFlip(), track.getTransformationMatrix(), track.getColorSpace(),
  ]);
  return { codedWidth, codedHeight, squarePixelWidth, squarePixelHeight, rotation, flip, transformationMatrix, colorSpace };
}

async function audioMetadata(track: InputAudioTrack) {
  const [sampleRate, numberOfChannels] = await Promise.all([track.getSampleRate(), track.getNumberOfChannels()]);
  return { sampleRate, numberOfChannels };
}

function finiteMetadata(facts: TrackFacts): boolean {
  const videoNumbers = [facts.duration, facts.videoFirstTimestamp, facts.audioFirstTimestamp, facts.videoMetadata.codedWidth, facts.videoMetadata.codedHeight, facts.videoMetadata.squarePixelWidth, facts.videoMetadata.squarePixelHeight, ...facts.videoMetadata.transformationMatrix];
  return videoNumbers.every(Number.isFinite)
    && facts.videoMetadata.codedWidth > 0
    && facts.videoMetadata.codedHeight > 0
    && facts.videoMetadata.squarePixelWidth > 0
    && facts.videoMetadata.squarePixelHeight > 0
    && Number.isFinite(facts.audioMetadata.sampleRate)
    && facts.audioMetadata.sampleRate > 0
    && Number.isSafeInteger(facts.audioMetadata.numberOfChannels)
    && facts.audioMetadata.numberOfChannels > 0
    && [0, 90, 180, 270].includes(facts.videoMetadata.rotation)
    && typeof facts.videoMetadata.flip === "boolean"
    && Object.values(facts.videoMetadata.colorSpace).every((value) => value === null || value === undefined || typeof value === "string" || typeof value === "boolean");
}

async function inspectExactSource(file: File): Promise<TrackFacts> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!await input.canRead()) throw new Error("unreadable");
    const [video, audio, format, duration] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(), input.getFormat(), input.computeDuration()]);
    if (!video || !audio) throw new Error("missing-primary-track");
    const [videoCodec, audioCodec, videoCodecParameter, audioCodecParameter, videoFirstTimestamp, audioFirstTimestamp, sourceVideoMetadata, sourceAudioMetadata] = await Promise.all([
      video.getCodec(), audio.getCodec(), video.getCodecParameterString(), audio.getCodecParameterString(), video.getFirstTimestamp(), audio.getFirstTimestamp(), videoMetadata(video), audioMetadata(audio),
    ]);
    if (videoCodec !== "avc" || !videoCodecParameter || !/^avc[13]\./u.test(videoCodecParameter)) throw new Error("unsupported-video-codec");
    if (audioCodec !== "aac" || !audioCodecParameter || !/^mp4a\./u.test(audioCodecParameter)) throw new Error("unsupported-audio-codec");
    const facts = { input, video, audio, container: format.name, duration, videoCodecParameter, audioCodecParameter, videoFirstTimestamp, audioFirstTimestamp, videoMetadata: sourceVideoMetadata, audioMetadata: sourceAudioMetadata };
    if (!/(?:ISO Base Media|ISOBMFF|MP4|QuickTime)/iu.test(format.name)) throw new Error("unsupported-container");
    if (!finiteMetadata(facts)) throw new Error("unsupported-metadata");
    return facts;
  } catch (error) {
    input.dispose();
    throw error;
  }
}

async function forcedCopyPlan(facts: TrackFacts): Promise<boolean> {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new NullTarget() });
  const conversion = await Conversion.init({
    input: facts.input,
    output,
    tracks: "primary",
    trim: { start: 0 },
    video: { codec: "avc", allowTransformationMetadata: true },
    audio: { codec: "aac" },
    copy: COPY_POLICY,
    showWarnings: false,
  });
  const accepted = conversion.isValid
    && conversion.discardedTracks.length === 0
    && conversion.utilizedTracks.length === 2
    && conversion.utilizedTracks.includes(facts.video)
    && conversion.utilizedTracks.includes(facts.audio);
  await conversion.cancel();
  return accepted;
}

function reasonFromError(error: unknown): ExactTransmuxReason {
  if (isAbort(error)) return "cancelled";
  const message = error instanceof Error ? error.message : "";
  if (message === "unsupported-container") return "unsupported-container";
  if (message === "missing-primary-track") return "missing-primary-track";
  if (message === "unsupported-video-codec") return "unsupported-video-codec";
  if (message === "unsupported-audio-codec") return "unsupported-audio-codec";
  if (message === "unsupported-metadata") return "unsupported-metadata";
  return "parse-failed";
}

export async function canExactTransmux(
  source: File,
  inspection: MediaInspection,
  environment?: ExactTransmuxEnvironment,
): Promise<ExactTransmuxEligibility> {
  const env = environment ?? await currentEnvironment(source.size, inspection);
  const base = evaluateExactTransmuxEnvironment(source.size, inspection, env);
  const initial = { ...base, sourceContainer: null, videoCodec: inspection.videoCodec ?? null, audioCodec: inspection.audioCodec ?? null, sourceBytes: source.size };
  if (!base.eligible) return initial;
  let facts: TrackFacts | null = null;
  try {
    facts = await inspectExactSource(source);
    const planAccepted = await forcedCopyPlan(facts);
    if (!planAccepted) return { ...initial, eligible: false, reason: "forced-copy-rejected", sourceContainer: facts.container };
    return { ...initial, eligible: true, reason: "eligible", sourceContainer: facts.container, videoCodec: "avc", audioCodec: "aac" };
  } catch (error) {
    return { ...initial, eligible: false, reason: reasonFromError(error), sourceContainer: facts?.container ?? null };
  } finally {
    facts?.input.dispose();
  }
}

type Box = { type: string; start: number; size: number; headerSize: number; children: Box[] };
const CONTAINER_BOXES = new Set(["moov", "trak", "edts", "mdia"]);

function parseBoxes(bytes: Uint8Array, start = 0, end = bytes.byteLength): Box[] {
  const result: Box[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = start;
  while (position + 8 <= end) {
    let size = view.getUint32(position);
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    let headerSize = 8;
    if (size === 1) {
      const wide = view.getBigUint64(position + 8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(wide); headerSize = 16;
    } else if (size === 0) size = end - position;
    if (size < headerSize || position + size > end) break;
    const children = CONTAINER_BOXES.has(type) ? parseBoxes(bytes, position + headerSize, position + size) : [];
    result.push({ type, start: position, size, headerSize, children });
    position += size;
  }
  return result;
}

async function readMoov(file: File): Promise<Uint8Array> {
  let position = 0;
  while (position + 8 <= file.size) {
    const header = new Uint8Array(await file.slice(position, Math.min(file.size, position + 16)).arrayBuffer());
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let size = view.getUint32(0); let headerSize = 8;
    const type = String.fromCharCode(...header.subarray(4, 8));
    if (size === 1) { size = Number(view.getBigUint64(8)); headerSize = 16; }
    else if (size === 0) size = file.size - position;
    if (!Number.isSafeInteger(size) || size < headerSize || position + size > file.size) throw new Error("Invalid MP4 box structure.");
    if (type === "moov") return new Uint8Array(await file.slice(position, position + size).arrayBuffer());
    position += size;
  }
  throw new Error("MP4 output has no movie metadata.");
}

function child(box: Box, type: string) { return box.children.find((candidate) => candidate.type === type) ?? null; }
function uint64(view: DataView, offset: number) { const value = view.getBigUint64(offset); return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN; }

async function outputEditMediaTimes(file: File): Promise<Map<string, { mediaTimeSeconds: number; segmentDurationSeconds: number }>> {
  const bytes = await readMoov(file);
  const moov = parseBoxes(bytes).find((box) => box.type === "moov");
  if (!moov) throw new Error("MP4 movie box could not be parsed.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const mvhd = child(moov, "mvhd");
  if (!mvhd) throw new Error("MP4 movie timeline is missing.");
  const movieVersion = view.getUint8(mvhd.start + mvhd.headerSize);
  const movieTimescale = view.getUint32(mvhd.start + mvhd.headerSize + (movieVersion === 1 ? 20 : 12));
  const edits = new Map<string, { mediaTimeSeconds: number; segmentDurationSeconds: number }>();
  for (const track of moov.children.filter((box) => box.type === "trak")) {
    const mdia = child(track, "mdia"); const edts = child(track, "edts");
    const mdhd = mdia && child(mdia, "mdhd"); const hdlr = mdia && child(mdia, "hdlr"); const elst = edts && child(edts, "elst");
    if (!mdhd || !hdlr || !elst) throw new Error("MP4 track timeline metadata is incomplete.");
    const mdhdOffset = mdhd.start + mdhd.headerSize; const mdhdVersion = view.getUint8(mdhdOffset);
    const mediaTimescale = view.getUint32(mdhdOffset + (mdhdVersion === 1 ? 20 : 12));
    const handlerOffset = hdlr.start + hdlr.headerSize + 8;
    const handler = String.fromCharCode(...bytes.subarray(handlerOffset, handlerOffset + 4));
    const editOffset = elst.start + elst.headerSize; const editVersion = view.getUint8(editOffset); const count = view.getUint32(editOffset + 4);
    let cursor = editOffset + 8; let selected: { mediaTimeSeconds: number; segmentDurationSeconds: number } | null = null;
    for (let index = 0; index < count; index += 1) {
      const segmentDuration = editVersion === 1 ? uint64(view, cursor) : view.getUint32(cursor);
      const mediaTime = editVersion === 1 ? Number(view.getBigInt64(cursor + 8)) : view.getInt32(cursor + 4);
      if (mediaTime >= 0) selected = { mediaTimeSeconds: mediaTime / mediaTimescale, segmentDurationSeconds: segmentDuration / movieTimescale };
      cursor += editVersion === 1 ? 20 : 12;
    }
    if (!selected) throw new Error("MP4 track has no presentation edit.");
    edits.set(handler, selected);
  }
  return edits;
}

function sameJson(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }

async function validateOutput(file: File, url: string, source: TrackFacts, signal?: AbortSignal): Promise<number> {
  assertNotAborted(signal);
  const output = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const [format, video, audio, duration, edits] = await Promise.all([output.getFormat(), output.getPrimaryVideoTrack(), output.getPrimaryAudioTrack(), output.computeDuration(), outputEditMediaTimes(file)]);
    if (!/(?:MP4|ISO Base Media|ISOBMFF)/iu.test(format.name) || !video || !audio) throw new Error("Output is not a complete MP4.");
    const [videoCodec, audioCodec, videoFirst, audioFirst, outputVideoMetadata, outputAudioMetadata] = await Promise.all([video.getCodec(), audio.getCodec(), video.getFirstTimestamp(), audio.getFirstTimestamp(), videoMetadata(video), audioMetadata(audio)]);
    const videoEdit = edits.get("vide"); const audioEdit = edits.get("soun");
    if (videoCodec !== "avc" || audioCodec !== "aac"
      || !videoEdit || !audioEdit
      || !editListStartsAtPresentationZero(videoFirst, videoEdit.mediaTimeSeconds)
      || !editListStartsAtPresentationZero(audioFirst, audioEdit.mediaTimeSeconds)
      || !isTransmuxDurationAccepted(videoEdit.segmentDurationSeconds, duration)
      || !isTransmuxDurationAccepted(audioEdit.segmentDurationSeconds, duration)
      || !isTransmuxDurationAccepted(duration, source.duration)
      || Math.abs(videoFirst - source.videoFirstTimestamp) > 1e-9
      || Math.abs(audioFirst - source.audioFirstTimestamp) > 1e-9
      || !sameJson(outputVideoMetadata, source.videoMetadata)
      || !sameJson(outputAudioMetadata, source.audioMetadata)) throw new Error("Packet-copy timeline or track metadata changed.");
    const media = document.createElement("video");
    media.preload = "metadata"; media.muted = true;
    const browserDuration = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(() => finish(new Error("Timed out loading temporary media.")), 15_000);
      const onAbort = () => finish(abortError());
      const finish = (error?: Error) => {
        window.clearTimeout(timeout); signal?.removeEventListener("abort", onAbort);
        media.onloadedmetadata = null; media.onerror = null;
        if (error) reject(error); else resolve(media.duration);
      };
      media.onloadedmetadata = () => finish();
      media.onerror = () => finish(new Error("Browser rejected temporary MP4 playback."));
      signal?.addEventListener("abort", onAbort, { once: true });
      media.src = url; media.load();
    });
    media.removeAttribute("src"); media.load();
    if (!isTransmuxDurationAccepted(browserDuration, duration)) throw new Error("Browser and packet timelines disagree.");
    return duration;
  } finally {
    output.dispose();
  }
}

export async function exactTransmuxToOpfs(
  source: File,
  inspection: MediaInspection,
  ownerId: string,
  signal?: AbortSignal,
): Promise<ExactTransmuxResult | null> {
  const eligibility = await canExactTransmux(source, inspection);
  mediaDebug("exact-transmux-eligibility", { ...eligibility });
  if (!eligibility.eligible) return null;
  assertNotAborted(signal);
  let facts: TrackFacts | null = null; let temporaryFile: EphemeralOpfsFile | null = null; let conversion: Conversion | null = null; let writable: FileSystemWritableFileStream | null = null;
  const startedAt = performance.now();
  try {
    await ensureOpfsPlaybackController(signal);
    facts = await inspectExactSource(source);
    const root = await navigator.storage.getDirectory();
    await removeStaleEphemeralOpfsFiles(root, { olderThanMs: EXACT_TRANSMUX_STALE_AGE_MS });
    temporaryFile = await createEphemeralOpfsFile(root, ownerId);
    writable = await temporaryFile.handle.createWritable();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true }) });
    conversion = await Conversion.init({ input: facts.input, output, tracks: "primary", trim: { start: 0 }, video: { codec: "avc", allowTransformationMetadata: true }, audio: { codec: "aac" }, copy: COPY_POLICY, showWarnings: false });
    if (!conversion.isValid || conversion.discardedTracks.length !== 0 || conversion.utilizedTracks.length !== 2 || !conversion.utilizedTracks.includes(facts.video) || !conversion.utilizedTracks.includes(facts.audio)) throw new Error("forced-copy-rejected");
    const cancel = () => { void conversion?.cancel(); };
    signal?.addEventListener("abort", cancel, { once: true });
    mediaDebug("exact-transmux-start", { sourceBytes: source.size, sourceContainer: eligibility.sourceContainer, videoCodec: "avc", audioCodec: "aac" });
    try { await conversion.execute(); } finally { signal?.removeEventListener("abort", cancel); }
    assertNotAborted(signal);
    const outputFile = await temporaryFile.handle.getFile();
    const playbackUrl = opfsPlaybackUrl(temporaryFile.name);
    const durationSeconds = await validateOutput(outputFile, playbackUrl, facts, signal);
    const elapsedMilliseconds = performance.now() - startedAt;
    const owned = temporaryFile;
    let disposed = false;
    const dispose = async () => {
      if (disposed) return;
      disposed = true;
      // The message survives hard page abandonment; the direct delete keeps
      // ordinary replacement/cancellation deterministic in the live page.
      requestOpfsPlaybackDeletion(owned.name);
      await removeEphemeralOpfsFile(owned);
      mediaDebug("exact-transmux-cleanup", { ownerId, reason: "disposed" });
    };
    mediaDebug("exact-transmux-complete", { outputBytes: outputFile.size, durationSeconds, elapsedMilliseconds, route: "exact-transmux", videoStrategy: "copy", audioStrategy: "copy" });
    temporaryFile = null;
    return { file: outputFile, playbackUrl, temporaryFile: owned, outputBytes: outputFile.size, durationSeconds, elapsedMilliseconds, videoStrategy: "copy", audioStrategy: "copy", dispose };
  } catch (error) {
    await conversion?.cancel().catch(() => undefined);
    await writable?.abort().catch(() => undefined);
    await removeEphemeralOpfsFile(temporaryFile).catch(() => undefined);
    const reason: ExactTransmuxReason = isAbort(error) ? "cancelled" : error instanceof DOMException && error.name === "QuotaExceededError" ? "write-failed" : error instanceof Error && /timeline|metadata|MP4|Browser/u.test(error.message) ? "timeline-validation-failed" : "write-failed";
    mediaDebug("exact-transmux-fallback", { reason, sourceBytes: source.size, sourceContainer: visibleFileExtension(source.name) });
    if (isAbort(error)) throw error;
    return null;
  } finally {
    facts?.input.dispose();
  }
}

import type { CaptionSegment } from "./captions.ts";

export type MediaKind = "video" | "audio";

/** Metadata-only durable source. The File and object URL remain browser-local. */
export type MediaSource = ({
  kind: "video";
  hasVideo: true;
  hasAudio: boolean;
} | {
  kind: "audio";
  hasVideo: false;
  hasAudio: true;
}) & {
  fileName: string;
  mimeType: string;
  fileSize?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  fingerprint?: string;
};

export type TimelineTrackKind = "text" | "video" | "audio";

export type TimelineItem = {
  id: string;
  track: TimelineTrackKind;
  startMs: number;
  endMs: number;
  label: string;
  captionSegmentId?: string;
};

export type TimelineTrack = {
  kind: TimelineTrackKind;
  label: "Text" | "Video" | "Audio";
  items: TimelineItem[];
};

export function mediaKindForFile(file: Pick<File, "type">): MediaKind | null {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

export function mediaSourceFromFile(file: Pick<File, "name" | "size" | "type">, kind: MediaKind, metadata?: { durationMs?: number; width?: number; height?: number }): MediaSource {
  const common = {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || `${kind}/*`,
    durationMs: metadata?.durationMs,
    fingerprint: `${file.name}:${file.size}:${file.type}`,
  };
  if (kind === "audio") return { ...common, kind: "audio", hasVideo: false, hasAudio: true };
  return {
    ...common,
    kind: "video",
    width: metadata?.width,
    height: metadata?.height,
    hasVideo: true,
    hasAudio: true,
  };
}

export function projectDurationMs(source: MediaSource | null): number {
  return Math.max(0, Math.round(source?.durationMs ?? 0));
}

export function timeToTimelinePosition(timeMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, timeMs / durationMs));
}

export function timelinePositionToTime(position: number, durationMs: number): number {
  return Math.round(Math.max(0, Math.min(1, position)) * Math.max(0, durationMs));
}

/** Converts a pointer coordinate using the timed-content viewport only. */
export function timelineContentPosition(clientX: number, contentLeftPx: number, contentWidthPx: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(contentLeftPx) || !Number.isFinite(contentWidthPx) || contentWidthPx <= 0) return 0;
  return Math.max(0, Math.min(1, (clientX - contentLeftPx) / contentWidthPx));
}

export function timelineTracks(source: MediaSource | null, segments: readonly CaptionSegment[]): TimelineTrack[] {
  const durationMs = projectDurationMs(source);
  return [
    { kind: "text", label: "Text", items: segments.map((segment) => ({ id: `text:${segment.id}`, track: "text", startMs: segment.startMs, endMs: segment.endMs, label: segment.contentKind === "basmalah-prelude" ? "Basmalah" : segment.verseKeys[0] ?? "Caption", captionSegmentId: segment.id })) },
    { kind: "video", label: "Video", items: source?.hasVideo && durationMs > 0 ? [{ id: "video:source", track: "video", startMs: 0, endMs: durationMs, label: source.fileName || "Video" }] : [] },
    { kind: "audio", label: "Audio", items: source?.hasAudio && durationMs > 0 ? [{ id: "audio:source", track: "audio", startMs: 0, endMs: durationMs, label: source.fileName || "Audio" }] : [] },
  ];
}

export function timelineRulerTicks(durationMs: number, availableWidthPx: number): number[] {
  if (durationMs <= 0) return [0];
  const targetCount = Math.max(2, Math.floor(Math.max(160, availableWidthPx) / 92));
  const targetStep = durationMs / targetCount;
  const steps = [1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000];
  const step = steps.find((candidate) => candidate >= targetStep) ?? steps.at(-1)!;
  const ticks: number[] = [];
  for (let value = 0; value <= durationMs; value += step) ticks.push(value);
  if (ticks.at(-1) !== durationMs) ticks.push(durationMs);
  return ticks;
}

export function formatTimelineClock(timeMs: number): string {
  const seconds = Math.max(0, Math.floor(timeMs / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

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

/** Screen-space threshold keeps caption/playhead snapping stable across zoom. */
export const CAPTION_PLAYHEAD_SNAP_THRESHOLD_PX = 8;
export const TIMELINE_MIN_ZOOM = 1;
export const TIMELINE_MAX_ZOOM = 128;

/** One shared time window for ruler, tracks, playhead, pointer math, and waveform. */
export type TimelineViewport = {
  zoom: number;
  visibleStartMs: number;
  visibleEndMs: number;
};

export function clampTimelineZoom(zoom: number): number {
  return Math.max(TIMELINE_MIN_ZOOM, Math.min(TIMELINE_MAX_ZOOM, Number.isFinite(zoom) ? zoom : TIMELINE_MIN_ZOOM));
}

export function createTimelineViewport(durationMs: number, zoom = TIMELINE_MIN_ZOOM, anchorTimeMs = durationMs / 2): TimelineViewport {
  const duration = Math.max(0, durationMs);
  const safeZoom = clampTimelineZoom(zoom);
  const visibleDuration = duration <= 0 ? 0 : Math.max(1, duration / safeZoom);
  const maxStart = Math.max(0, duration - visibleDuration);
  const start = Math.max(0, Math.min(maxStart, anchorTimeMs - visibleDuration / 2));
  return { zoom: safeZoom, visibleStartMs: start, visibleEndMs: start + visibleDuration };
}

export function clampTimelineViewport(viewport: TimelineViewport, durationMs: number): TimelineViewport {
  const duration = Math.max(0, durationMs);
  const zoom = clampTimelineZoom(viewport.zoom);
  const windowMs = duration <= 0 ? 0 : Math.max(1, duration / zoom);
  const maxStart = Math.max(0, duration - windowMs);
  const visibleStartMs = Math.max(0, Math.min(maxStart, viewport.visibleStartMs));
  return { zoom, visibleStartMs, visibleEndMs: visibleStartMs + windowMs };
}

/** Zooms while retaining the supplied time at the same viewport ratio. */
export function zoomTimelineViewport(viewport: TimelineViewport, durationMs: number, nextZoom: number, anchorTimeMs: number): TimelineViewport {
  const current = clampTimelineViewport(viewport, durationMs);
  const ratio = timeToTimelinePosition(anchorTimeMs, current.visibleEndMs - current.visibleStartMs, current.visibleStartMs);
  const next = createTimelineViewport(durationMs, nextZoom, 0);
  const nextWindow = next.visibleEndMs - next.visibleStartMs;
  return clampTimelineViewport({ ...next, visibleStartMs: anchorTimeMs - ratio * nextWindow }, durationMs);
}

export function panTimelineViewport(viewport: TimelineViewport, durationMs: number, visibleStartMs: number): TimelineViewport {
  return clampTimelineViewport({ ...viewport, visibleStartMs }, durationMs);
}

export function snapCaptionBoundaryToPlayhead(
  boundaryTimeMs: number,
  pointerClientX: number,
  contentLeftPx: number,
  contentWidthPx: number,
  playheadTimeMs: number,
  durationMs: number,
  visibleStartMs = 0,
): { timeMs: number; snapped: boolean } {
  const playheadX = contentLeftPx + timeToTimelinePosition(playheadTimeMs, durationMs, visibleStartMs) * contentWidthPx;
  if (Number.isFinite(pointerClientX) && Math.abs(pointerClientX - playheadX) <= CAPTION_PLAYHEAD_SNAP_THRESHOLD_PX) {
    return { timeMs: playheadTimeMs, snapped: true };
  }
  return { timeMs: boundaryTimeMs, snapped: false };
}

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

export function timeToTimelinePosition(timeMs: number, durationMs: number, startMs = 0): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.max(0, Math.min(1, (timeMs - startMs) / durationMs));
}

export function timelinePositionToTime(position: number, durationMs: number, startMs = 0): number {
  return Math.round(startMs + Math.max(0, Math.min(1, position)) * Math.max(0, durationMs));
}

export function timeToViewportPosition(timeMs: number, viewport: TimelineViewport): number {
  return timeToTimelinePosition(timeMs, viewport.visibleEndMs - viewport.visibleStartMs, viewport.visibleStartMs);
}

export function viewportPositionToTime(position: number, viewport: TimelineViewport): number {
  return timelinePositionToTime(position, viewport.visibleEndMs - viewport.visibleStartMs, viewport.visibleStartMs);
}

/** Returns clipped, shared geometry for captions, video, and audio blocks. */
export function timelineItemGeometry(startMs: number, endMs: number, viewport: TimelineViewport): { left: number; width: number } | null {
  const start = Math.max(startMs, viewport.visibleStartMs);
  const end = Math.min(endMs, viewport.visibleEndMs);
  if (end <= start) return null;
  const left = timeToViewportPosition(start, viewport);
  return { left, width: Math.max(0, timeToViewportPosition(end, viewport) - left) };
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

export function timelineRulerTicks(viewport: TimelineViewport, availableWidthPx: number): number[] {
  const durationMs = Math.max(0, viewport.visibleEndMs - viewport.visibleStartMs);
  if (durationMs <= 0) return [viewport.visibleStartMs];
  const targetCount = Math.max(2, Math.floor(Math.max(160, availableWidthPx) / 92));
  const targetStep = durationMs / targetCount;
  const steps = [10, 20, 50, 100, 200, 500, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000];
  const step = steps.find((candidate) => candidate >= targetStep) ?? steps.at(-1)!;
  const ticks: number[] = [];
  const first = Math.ceil(viewport.visibleStartMs / step) * step;
  for (let value = first; value <= viewport.visibleEndMs; value += step) ticks.push(value);
  if (!ticks.length || ticks[0] !== viewport.visibleStartMs) ticks.unshift(viewport.visibleStartMs);
  if (ticks.at(-1) !== viewport.visibleEndMs) ticks.push(viewport.visibleEndMs);
  return ticks;
}

export function formatTimelineClock(timeMs: number, precise = false): string {
  const seconds = Math.max(0, Math.floor(timeMs / 1_000));
  const base = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return precise ? `${base}.${String(Math.round(timeMs % 1_000)).padStart(3, "0")}` : base;
}

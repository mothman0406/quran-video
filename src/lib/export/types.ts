import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import type { ExportQuality } from "./quality.ts";
import type { MediaTrim } from "../editor/media.ts";
import type { PlaybackRate } from "../editor/playback-rate.ts";

export type ExportPhase = "preparing" | "decoding" | "rendering" | "encoding" | "muxing" | "finalizing";

export type LocalExportDiagnostics = {
  sourceContainer: string;
  sourceVideoCodec: string | null;
  sourceAudioCodec: string | null;
  sourceDurationSeconds: number;
  sourceFps: number;
  targetFps: number;
  sourceHasAudio: boolean;
  outputContainer: "mp4" | "webm";
  outputVideoCodec: "avc" | "vp9";
  outputAudioCodec: "aac" | "opus" | null;
  renderedFrameCount: number;
  expectedFrameCount: number;
  outputDurationSeconds: number;
  outputHasAudio: boolean;
  elapsedSeconds: number;
  effectiveRenderingFps: number;
};

export type LocalExportConfiguration = {
  format: ProjectFormat;
  quality: ExportQuality;
  segments: readonly CaptionSegment[];
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  watermarkRequired: boolean;
  /** Source-time bounds. Omitted legacy snapshots export the full source. */
  mediaTrim?: MediaTrim;
  /** Presentation rate; source caption and word timing remains unchanged. */
  playbackRate: PlaybackRate;
};

export type LocalExportRequest = LocalExportConfiguration & {
  source: File;
  signal?: AbortSignal;
  onProgress?: (progress: { phase: ExportPhase; fraction: number; elapsedSeconds: number; estimatedRemainingSeconds?: number }) => void;
};

export type LocalExportResult = { blob: Blob; fileName: string; mimeType: string; durationSeconds: number; fileSizeBytes: number; playbackRate: PlaybackRate; outputDurationSeconds: number; diagnostics: LocalExportDiagnostics };

/** Browser-owned rendered bytes retained after a local export completes. */
export type CompletedExport = LocalExportResult & {
  objectUrl: string;
  width: number;
  height: number;
  durationMs: number;
  quality: ExportQuality;
  /** Effective watermark state from the server authorization for this exact render. */
  watermarkRequired: boolean;
  completedAt: string;
  projectFingerprint: string;
};

export type LocalExportSupport = { supported: boolean; path: string; reason: string; mimeType?: string };

/** Implementations must remain fully browser-local and never receive a network URL. */
export interface LocalVideoRenderer {
  readonly id: string;
  support(): LocalExportSupport;
  render(request: LocalExportRequest): Promise<LocalExportResult>;
}

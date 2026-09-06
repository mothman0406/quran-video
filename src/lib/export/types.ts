import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import type { ExportQuality } from "./quality.ts";
import type { MediaTrim } from "../editor/media.ts";

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
  segments: readonly CaptionSegment[];
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  watermarkRequired: boolean;
  /** Source-time bounds. Omitted legacy snapshots export the full source. */
  mediaTrim?: MediaTrim;
};

export type LocalExportRequest = LocalExportConfiguration & {
  source: File;
  quality?: ExportQuality;
  signal?: AbortSignal;
  onProgress?: (progress: { phase: ExportPhase; fraction: number; elapsedSeconds: number; estimatedRemainingSeconds?: number }) => void;
};

export type LocalExportResult = { blob: Blob; fileName: string; mimeType: string; durationSeconds: number; fileSizeBytes: number; diagnostics: LocalExportDiagnostics };

export type LocalExportSupport = { supported: boolean; path: string; reason: string; mimeType?: string };

/** Implementations must remain fully browser-local and never receive a network URL. */
export interface LocalVideoRenderer {
  readonly id: string;
  support(): LocalExportSupport;
  render(request: LocalExportRequest): Promise<LocalExportResult>;
}

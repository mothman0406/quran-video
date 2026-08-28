import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";

export type ExportPhase = "preparing" | "rendering" | "finalizing";

export type LocalExportConfiguration = {
  format: ProjectFormat;
  segments: readonly CaptionSegment[];
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
};

export type LocalExportRequest = LocalExportConfiguration & {
  source: File;
  signal?: AbortSignal;
  onProgress?: (progress: { phase: ExportPhase; fraction: number }) => void;
};

export type LocalExportResult = { blob: Blob; fileName: string; mimeType: string };

export type LocalExportSupport = { supported: boolean; path: string; reason: string; mimeType?: string };

/** Implementations must remain fully browser-local and never receive a network URL. */
export interface LocalVideoRenderer {
  readonly id: string;
  support(): LocalExportSupport;
  render(request: LocalExportRequest): Promise<LocalExportResult>;
}

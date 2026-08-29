export type ExportQuality = "draft" | "standard" | "high";

export type ExportQualityPreset = {
  id: ExportQuality;
  label: string;
  description: string;
  videoBitrate: number;
  audioBitrate: number;
};

export const EXPORT_QUALITY_PRESETS: Record<ExportQuality, ExportQualityPreset> = {
  draft: { id: "draft", label: "Draft", description: "Faster previews", videoBitrate: 4_000_000, audioBitrate: 96_000 },
  standard: { id: "standard", label: "Standard", description: "Recommended for social", videoBitrate: 8_000_000, audioBitrate: 160_000 },
  high: { id: "high", label: "High", description: "Best practical 1080p quality", videoBitrate: 14_000_000, audioBitrate: 192_000 },
};

export const DEFAULT_EXPORT_QUALITY: ExportQuality = "standard";

export function exportQualityPreset(quality: ExportQuality): ExportQualityPreset {
  return EXPORT_QUALITY_PRESETS[quality];
}

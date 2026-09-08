import type { ProjectFormat, ProjectFormatPreset } from "../schemas/project.ts";

export type ExportQuality = "basic" | "standard" | "ultra";

export type ExportQualityPreset = {
  id: ExportQuality;
  label: string;
  description: string;
  resolutionLabel: "720p" | "1080p" | "4K";
  watermarkRequired: boolean;
  videoBitrate: number;
  audioBitrate: number;
};

export const EXPORT_QUALITY_PRESETS: Record<ExportQuality, ExportQualityPreset> = {
  basic: { id: "basic", label: "Basic", description: "720p · Watermark", resolutionLabel: "720p", watermarkRequired: true, videoBitrate: 4_000_000, audioBitrate: 96_000 },
  standard: { id: "standard", label: "Standard", description: "1080p · Recommended", resolutionLabel: "1080p", watermarkRequired: false, videoBitrate: 8_000_000, audioBitrate: 160_000 },
  ultra: { id: "ultra", label: "Ultra", description: "4K", resolutionLabel: "4K", watermarkRequired: false, videoBitrate: 32_000_000, audioBitrate: 256_000 },
};

export const DEFAULT_EXPORT_QUALITY: ExportQuality = "standard";

export function exportQualityPreset(quality: ExportQuality): ExportQualityPreset {
  return EXPORT_QUALITY_PRESETS[quality];
}

const EXPORT_DIMENSIONS: Record<ExportQuality, Record<ProjectFormatPreset, readonly [number, number]>> = {
  basic: { vertical: [720, 1280], landscape: [1280, 720], square: [720, 720] },
  standard: { vertical: [1080, 1920], landscape: [1920, 1080], square: [1080, 1080] },
  ultra: { vertical: [2160, 3840], landscape: [3840, 2160], square: [2160, 2160] },
};

/** The one quality ladder used by the editor, preflight, and local renderer. */
export function exportFormatForQuality(format: Pick<ProjectFormat, "preset">, quality: ExportQuality): ProjectFormat {
  const [width, height] = EXPORT_DIMENSIONS[quality][format.preset];
  return { preset: format.preset, width, height };
}

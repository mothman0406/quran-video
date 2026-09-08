import type { LocalExportConfiguration } from "./types.ts";
import { EXPORT_QUALITY_PRESETS, type ExportQuality } from "./quality.ts";

/**
 * Export targets may be entitlement-scaled versions of the editor canvas.
 * Keep this list here, at the renderer boundary, so preflight and rendering
 * agree about every accepted target.
 */
const EXPORT_FORMAT_DIMENSIONS = {
  vertical: [[1080, 1920], [720, 1280]],
  landscape: [[1920, 1080], [1280, 720]],
  square: [[1080, 1080], [720, 720]],
} as const;

export function validateExportProjectFormat(format: LocalExportConfiguration["format"]): string | null {
  const dimensions = EXPORT_FORMAT_DIMENSIONS[format.preset];
  if (!dimensions?.some(([width, height]) => width === format.width && height === format.height)) {
    return "The selected project format is invalid.";
  }
  return null;
}

export function validateExportQuality(quality: ExportQuality | undefined): string | null {
  return !quality || quality in EXPORT_QUALITY_PRESETS ? null : "The selected export quality is invalid.";
}

/** Shared deterministic configuration validation used by preflight and the renderer. */
export function validateExportConfiguration(configuration: LocalExportConfiguration, quality?: ExportQuality): string[] {
  const errors: string[] = [];
  const formatError = validateExportProjectFormat(configuration.format);
  if (formatError) errors.push(formatError);
  const qualityError = validateExportQuality(quality);
  if (qualityError) errors.push(qualityError);
  if (configuration.segments.length === 0) errors.push("Add at least one caption segment before exporting.");
  if (configuration.segments.some((segment) => !segment.arabic.trim() || segment.endMs <= segment.startMs || segment.startMs < 0)) errors.push("Caption timings are invalid. Check the segment timeline and try again.");
  return errors;
}

export function validateLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration, quality?: ExportQuality): string[] {
  const errors: string[] = [];
  if (!source || source.size <= 0 || !(source.type.startsWith("video/") || source.type.startsWith("audio/"))) errors.push("Choose a non-empty local video or audio file.");
  return [...errors, ...validateExportConfiguration(configuration, quality)];
}

export function assertValidLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration, quality?: ExportQuality): void {
  const errors = validateLocalExportInputs(source, configuration, quality);
  if (errors.length) throw new Error(errors[0]);
}

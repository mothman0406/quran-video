import type { LocalExportConfiguration } from "./types.ts";
import { EXPORT_QUALITY_PRESETS, exportFormatForQuality, type ExportQuality } from "./quality.ts";

/** Shared quality-ladder validation at the renderer boundary. */
export function validateExportProjectFormat(format: LocalExportConfiguration["format"]): string | null {
  const valid = (Object.keys(EXPORT_QUALITY_PRESETS) as ExportQuality[]).some((quality) => {
    const expected = exportFormatForQuality(format, quality);
    return format.width === expected.width && format.height === expected.height;
  });
  if (!valid) {
    return "The selected project format is invalid.";
  }
  return null;
}

export function validateExportQuality(quality: ExportQuality | undefined): string | null {
  return !quality || quality in EXPORT_QUALITY_PRESETS ? null : "The selected export quality is invalid.";
}

/** Shared deterministic configuration validation used by preflight and the renderer. */
export function validateExportConfiguration(configuration: LocalExportConfiguration): string[] {
  const errors: string[] = [];
  const formatError = validateExportProjectFormat(configuration.format);
  if (formatError) errors.push(formatError);
  const qualityError = validateExportQuality(configuration.quality);
  if (qualityError) errors.push(qualityError);
  if (!formatError && !qualityError) {
    const expected = exportFormatForQuality(configuration.format, configuration.quality);
    if (configuration.format.width !== expected.width || configuration.format.height !== expected.height) errors.push("The selected quality does not match the requested export dimensions.");
  }
  if (configuration.segments.length === 0) errors.push("Add at least one caption segment before exporting.");
  if (configuration.segments.some((segment) => !segment.arabic.trim() || segment.endMs <= segment.startMs || segment.startMs < 0)) errors.push("Caption timings are invalid. Check the segment timeline and try again.");
  return errors;
}

export function validateLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration): string[] {
  const errors: string[] = [];
  if (!source || source.size <= 0 || !(source.type.startsWith("video/") || source.type.startsWith("audio/"))) errors.push("Choose a non-empty local video or audio file.");
  return [...errors, ...validateExportConfiguration(configuration)];
}

export function assertValidLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration): void {
  const errors = validateLocalExportInputs(source, configuration);
  if (errors.length) throw new Error(errors[0]);
}

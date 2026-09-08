import { PROJECT_FORMATS } from "../editor/formats.ts";
import type { LocalExportConfiguration } from "./types.ts";

export function validateLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration): string[] {
  const errors: string[] = [];
  if (!source || source.size <= 0 || !(source.type.startsWith("video/") || source.type.startsWith("audio/"))) errors.push("Choose a non-empty local video or audio file.");
  const format = PROJECT_FORMATS[configuration.format.preset];
  if (!format || format.width !== configuration.format.width || format.height !== configuration.format.height) errors.push("The selected project format is invalid.");
  if (configuration.segments.length === 0) errors.push("Add at least one caption segment before exporting.");
  if (configuration.segments.some((segment) => !segment.arabic.trim() || segment.endMs <= segment.startMs || segment.startMs < 0)) errors.push("Caption timings are invalid. Check the segment timeline and try again.");
  return errors;
}

export function assertValidLocalExportInputs(source: File | null | undefined, configuration: LocalExportConfiguration): void {
  const errors = validateLocalExportInputs(source, configuration);
  if (errors.length) throw new Error(errors[0]);
}

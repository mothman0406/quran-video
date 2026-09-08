import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import type { LocalExportConfiguration } from "./types.ts";
import type { MediaTrim } from "../editor/media.ts";
import { resolvePlaybackRate, type PlaybackRate } from "../editor/playback-rate.ts";
import { DEFAULT_EXPORT_QUALITY, exportFormatForQuality, exportQualityPreset, type ExportQuality } from "./quality.ts";

export function createLocalExportConfiguration(input: {
  format: ProjectFormat;
  segments: readonly CaptionSegment[];
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  mediaTrim?: MediaTrim;
  playbackRate?: PlaybackRate;
  quality?: ExportQuality;
}): LocalExportConfiguration {
  const quality = input.quality ?? DEFAULT_EXPORT_QUALITY;
  // Safe-area guides and editor controls deliberately have no export representation.
  return {
    format: exportFormatForQuality(input.format, quality),
    quality,
    segments: input.segments.map((segment) => ({ ...segment, verseKeys: [...segment.verseKeys], ...(segment.wordTimings ? { wordTimings: segment.wordTimings.map((timing) => ({ ...timing })) } : {}), ...(segment.styleOverrides ? { styleOverrides: JSON.parse(JSON.stringify(segment.styleOverrides)) } : {}), timingEvidence: { ...segment.timingEvidence, start: { ...segment.timingEvidence.start }, end: { ...segment.timingEvidence.end } } })),
    typography: { ...input.typography },
    captionBackground: { ...input.captionBackground },
    positioning: { ...input.positioning },
    transitionSettings: { ...input.transitionSettings },
    showVerseNumber: input.showVerseNumber,
    watermarkRequired: exportQualityPreset(quality).watermarkRequired,
    playbackRate: resolvePlaybackRate(input.playbackRate),
    ...(input.mediaTrim ? { mediaTrim: { ...input.mediaTrim } } : {}),
  };
}

/** Creates the immutable render snapshot used by an export job. */
export const snapshotLocalExportConfiguration = createLocalExportConfiguration;

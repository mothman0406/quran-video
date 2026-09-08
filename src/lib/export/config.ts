import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import type { LocalExportConfiguration } from "./types.ts";
import { exportFormatForPlan, getPlanEntitlements, type Plan } from "../entitlements.ts";
import type { MediaTrim } from "../editor/media.ts";
import { resolvePlaybackRate, type PlaybackRate } from "../editor/playback-rate.ts";

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
  plan?: Plan;
}): LocalExportConfiguration {
  const entitlements = getPlanEntitlements(input.plan ?? "Free");
  // Safe-area guides and editor controls deliberately have no export representation.
  return {
    format: exportFormatForPlan(entitlements.plan, input.format),
    segments: input.segments.map((segment) => ({ ...segment, verseKeys: [...segment.verseKeys], ...(segment.wordTimings ? { wordTimings: segment.wordTimings.map((timing) => ({ ...timing })) } : {}), ...(segment.styleOverrides ? { styleOverrides: JSON.parse(JSON.stringify(segment.styleOverrides)) } : {}), timingEvidence: { ...segment.timingEvidence, start: { ...segment.timingEvidence.start }, end: { ...segment.timingEvidence.end } } })),
    typography: { ...input.typography },
    captionBackground: { ...input.captionBackground },
    positioning: { ...input.positioning },
    transitionSettings: { ...input.transitionSettings },
    showVerseNumber: input.showVerseNumber,
    watermarkRequired: entitlements.watermarkRequired,
    playbackRate: resolvePlaybackRate(input.playbackRate),
    ...(input.mediaTrim ? { mediaTrim: { ...input.mediaTrim } } : {}),
  };
}

/** Creates the immutable render snapshot used by an export job. */
export const snapshotLocalExportConfiguration = createLocalExportConfiguration;

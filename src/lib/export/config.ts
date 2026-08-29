import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "../editor/captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import type { LocalExportConfiguration } from "./types.ts";

export function createLocalExportConfiguration(input: {
  format: ProjectFormat;
  segments: readonly CaptionSegment[];
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
}): LocalExportConfiguration {
  // Safe-area guides and editor controls deliberately have no export representation.
  return {
    format: { ...input.format },
    segments: input.segments.map((segment) => ({ ...segment, verseKeys: [...segment.verseKeys], timingEvidence: { ...segment.timingEvidence, start: { ...segment.timingEvidence.start }, end: { ...segment.timingEvidence.end } } })),
    typography: { ...input.typography },
    captionBackground: { ...input.captionBackground },
    positioning: { ...input.positioning },
    transitionSettings: { ...input.transitionSettings },
    showVerseNumber: input.showVerseNumber,
  };
}

/** Creates the immutable render snapshot used by an export job. */
export const snapshotLocalExportConfiguration = createLocalExportConfiguration;

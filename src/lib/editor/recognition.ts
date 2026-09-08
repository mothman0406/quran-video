import type { RecognitionMatch } from "../recognition/core.ts";
import { getActiveCaptionSegment } from "./captions.ts";

export type VerseAlignment = {
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  startMs: number;
  endMs: number;
  confidence: number;
  timingEvidence: RecognitionMatch["timing"];
};

export type { CaptionSegment } from "@/lib/editor/captions";

/**
 * Keeps automatic recognition tied to an accepted source, rather than a React
 * render. A source can therefore become ready in several renders without
 * launching duplicate model work, while a genuinely new source gets one run.
 */
export class AutomaticRecognitionController {
  private readonly startedSources = new Set<string>();

  start(sourceIdentity: string, restoredCompletedRecognition: boolean): boolean {
    if (!sourceIdentity || restoredCompletedRecognition || this.startedSources.has(sourceIdentity)) return false;
    this.startedSources.add(sourceIdentity);
    return true;
  }

  reset() {
    this.startedSources.clear();
  }
}

export function recognitionToVerseAlignments(matches: readonly RecognitionMatch[]): VerseAlignment[] {
  return matches.map((match) => {
    const [surahNumber, ayahNumber] = match.verseKey.split(":").map(Number);
    return {
      verseKey: match.verseKey,
      surahNumber,
      ayahNumber,
      startMs: match.startMs,
      endMs: match.endMs,
      confidence: match.confidence,
      timingEvidence: match.timing,
    };
  });
}

export function captionForPlaybackTime<T extends { startMs: number; endMs: number }>(
  captions: readonly T[],
  timeMs: number,
): T | null {
  return getActiveCaptionSegment(captions, timeMs);
}

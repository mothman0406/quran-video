import type { RecognitionMatch } from "@/lib/recognition/core";

export type VerseAlignment = {
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  startMs: number;
  endMs: number;
  confidence: number;
  timingEvidence: RecognitionMatch["timing"];
};

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
  return captions.find((caption) => timeMs >= caption.startMs && timeMs < caption.endMs) ?? null;
}

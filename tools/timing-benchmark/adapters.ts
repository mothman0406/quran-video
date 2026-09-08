import type { FastConformerResult } from "../../src/lib/recognition/local-fastconformer.ts";
import type { WordTimingResult } from "./types.ts";

/** Maps the unmodified production FastConformer result into the dev benchmark contract. */
export function fastconformerCurrentAdapter(fixtureId: string, result: FastConformerResult): WordTimingResult {
  return {
    fixtureId,
    engineId: "fastconformer-current",
    words: result.alignment.words.map((word) => ({
      verseKey: word.verseKey,
      canonicalWordIndex: word.canonicalWordIndex,
      canonicalArabic: word.canonicalArabic,
      startMs: word.startMs,
      endMs: word.endMs,
      confidence: word.confidence,
      alignmentScore: word.alignmentScore,
    })),
    runtime: {
      totalMs: result.performance.totalMs,
      inferencePasses: 1,
      modelBytes: result.performance.modelArtifactBytes,
    },
    diagnostics: {
      status: result.status,
      frameCount: result.frameCount,
      frameDurationMs: result.frameDurationMs,
      blankTokenId: result.blankId,
      normalizedPathScore: result.alignment.normalizedPathScore,
      modelRevision: result.modelRevision,
    },
  };
}

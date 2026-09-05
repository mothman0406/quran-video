import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTranscript, createPrimaryTranscript, hafsVerses, type TranscriptChunk } from "../src/lib/recognition/core.ts";
import type { FastConformerResult } from "../src/lib/recognition/local-fastconformer.ts";

const keys = ["93:1", "93:2"];
const verse = (key: string) => hafsVerses.find((item) => item.verseKey === key)!;
const primary = createPrimaryTranscript(keys.map((key, index): TranscriptChunk => ({ startMs: index * 8_000, endMs: (index + 1) * 8_000, text: verse(key).text })), "chunk-fallback");

function result(timings: Array<[string, number, number]>, overrides: Partial<FastConformerResult> = {}): FastConformerResult {
  const words = timings.map(([verseKey, startMs], index) => ({ verseKey, canonicalWordIndex: 1, globalWordIndex: index + 1, canonicalArabic: "word", alignmentText: "word", startMs, endMs: startMs + 100, confidence: 0.5, alignmentScore: -1, lowConfidence: false }));
  return {
    status: "complete", tilawaRelease: "test", modelRevision: "test", vocabRevision: "test", tokenTableRevision: "test", blankId: 1024, vocabSize: 1025, targetValidation: [], targetTokenMapping: [],
    optionalPrelude: { available: true, lexicalText: "بسم الله الرحمن الرحيم", tokenIds: [1], candidateWithoutPreludeScore: -1, candidateWithPreludeScore: -2, selected: "absent", startMs: null, endMs: null }, firstCanonicalTokenFrame: 31, firstCanonicalWordStartMs: timings[0]?.[1] ?? null,
    upstreamTilawaResult: null, upstreamTilawaDetectedPassage: null, upstreamTilawaConfidence: null, detectedRange: { startVerseKey: timings[0]?.[0] ?? "", endVerseKey: timings.at(-1)?.[0] ?? "", source: "known-canonical-passage" }, forcedAlignmentMeanScore: 0.5, greedyTranscript: "", frameCount: 307, frameDurationMs: 80, combinedTargetTokenCount: 10, alignmentComplete: true,
    ayahTimings: timings.map(([verseKey, startMs, endMs]) => ({ verseKey, startMs, endMs, acousticScore: -1 })), rawLogits: { frames: 307, vocabularySize: 1025, blankTokenId: 1024, frameDurationMs: 80 }, alignment: { status: "complete", canonicalWords: [], targetTokens: [], words, verses: timings.map(([verseKey, startMs, endMs]) => ({ verseKey, startMs, endMs, confidence: 0.5 })), pauses: [], audibleRepetitions: [], frameCount: 307, frameDurationMs: 80 }, performance: { modelArtifactBytes: 1, supportingAssetBytes: 1, modelDownloadBytes: 0, cacheStatus: "memory", totalMs: 1 }, ...overrides,
  };
}

function analyze(fastConformerResult: FastConformerResult | null) {
  return analyzeTranscript(primary, { audioAnalysis: { durationMs: 30_000, sampleRate: 16_000, windowMs: 10, rms: [] }, fastConformerResult });
}

test("FastConformer is the sole authoritative automatic timing engine", () => {
  const analysis = analyze(result([["93:1", 1_631, 3_070], ["93:2", 3_070, 5_948]]));
  assert.equal(analysis.authoritativeTimingEngine?.engine, "fastconformer");
  assert.equal(analysis.timingFailure, null);
  assert.deepEqual(analysis.verseBoundaries.map((item) => [item.verseKey, item.startMs, item.endMs]), [["93:1", 1_631, 3_070], ["93:2", 3_070, 5_948]]);
});

test("FastConformer structural failure is typed and recoverable, with no fallback captions", () => {
  const analysis = analyze(result([], { status: "unavailable", alignmentComplete: false, rawLogits: null, frameCount: null, ayahTimings: [], alignment: { status: "unavailable", reason: "asset failure", canonicalWords: [], targetTokens: [], words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 } }));
  assert.equal(analysis.authoritativeTimingEngine, null);
  assert.deepEqual(analysis.verseBoundaries, []);
  assert.deepEqual(analysis.timingFailure && { stage: analysis.timingFailure.stage, engine: analysis.timingFailure.engine, recoverable: analysis.timingFailure.recoverable }, { stage: "quran-timing", engine: "fastconformer", recoverable: true });
});

import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTranscript, createPrimaryTranscript, hafsVerses, type RecognitionAnalysis, type TranscriptChunk } from "../src/lib/recognition/core.ts";
import type { CtcForcedAlignmentResult } from "../src/lib/recognition/ctc-forced-alignment.ts";
import type { FastConformerShadowResult } from "../src/lib/recognition/local-fastconformer.ts";
import { createCaptionSegmentsFromVerseBoundaries, getActiveCaptionSegment, updateCaptionSegmentTiming } from "../src/lib/editor/captions.ts";
import { createLocalExportConfiguration } from "../src/lib/export/config.ts";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";

const keys = ["93:1", "93:2"];
const verse = (key: string) => hafsVerses.find((item) => item.verseKey === key)!;
const transcript: TranscriptChunk[] = keys.map((key, index) => ({
  startMs: index * 8_000,
  endMs: (index + 1) * 8_000,
  text: verse(key).text,
  words: verse(key).text.split(/\s+/u).filter(Boolean).map((text, wordIndex) => ({ text, startMs: index * 8_000 + wordIndex * 300, endMs: index * 8_000 + wordIndex * 300 + 250 })),
}));
const primary = createPrimaryTranscript(transcript, "word");
const content = Object.fromEntries(keys.map((key) => [key, { arabic: { uthmani: verse(key).text }, translation: null, transliteration: null }]));

function fastConformer(timings: Array<[string, number, number]>, overrides: Partial<FastConformerShadowResult> = {}): FastConformerShadowResult {
  const words = timings.map(([verseKey, startMs], index) => ({
    verseKey,
    canonicalWordIndex: 1,
    globalWordIndex: index + 1,
    canonicalArabic: verse(verseKey).text.split(/\s+/u)[0]!,
    alignmentText: "word",
    startMs,
    endMs: startMs + 100,
    confidence: 0.01,
    alignmentScore: -4,
    lowConfidence: true,
  }));
  return {
    status: "complete",
    tilawaRelease: "test",
    modelRevision: "test",
    vocabRevision: "test",
    tokenTableRevision: "test",
    blankId: 1024,
    vocabSize: 1025,
    targetValidation: [],
    targetTokenMapping: [],
    optionalPrelude: { available: true, lexicalText: "بسم الله الرحمن الرحيم", tokenIds: [1], candidateWithoutPreludeScore: -1, candidateWithPreludeScore: -2, selected: "absent", startMs: null, endMs: null },
    firstCanonicalTokenFrame: 31,
    firstCanonicalWordStartMs: timings[0]?.[1] ?? null,
    upstreamTilawaResult: null,
    upstreamTilawaDetectedPassage: null,
    upstreamTilawaConfidence: null,
    detectedRange: { startVerseKey: timings[0]?.[0] ?? "", endVerseKey: timings.at(-1)?.[0] ?? "", source: "known-canonical-passage" },
    forcedAlignmentMeanScore: 0.0094,
    greedyTranscript: "",
    frameCount: 307,
    frameDurationMs: 79.7394,
    combinedTargetTokenCount: 10,
    alignmentComplete: true,
    ayahTimings: timings.map(([verseKey, startMs, endMs]) => ({ verseKey, startMs, endMs, acousticScore: -4 })),
    rawLogits: { frames: 307, vocabularySize: 1025, blankTokenId: 1024, frameDurationMs: 79.7394 },
    alignment: {
      status: "complete",
      canonicalWords: [],
      targetTokens: [],
      words,
      verses: timings.map(([verseKey, startMs, endMs]) => ({ verseKey, startMs, endMs, confidence: 0.01 })),
      pauses: [],
      audibleRepetitions: [],
      frameCount: 307,
      frameDurationMs: 79.7394,
    },
    performance: { modelArtifactBytes: 1, supportingAssetBytes: 1, modelDownloadBytes: 0, cacheStatus: "memory", totalMs: 1 },
    ...overrides,
  };
}

function dartenDisagreement(): CtcForcedAlignmentResult {
  return {
    status: "complete",
    canonicalWords: [],
    targetTokens: [],
    words: [],
    verses: [{ verseKey: "93:1", startMs: 7_000, endMs: 12_000, confidence: 0.9 }, { verseKey: "93:2", startMs: 12_000, endMs: 16_000, confidence: 0.9 }],
    pauses: [], audibleRepetitions: [], frameCount: 1, frameDurationMs: 1,
  };
}

function analyzeWith(fastConformerResult: FastConformerShadowResult | null): RecognitionAnalysis {
  return analyzeTranscript(primary, {
    audioAnalysis: { durationMs: 30_000, sampleRate: 16_000, windowMs: 10, rms: [] },
    ctcAlignment: dartenDisagreement(),
    fastConformerResult,
  });
}

test("production analysis promotes a structurally valid FastConformer result over legacy word timing and Darten", () => {
  const result = analyzeWith(fastConformer([["93:1", 1_631, 3_070], ["93:2", 3_070, 5_948]]));

  assert.equal(result.authoritativeTimingEngine.engine, "fastconformer");
  assert.equal(result.authoritativeTimingEngine.fallbackUsed, false);
  assert.equal(result.authoritativeTimingEngine.structuralValidation.valid, true);
  assert.deepEqual(result.verseBoundaries.map((item) => [item.verseKey, item.startMs, item.endMs, item.evidence.source]), [
    ["93:1", 1_631, 3_070, "fastconformer"], ["93:2", 3_070, 5_948, "fastconformer"],
  ]);
  assert.notEqual(result.forcedAlignment?.verseTimings[0]?.startMs, 1_631, "legacy word timestamps remain diagnostic and cannot veto FastConformer");
  assert.equal(result.ctcShadow?.verses[0]?.startMs, 7_000, "Darten disagreement remains diagnostic only");
  assert.equal(result.matches[0]?.startMs, 1_631);
  assert.equal(result.matches[1]?.startMs, 3_070);
});

test("unavailable or structurally incomplete FastConformer uses the legacy fallback with its exact reason", () => {
  const unavailable = analyzeWith(fastConformer([], { status: "unavailable", alignmentComplete: false, rawLogits: null, frameCount: null, ayahTimings: [], alignment: { status: "unavailable", reason: "asset failure", canonicalWords: [], targetTokens: [], words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 } }));
  assert.equal(unavailable.authoritativeTimingEngine.engine, "legacy-fallback");
  assert.match(unavailable.authoritativeTimingEngine.fallbackReason ?? "", /status is unavailable/);

  const incomplete = analyzeWith(fastConformer([["93:1", 1_631, 3_070]], { alignmentComplete: false }));
  assert.equal(incomplete.authoritativeTimingEngine.engine, "legacy-fallback");
  assert.match(incomplete.authoritativeTimingEngine.fallbackReason ?? "", /incomplete|exactly cover/i);
});

test("optional absent prelude keeps ayah one at the canonical word, applies the crop/frame offset once, and never repairs by one millisecond", () => {
  const result = analyzeWith(fastConformer([["93:1", 2_496, 9_194], ["93:2", 9_194, 14_537]]));
  assert.equal(result.authoritativeTimingEngine.engine, "fastconformer");
  assert.equal(result.verseBoundaries[0]?.startMs, 2_496);
  assert.equal(result.verseBoundaries[1]?.startMs, 9_194);
  assert.equal(result.verseBoundaries[0]?.endMs, result.verseBoundaries[1]?.startMs);
  assert.ok(result.verseBoundaries.every((boundary) => boundary.endMs - boundary.startMs > 1));
});

test("the selected CaptionSegment array is shared by preview, timeline, export, and remains editable after automatic generation", () => {
  const result = analyzeWith(fastConformer([["93:1", 1_631, 3_070], ["93:2", 3_070, 5_948]]));
  const generated = createCaptionSegmentsFromVerseBoundaries(result.verseBoundaries, content as never);
  const edited = updateCaptionSegmentTiming(generated, "93:1#1", { endMs: 3_020 }, 30_000);
  const exportSnapshot = createLocalExportConfiguration({
    format: DEFAULT_PROJECT_FORMAT, segments: edited, typography: DEFAULT_TYPOGRAPHY, captionBackground: DEFAULT_CAPTION_BACKGROUND,
    positioning: DEFAULT_CAPTION_POSITIONING, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false,
  });
  assert.equal(getActiveCaptionSegment(edited, 3_019)?.id, "93:1#1");
  assert.equal(getActiveCaptionSegment(edited, 3_020)?.id, undefined);
  assert.deepEqual(exportSnapshot.segments.map((segment) => [segment.id, segment.startMs, segment.endMs]), edited.map((segment) => [segment.id, segment.startMs, segment.endMs]));
  assert.equal(edited[0]?.endMs, 3_020, "a later automatic result is a separate generated array and does not overwrite this manual edit");
});

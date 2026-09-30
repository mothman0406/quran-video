import assert from "node:assert/strict";
import test from "node:test";
import { forceAlignCtc, type CtcCanonicalWord, type CtcFrameLogits, type CtcTargetToken } from "../src/lib/recognition/ctc-forced-alignment.ts";
import { refineQuranOuterTiming } from "../src/lib/recognition/quran-outer-timing-refinement.ts";

const BLANK = 0;

function canonical(count = 5) {
  const words: CtcCanonicalWord[] = [];
  const tokens: CtcTargetToken[] = [];
  for (let index = 0; index < count; index += 1) {
    const globalWordIndex = index + 1;
    words.push({
      verseKey: index < Math.ceil(count / 2) ? "1:1" : "1:2",
      canonicalWordIndex: globalWordIndex,
      globalWordIndex,
      canonicalArabic: `w${globalWordIndex}`,
      alignmentText: `w${globalWordIndex}`,
    });
    tokens.push({ tokenId: globalWordIndex, token: `t${globalWordIndex}`, globalWordIndex, owner: "canonical" });
  }
  return { words, tokens };
}

function logits(events: Readonly<Record<number, number>>, frames = 100, vocabularySize = 16): CtcFrameLogits {
  const values = new Float32Array(frames * vocabularySize).fill(-8);
  for (let frame = 0; frame < frames; frame += 1) {
    values[frame * vocabularySize + BLANK] = 8;
    const token = events[frame];
    if (token === undefined) continue;
    values[frame * vocabularySize + BLANK] = -8;
    values[frame * vocabularySize + token] = 8;
  }
  return { values, frames, vocabularySize };
}

function refine(input: {
  events: Readonly<Record<number, number>>;
  localizedStartMs?: number;
  localizedEndMs?: number;
  speechStartMs?: number;
  speechEndMs?: number;
  count?: number;
}) {
  const target = canonical(input.count);
  return refineQuranOuterTiming({
    localizedStartMs: input.localizedStartMs ?? 3_000,
    localizedEndMs: input.localizedEndMs ?? 7_000,
    audioStartMs: 0,
    audioEndMs: 10_000,
    logits: logits(input.events),
    canonicalWords: target.words,
    targetTokens: target.tokens,
    blankTokenId: BLANK,
    speechRegions: [{
      startMs: input.speechStartMs ?? 0,
      endMs: input.speechEndMs ?? 10_000,
      durationMs: (input.speechEndMs ?? 10_000) - (input.speechStartMs ?? 0),
      confidence: 1,
    }],
  });
}

const COMPLETE_EVENTS = { 5: 1, 15: 2, 45: 3, 75: 4, 85: 5 } as const;

test("accepted canonical prefix and suffix evidence refine earlier onset and later completion", () => {
  const result = refine({ events: COMPLETE_EVENTS });
  assert.equal(result.acceptedCanonicalIdentityUnchanged, true);
  assert.equal(result.intervalStartMs, 0);
  assert.equal(result.intervalEndMs, 10_000);
  assert.equal(result.start.reason, "expanded-canonical-boundary");
  assert.equal(result.end.reason, "expanded-canonical-boundary");
  assert.ok((result.start.proof?.likelihoodDifference ?? 0) > 0);
  assert.ok((result.end.proof?.likelihoodDifference ?? 0) > 0);
  assert.ok((result.start.proof?.orderedGreedyCanonicalMatches ?? 0) >= 2);
  assert.ok((result.end.proof?.orderedGreedyCanonicalMatches ?? 0) >= 2);
});

test("leading and trailing canonical blank continuation is admitted only after canonical proof", () => {
  const result = refine({ events: COMPLETE_EVENTS });
  assert.equal(result.start.proof?.blankOrRepeatContinuationApplied, true);
  assert.equal(result.end.proof?.blankOrRepeatContinuationApplied, true);
  assert.ok((result.start.proof?.blankContinuationFrames ?? 0) > 0);
  assert.ok((result.end.proof?.blankContinuationFrames ?? 0) > 0);
});

test("VAD-positive blank, silence, music, noise, and generic activity cannot expand by themselves", () => {
  const result = refine({ events: { 35: 1, 45: 2, 55: 3, 65: 4, 68: 5 } });
  assert.equal(result.intervalStartMs, 3_000);
  assert.equal(result.intervalEndMs, 7_000);
  assert.equal(result.start.expanded, false);
  assert.equal(result.end.expanded, false);
});

test("unrelated speech and adjacent-ayah tokens cannot become accepted outer timing", () => {
  const unrelated = refine({ events: { 5: 9, 15: 10, 35: 1, 45: 2, 55: 3, 65: 4, 75: 9, 85: 10 } });
  assert.equal(unrelated.start.expanded, false);
  assert.equal(unrelated.end.expanded, false);
  assert.ok((unrelated.start.proof?.orderedGreedyCanonicalMatches ?? 0) < 2);
  assert.ok((unrelated.end.proof?.orderedGreedyCanonicalMatches ?? 0) < 2);
});

test("refinement never contracts already proven timing and leaves evidence-complete Case A-shaped edges unchanged", () => {
  const result = refine({
    events: COMPLETE_EVENTS,
    localizedStartMs: 0,
    localizedEndMs: 10_000,
  });
  assert.equal(result.intervalStartMs, 0);
  assert.equal(result.intervalEndMs, 10_000);
  assert.equal(result.start.reason, "already-at-evidence-limit");
  assert.equal(result.end.reason, "already-at-evidence-limit");
  assert.ok(result.intervalStartMs <= result.start.localizedBoundaryMs);
  assert.ok(result.intervalEndMs >= result.end.localizedBoundaryMs);
});

test("long first and last ayahs use only the accepted canonical target without changing identity", () => {
  const events = Object.fromEntries(Array.from({ length: 14 }, (_, index) => [4 + index * 7, index + 1]));
  const result = refine({ events, localizedStartMs: 2_000, localizedEndMs: 8_000, count: 14 });
  assert.equal(result.acceptedCanonicalIdentityUnchanged, true);
  assert.equal(result.intervalStartMs, 0);
  assert.equal(result.intervalEndMs, 10_000);
  assert.ok((result.start.proof?.targetTokenCount ?? 0) >= 2);
  assert.ok((result.end.proof?.targetTokenCount ?? 0) >= 2);
});

test("wider evidence resolves forced final-word compression while stable interior timing remains acoustic", () => {
  const target = canonical();
  const source = logits(COMPLETE_EVENTS);
  const oldSlice = {
    values: source.values.slice(30 * source.vocabularySize, 70 * source.vocabularySize),
    frames: 40,
    vocabularySize: source.vocabularySize,
  };
  const oldAlignment = forceAlignCtc(target.words, target.tokens, oldSlice, {
    blankTokenId: BLANK,
    startMs: 3_000,
    endMs: 7_000,
    finalSpeechEndMs: 7_000,
    frameExactEndpoints: true,
  });
  const result = refine({ events: COMPLETE_EVENTS });
  const refinedAlignment = forceAlignCtc(target.words, target.tokens, source, {
    blankTokenId: BLANK,
    startMs: result.intervalStartMs,
    endMs: result.intervalEndMs,
    finalSpeechEndMs: result.intervalEndMs,
    frameExactEndpoints: true,
  });
  assert.equal(oldAlignment.status, "complete");
  assert.equal(refinedAlignment.status, "complete");
  const oldTail = oldAlignment.words.slice(-2);
  const refinedTail = refinedAlignment.words.slice(-2);
  assert.ok(refinedTail[0]!.startMs > oldTail[0]!.startMs);
  assert.ok(refinedTail.at(-1)!.endMs > oldTail.at(-1)!.endMs);
  assert.equal(refinedAlignment.words[2]!.startMs, 4_500);
});

test("outer refinement is timing-only and exposes no range mutation surface", () => {
  const result = refine({ events: COMPLETE_EVENTS });
  assert.equal("surah" in result, false);
  assert.equal("startAyah" in result, false);
  assert.equal("endAyah" in result, false);
  assert.deepEqual(Object.keys(result).sort(), [
    "acceptedCanonicalIdentityUnchanged",
    "end",
    "intervalEndMs",
    "intervalStartMs",
    "start",
  ]);
});

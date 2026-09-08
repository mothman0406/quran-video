import type {
  BenchmarkWordTiming,
  ReferenceBoundary,
  ReferenceWordTiming,
  TimingFixture,
  WordTimingResult,
} from "./types.ts";

export type StructuralValidity = {
  valid: boolean;
  canonicalWordsExpected: number;
  canonicalWordsTimed: number;
  missingWords: string[];
  duplicateWords: string[];
  outOfOrderWords: string[];
  timestampFailures: string[];
  wordCoveragePercent: number;
};

export type ErrorMetric = {
  count: number;
  coveragePercent: number;
  meanAbsoluteErrorMs: number | null;
  medianAbsoluteErrorMs: number | null;
  p75AbsoluteErrorMs: number | null;
  p90AbsoluteErrorMs: number | null;
  p95AbsoluteErrorMs: number | null;
  maxAbsoluteErrorMs: number | null;
  meanSignedErrorMs: number | null;
  withinPercent: Record<50 | 100 | 150 | 200 | 300 | 500, number | null>;
};

export type BoundaryError = {
  fixtureId: string;
  kind: "word-start" | "word-end" | "ayah-boundary-start";
  verseKey: string;
  canonicalWordIndex: number;
  canonicalArabic: string;
  referenceMs: number;
  predictedMs: number;
  signedErrorMs: number;
  absoluteErrorMs: number;
  confidence?: number;
  diagnostics?: Record<string, unknown>;
  neighboringWords: { previous?: string; next?: string };
};

export type FixtureBenchmark = {
  fixtureId: string;
  engineId: string;
  structural: StructuralValidity;
  wordStarts: ErrorMetric;
  wordEnds: ErrorMetric;
  ayahBoundaryStarts: ErrorMetric;
  worstBoundaries: BoundaryError[];
  runtime?: WordTimingResult["runtime"];
};

export type TimingBenchmarkReport = {
  schemaVersion: 1;
  engineId: string;
  fixtures: FixtureBenchmark[];
  aggregate: Omit<FixtureBenchmark, "fixtureId" | "engineId" | "runtime">;
};

const thresholds = [50, 100, 150, 200, 300, 500] as const;
const wordKey = (word: { verseKey: string; canonicalWordIndex: number }) => `${word.verseKey}#${word.canonicalWordIndex}`;

function quantile(values: readonly number[], fraction: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * fraction) - 1)]!;
}

function metric(errors: readonly number[], referenceCount: number): ErrorMetric {
  const absolute = errors.map(Math.abs);
  const withinPercent = Object.fromEntries(thresholds.map((threshold) => [threshold, errors.length ? Number((absolute.filter((error) => error <= threshold).length / errors.length * 100).toFixed(2)) : null])) as ErrorMetric["withinPercent"];
  return {
    count: errors.length,
    coveragePercent: referenceCount ? Number((errors.length / referenceCount * 100).toFixed(2)) : 0,
    meanAbsoluteErrorMs: errors.length ? Number((absolute.reduce((sum, value) => sum + value, 0) / absolute.length).toFixed(2)) : null,
    medianAbsoluteErrorMs: quantile(absolute, 0.5),
    p75AbsoluteErrorMs: quantile(absolute, 0.75),
    p90AbsoluteErrorMs: quantile(absolute, 0.9),
    p95AbsoluteErrorMs: quantile(absolute, 0.95),
    maxAbsoluteErrorMs: absolute.length ? Math.max(...absolute) : null,
    meanSignedErrorMs: errors.length ? Number((errors.reduce((sum, value) => sum + value, 0) / errors.length).toFixed(2)) : null,
    withinPercent,
  };
}

export function validateStructuralTiming(canonicalWords: readonly BenchmarkWordTiming[], result: WordTimingResult): StructuralValidity {
  const expected = canonicalWords.map(wordKey);
  const seen = new Map<string, number>();
  const duplicateWords: string[] = [];
  const timestampFailures: string[] = [];
  let lastExpectedIndex = -1;
  const outOfOrderWords: string[] = [];
  let previousStart = Number.NEGATIVE_INFINITY;
  for (const word of result.words) {
    const key = wordKey(word);
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count === 2) duplicateWords.push(key);
    const expectedIndex = expected.indexOf(key);
    if (expectedIndex === -1 || expectedIndex <= lastExpectedIndex) outOfOrderWords.push(key);
    else lastExpectedIndex = expectedIndex;
    if (!Number.isFinite(word.startMs) || word.startMs < previousStart) timestampFailures.push(`${key}: start timestamp goes backward or is invalid`);
    if (word.endMs !== undefined && (!Number.isFinite(word.endMs) || word.startMs >= word.endMs)) timestampFailures.push(`${key}: end timestamp is invalid`);
    previousStart = Math.max(previousStart, word.startMs);
  }
  const missingWords = expected.filter((key) => !seen.has(key));
  const canonicalWordsTimed = expected.filter((key) => seen.has(key)).length;
  return {
    valid: !missingWords.length && !duplicateWords.length && !outOfOrderWords.length && !timestampFailures.length,
    canonicalWordsExpected: canonicalWords.length,
    canonicalWordsTimed,
    missingWords,
    duplicateWords,
    outOfOrderWords,
    timestampFailures,
    wordCoveragePercent: canonicalWords.length ? Number((canonicalWordsTimed / canonicalWords.length * 100).toFixed(2)) : 0,
  };
}

function asError(
  fixtureId: string,
  kind: BoundaryError["kind"],
  reference: ReferenceWordTiming | ReferenceBoundary,
  word: BenchmarkWordTiming,
  predictedMs: number,
  words: readonly BenchmarkWordTiming[],
): BoundaryError {
  const index = words.findIndex((candidate) => wordKey(candidate) === wordKey(word));
  return {
    fixtureId,
    kind,
    verseKey: word.verseKey,
    canonicalWordIndex: word.canonicalWordIndex,
    canonicalArabic: word.canonicalArabic,
    referenceMs: reference.expectedStartMs,
    predictedMs,
    signedErrorMs: predictedMs - reference.expectedStartMs,
    absoluteErrorMs: Math.abs(predictedMs - reference.expectedStartMs),
    confidence: word.confidence,
    diagnostics: word.diagnostics,
    neighboringWords: { previous: index > 0 ? words[index - 1]?.canonicalArabic : undefined, next: index >= 0 ? words[index + 1]?.canonicalArabic : undefined },
  };
}

function aggregateStructural(items: readonly StructuralValidity[]): StructuralValidity {
  const expected = items.reduce((sum, item) => sum + item.canonicalWordsExpected, 0);
  const timed = items.reduce((sum, item) => sum + item.canonicalWordsTimed, 0);
  return {
    valid: items.every((item) => item.valid),
    canonicalWordsExpected: expected,
    canonicalWordsTimed: timed,
    missingWords: items.flatMap((item) => item.missingWords),
    duplicateWords: items.flatMap((item) => item.duplicateWords),
    outOfOrderWords: items.flatMap((item) => item.outOfOrderWords),
    timestampFailures: items.flatMap((item) => item.timestampFailures),
    wordCoveragePercent: expected ? Number((timed / expected * 100).toFixed(2)) : 0,
  };
}

export function evaluateTimingFixture(fixture: TimingFixture, canonicalWords: readonly BenchmarkWordTiming[], result: WordTimingResult): FixtureBenchmark {
  const structural = validateStructuralTiming(canonicalWords, result);
  const predictionByKey = new Map(result.words.map((word) => [wordKey(word), word]));
  const wordStarts: BoundaryError[] = [];
  const wordEnds: BoundaryError[] = [];
  const ayahStarts: BoundaryError[] = [];
  for (const reference of fixture.words) {
    const prediction = predictionByKey.get(wordKey(reference));
    if (!prediction) continue;
    wordStarts.push(asError(fixture.fixtureId, "word-start", reference, prediction, prediction.startMs, result.words));
    if (reference.expectedEndMs !== undefined && prediction.endMs !== undefined) {
      wordEnds.push({ ...asError(fixture.fixtureId, "word-end", reference, prediction, prediction.endMs, result.words), referenceMs: reference.expectedEndMs, signedErrorMs: prediction.endMs - reference.expectedEndMs, absoluteErrorMs: Math.abs(prediction.endMs - reference.expectedEndMs) });
    }
  }
  for (const boundary of fixture.boundaries) {
    const prediction = result.words.find((word) => word.verseKey === boundary.verseKey && word.canonicalWordIndex === 1);
    if (prediction) ayahStarts.push(asError(fixture.fixtureId, "ayah-boundary-start", boundary, prediction, prediction.startMs, result.words));
  }
  const allErrors = [...wordStarts, ...wordEnds, ...ayahStarts];
  return {
    fixtureId: fixture.fixtureId,
    engineId: result.engineId,
    structural,
    wordStarts: metric(wordStarts.map((item) => item.signedErrorMs), fixture.words.length),
    wordEnds: metric(wordEnds.map((item) => item.signedErrorMs), fixture.words.filter((item) => item.expectedEndMs !== undefined).length),
    ayahBoundaryStarts: metric(ayahStarts.map((item) => item.signedErrorMs), fixture.boundaries.length),
    worstBoundaries: allErrors.sort((left, right) => right.absoluteErrorMs - left.absoluteErrorMs).slice(0, 10),
    runtime: result.runtime,
  };
}

export function evaluateTimingBenchmark(items: readonly { fixture: TimingFixture; canonicalWords: readonly BenchmarkWordTiming[]; result: WordTimingResult }[]): TimingBenchmarkReport {
  if (!items.length) throw new Error("Timing benchmark requires at least one fixture result.");
  const fixtures = items.map(({ fixture, canonicalWords, result }) => evaluateTimingFixture(fixture, canonicalWords, result));
  const engineId = fixtures[0]!.engineId;
  if (fixtures.some((fixture) => fixture.engineId !== engineId)) throw new Error("Generate one report per timing engine so comparisons remain explicit.");
  // Keep every raw error for aggregate statistics; worst-boundary truncation is presentation only.
  const detail = items.map(({ fixture, canonicalWords, result }) => evaluateTimingFixture(fixture, canonicalWords, result));
  const startErrors = items.flatMap(({ fixture, result }) => fixture.words.flatMap((reference) => {
    const word = result.words.find((item) => wordKey(item) === wordKey(reference));
    return word ? [word.startMs - reference.expectedStartMs] : [];
  }));
  const endErrors = items.flatMap(({ fixture, result }) => fixture.words.flatMap((reference) => {
    const word = result.words.find((item) => wordKey(item) === wordKey(reference));
    return word && word.endMs !== undefined && reference.expectedEndMs !== undefined ? [word.endMs - reference.expectedEndMs] : [];
  }));
  const ayahErrors = items.flatMap(({ fixture, result }) => fixture.boundaries.flatMap((reference) => {
    const word = result.words.find((item) => item.verseKey === reference.verseKey && item.canonicalWordIndex === 1);
    return word ? [word.startMs - reference.expectedStartMs] : [];
  }));
  const wordReferenceCount = items.reduce((sum, item) => sum + item.fixture.words.length, 0);
  const endReferenceCount = items.reduce((sum, item) => sum + item.fixture.words.filter((word) => word.expectedEndMs !== undefined).length, 0);
  const boundaryReferenceCount = items.reduce((sum, item) => sum + item.fixture.boundaries.length, 0);
  const worstBoundaries = detail.flatMap((fixture) => fixture.worstBoundaries).sort((left, right) => right.absoluteErrorMs - left.absoluteErrorMs).slice(0, 20);
  return {
    schemaVersion: 1,
    engineId,
    fixtures,
    aggregate: {
      structural: aggregateStructural(fixtures.map((fixture) => fixture.structural)),
      wordStarts: metric(startErrors, wordReferenceCount),
      wordEnds: metric(endErrors, endReferenceCount),
      ayahBoundaryStarts: metric(ayahErrors, boundaryReferenceCount),
      worstBoundaries,
    },
  };
}

function formatMetric(label: string, value: ErrorMetric) {
  if (!value.count) return `- ${label}: no matching reference boundaries`;
  return `- ${label}: n=${value.count}, coverage=${value.coveragePercent}%, median AE=${value.medianAbsoluteErrorMs} ms, mean AE=${value.meanAbsoluteErrorMs} ms, p90=${value.p90AbsoluteErrorMs} ms, p95=${value.p95AbsoluteErrorMs} ms, max=${value.maxAbsoluteErrorMs} ms, bias=${value.meanSignedErrorMs} ms; within 50/100/150/200/300/500 ms = ${value.withinPercent[50]}% / ${value.withinPercent[100]}% / ${value.withinPercent[150]}% / ${value.withinPercent[200]}% / ${value.withinPercent[300]}% / ${value.withinPercent[500]}%`;
}

export function timingBenchmarkMarkdown(report: TimingBenchmarkReport) {
  const structural = report.aggregate.structural;
  const worst = report.aggregate.worstBoundaries.length
    ? report.aggregate.worstBoundaries.map((item) => `| ${item.kind} | ${item.verseKey} | ${item.canonicalWordIndex} | ${item.canonicalArabic} | ${item.referenceMs} | ${item.predictedMs} | ${item.signedErrorMs} | ${item.confidence ?? ""} |`).join("\n")
    : "No reference boundaries were scored.";
  return `# Quran word-timing benchmark\n\nEngine: \`${report.engineId}\`\n\nFixtures: ${report.fixtures.length}\n\nStructural validity: ${structural.valid ? "PASS" : "FAIL"}; canonical words expected/timed/missing: ${structural.canonicalWordsExpected}/${structural.canonicalWordsTimed}/${structural.missingWords.length}; duplicates: ${structural.duplicateWords.length}; out of order: ${structural.outOfOrderWords.length}; timestamp failures: ${structural.timestampFailures.length}; coverage: ${structural.wordCoveragePercent}%\n\n${formatMetric("Word starts", report.aggregate.wordStarts)}\n${formatMetric("Word ends", report.aggregate.wordEnds)}\n${formatMetric("Ayah-boundary starts (not word labels)", report.aggregate.ayahBoundaryStarts)}\n\n## Worst boundaries\n\n| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |\n| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |\n${worst}\n`;
}

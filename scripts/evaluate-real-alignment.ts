import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { resolveEvidenceWeightedAyahBoundaries, type WordOccurrence } from "../src/lib/recognition/core.ts";
import type { CtcForcedAlignmentResult } from "../src/lib/recognition/ctc-forced-alignment.ts";
import type { FastConformerShadowResult } from "../src/lib/recognition/local-fastconformer.ts";

type Boundary = { verseKey: string; startMs: number; endMs: number; evidence?: { source?: string } };
type DebugRecording = {
  source?: { durationMs?: number };
  passage?: { canonicalSpan?: { coveredVerseKeys?: string[] } };
  globalBoundarySolver?: { boundaries?: Boundary[] };
  evidenceWeightedShadow?: { boundaries?: Boundary[]; promotionState?: string };
  wordAlignment?: WordOccurrence[];
  speechRegions?: Array<{ startMs: number; endMs: number; durationMs: number; confidence: number }>;
  forcedAlignmentShadow?: { result?: CtcForcedAlignmentResult };
  fastConformerShadow?: FastConformerShadowResult;
  /** Whisper-derived word/verse evidence, present in modern debug exports. */
  verseTiming?: Boundary[];
  AUTHORITATIVE_CAPTIONS?: Array<{ verseKeys?: string[]; startMs?: number; endMs?: number }>;
};
type RecordingLabels = {
  recordingId: string;
  passage: string[];
  boundaries: Record<string, number>;
  finalEndMs?: number;
  /** Approximate labels are reported, but must not be used as promotion gates. */
  quality?: "verified" | "approximate";
};

function median(values: readonly number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)]!;
}

function percentile(values: readonly number[], percentileValue: number) {
  if (!values.length) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * percentileValue) - 1)]!;
}

function tableRow(values: readonly (string | number | null | undefined)[]) {
  return `| ${values.map((value) => value ?? "—").join(" | ")} |`;
}

function boundaryMap(boundaries: readonly Boundary[] | undefined) {
  return new Map((boundaries ?? []).map((boundary) => [boundary.verseKey, boundary]));
}

function reportMetrics(name: string, boundaries: readonly Boundary[] | undefined, labels: RecordingLabels | null) {
  if (!labels || !Object.keys(labels.boundaries).length) return `${name}: manual truth unavailable (medianAbsoluteErrorMs=— p90AbsoluteErrorMs=— maxAbsoluteErrorMs=— missingBoundaryCount=— structuralFailureCount=—)`;
  const predicted = boundaryMap(boundaries);
  const errors = Object.entries(labels.boundaries)
    .flatMap(([verseKey, startMs]) => predicted.get(verseKey) ? [Math.abs(predicted.get(verseKey)!.startMs - startMs)] : []);
  const missing = Object.keys(labels.boundaries).filter((verseKey) => !predicted.has(verseKey));
  const structuralInvalid = (boundaries ?? []).filter((boundary, index, all) => boundary.endMs <= boundary.startMs
    || boundary.startMs < 0 || (index < all.length - 1 && boundary.endMs !== all[index + 1]!.startMs)).length;
  return `${name}: medianAbsoluteErrorMs=${median(errors) ?? "—"} p90AbsoluteErrorMs=${percentile(errors, 0.9) ?? "—"} maxAbsoluteErrorMs=${errors.length ? Math.max(...errors) : "—"} missingBoundaryCount=${missing.length} structuralFailureCount=${structuralInvalid}`;
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

async function main() {
  const args = process.argv.slice(2);
  const debugPaths = args.filter((argument) => !argument.startsWith("--"));
  const labelsArgument = args.find((argument) => argument.startsWith("--labels="));
  if (!debugPaths.length) throw new Error("Usage: npm run evaluate:real -- <debug.json> [...debug.json] [--labels=labels.json]");
  const labels = labelsArgument ? await loadJson<RecordingLabels>(labelsArgument.slice("--labels=".length)) : null;
  for (const debugPath of debugPaths) {
    const recording = await loadJson<DebugRecording>(debugPath);
    const current = recording.globalBoundarySolver?.boundaries ?? recording.AUTHORITATIVE_CAPTIONS?.flatMap((caption) => {
      const verseKey = caption.verseKeys?.[0];
      return verseKey && caption.startMs !== undefined && caption.endMs !== undefined ? [{ verseKey, startMs: caption.startMs, endMs: caption.endMs }] : [];
    }) ?? [];
    // New debug exports include the in-browser shadow result. Older supplied
    // recordings do not, so replay their exact production evidence through the
    // same exported resolver rather than duplicating resolver logic here.
    const replayedShadow = !recording.evidenceWeightedShadow && current.length && recording.wordAlignment?.length
      ? resolveEvidenceWeightedAyahBoundaries({
        verseKeys: current.map((boundary) => boundary.verseKey),
        wordOccurrences: recording.wordAlignment,
        speechRegions: recording.speechRegions,
        verifiedFirstOnset: current[0]!.startMs,
        finalSpeechEnd: current.at(-1)!.endMs,
        durationMs: recording.source?.durationMs ?? current.at(-1)!.endMs,
        ctcAlignment: recording.forcedAlignmentShadow?.result,
      }).boundaries
      : [];
    const shadow = recording.evidenceWeightedShadow?.boundaries ?? replayedShadow;
    const whisper = recording.verseTiming;
    const darten = recording.forcedAlignmentShadow?.result?.verses;
    const fastConformer = recording.fastConformerShadow?.alignment.verses;
    const verseKeys = recording.passage?.canonicalSpan?.coveredVerseKeys ?? current.map((boundary) => boundary.verseKey);
    const currentByVerse = boundaryMap(current);
    const shadowByVerse = boundaryMap(shadow);
    console.log(`\n## ${basename(debugPath)} (${recording.source?.durationMs ?? "unknown"} ms)`);
    console.log("REAL ALIGNMENT COMPARISON");
    console.log(tableRow(["verseKey", "manualStartMs", "productionStartMs", "productionErrorMs", "evidenceWeightedStartMs", "evidenceWeightedErrorMs", "dartenStartMs", "dartenErrorMs", "fastConformerStartMs", "fastConformerErrorMs"]));
    console.log(tableRow(["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:", "---:"]));
    for (const verseKey of verseKeys) {
      const currentBoundary = currentByVerse.get(verseKey);
      const shadowBoundary = shadowByVerse.get(verseKey);
      const manual = labels?.boundaries[verseKey];
      console.log(tableRow([
        verseKey,
        manual,
        currentBoundary?.startMs,
        manual === undefined || !currentBoundary ? null : Math.abs(currentBoundary.startMs - manual),
        shadowBoundary?.startMs,
        manual === undefined || !shadowBoundary ? null : Math.abs(shadowBoundary.startMs - manual),
        boundaryMap(darten).get(verseKey)?.startMs,
        manual === undefined || !boundaryMap(darten).get(verseKey) ? null : Math.abs(boundaryMap(darten).get(verseKey)!.startMs - manual),
        boundaryMap(fastConformer).get(verseKey)?.startMs,
        manual === undefined || !boundaryMap(fastConformer).get(verseKey) ? null : Math.abs(boundaryMap(fastConformer).get(verseKey)!.startMs - manual),
      ]));
    }
    console.log(reportMetrics("production", current, labels));
    console.log(reportMetrics("Whisper evidence", whisper, labels));
    console.log(reportMetrics("Darten forced alignment", darten, labels));
    console.log(reportMetrics("FastConformer forced alignment", fastConformer, labels));
    console.log("phoneme forced alignment: not prototyped (no commercially verified public browser phoneme CTC model)");
    console.log(reportMetrics("evidence-weighted shadow", shadow, labels));
    if (labels?.quality === "approximate") console.log("Label quality: approximate — informative only, not a promotion gate.");
  }
}

await main();

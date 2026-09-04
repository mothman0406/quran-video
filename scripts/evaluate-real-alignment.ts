import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { resolveEvidenceWeightedAyahBoundaries, type WordOccurrence } from "../src/lib/recognition/core.ts";
import type { CtcForcedAlignmentResult } from "../src/lib/recognition/ctc-forced-alignment.ts";

type Boundary = { verseKey: string; startMs: number; endMs: number; evidence?: { source?: string } };
type DebugRecording = {
  source?: { durationMs?: number };
  passage?: { canonicalSpan?: { coveredVerseKeys?: string[] } };
  globalBoundarySolver?: { boundaries?: Boundary[] };
  evidenceWeightedShadow?: { boundaries?: Boundary[]; promotionState?: string };
  wordAlignment?: WordOccurrence[];
  speechRegions?: Array<{ startMs: number; endMs: number; durationMs: number; confidence: number }>;
  forcedAlignmentShadow?: { result?: CtcForcedAlignmentResult };
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
  if (!labels) return `${name}: no labels supplied`;
  const predicted = boundaryMap(boundaries);
  const errors = Object.entries(labels.boundaries)
    .flatMap(([verseKey, startMs]) => predicted.get(verseKey) ? [Math.abs(predicted.get(verseKey)!.startMs - startMs)] : []);
  const missing = Object.keys(labels.boundaries).filter((verseKey) => !predicted.has(verseKey));
  const structuralInvalid = (boundaries ?? []).filter((boundary, index, all) => boundary.endMs <= boundary.startMs
    || boundary.startMs < 0 || (index < all.length - 1 && boundary.endMs !== all[index + 1]!.startMs)).length;
  return `${name}: median=${median(errors) ?? "—"}ms p90=${percentile(errors, 0.9) ?? "—"}ms max=${errors.length ? Math.max(...errors) : "—"}ms missing=${missing.length} structural-invalid=${structuralInvalid}`;
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
    const verseKeys = recording.passage?.canonicalSpan?.coveredVerseKeys ?? current.map((boundary) => boundary.verseKey);
    const currentByVerse = boundaryMap(current);
    const shadowByVerse = boundaryMap(shadow);
    console.log(`\n## ${basename(debugPath)} (${recording.source?.durationMs ?? "unknown"} ms)`);
    console.log(tableRow(["verse", "manual start", "current", "shadow", "Δ shadow", "current source", "shadow source"]));
    console.log(tableRow(["---", "---:", "---:", "---:", "---:", "---", "---"]));
    for (const verseKey of verseKeys) {
      const currentBoundary = currentByVerse.get(verseKey);
      const shadowBoundary = shadowByVerse.get(verseKey);
      const manual = labels?.boundaries[verseKey];
      console.log(tableRow([
        verseKey,
        manual,
        currentBoundary?.startMs,
        shadowBoundary?.startMs,
        currentBoundary && shadowBoundary ? shadowBoundary.startMs - currentBoundary.startMs : null,
        currentBoundary?.evidence?.source,
        shadowBoundary?.evidence?.source,
      ]));
    }
    console.log(reportMetrics("current", current, labels));
    console.log(reportMetrics("shadow", shadow, labels));
    if (labels?.quality === "approximate") console.log("Label quality: approximate — informative only, not a promotion gate.");
  }
}

await main();

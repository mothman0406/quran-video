#!/usr/bin/env node
/** Merges metrics-only real benchmark batches; audio is never read or written. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { decideTimingPromotion, evaluateTimingBenchmark, timingBenchmarkMarkdown, type TimingBenchmarkReport } from "./lib.ts";
import type { BenchmarkWordTiming, TimingFixture, WordTimingResult } from "./types.ts";

type Entry = { fixture: TimingFixture; canonicalWords: BenchmarkWordTiming[]; result: WordTimingResult };
type Batch = { dataset: unknown; audio: unknown; manifest: unknown[]; exclusions: unknown[]; entries: { baseline: Entry[]; raw: Entry[]; refined: Entry[] }; historicalFixtures: string };

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const outputArgument = argument("--output");
  const inputArguments = process.argv.slice(2).filter((value) => !value.startsWith("--") && value !== outputArgument);
  if (!outputArgument || !inputArguments.length) throw new Error("Usage: merge-real-runs.ts --output <base> <batch.json> [...batch.json]");
  const batches = await Promise.all(inputArguments.map(async (path) => JSON.parse(await readFile(resolve(path), "utf8")) as Batch));
  const ids = new Set<string>();
  const merge = (key: keyof Batch["entries"]) => batches.flatMap((batch) => batch.entries[key]).map((entry) => {
    if (ids.has(`${key}:${entry.fixture.fixtureId}`)) throw new Error(`Duplicate ${key} fixture ${entry.fixture.fixtureId} in merge input.`);
    ids.add(`${key}:${entry.fixture.fixtureId}`);
    return entry;
  });
  const baseline = merge("baseline");
  const raw = merge("raw");
  const refined = merge("refined");
  const reports: TimingBenchmarkReport[] = [evaluateTimingBenchmark(baseline), evaluateTimingBenchmark(raw), evaluateTimingBenchmark(refined)];
  const promotionDecisions = reports.slice(1).map((candidate) => decideTimingPromotion(reports[0]!, candidate));
  const runtime = Object.fromEntries(["baseline", "raw", "refined"].map((key) => {
    const entries = ({ baseline, raw, refined } as const)[key as "baseline" | "raw" | "refined"];
    const totals = entries.map((entry) => entry.result.runtime?.totalMs ?? 0);
    const inferences = entries.map((entry) => Number(entry.result.diagnostics?.inferenceMs ?? 0));
    const alignments = entries.map((entry) => Number(entry.result.diagnostics?.alignmentMs ?? 0));
    return [key, { meanTotalMs: Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length), meanInferenceMs: Math.round(inferences.reduce((sum, value) => sum + value, 0) / inferences.length), meanAlignmentMs: Math.round(alignments.reduce((sum, value) => sum + value, 0) / alignments.length), modelBytes: entries[0]?.result.runtime?.modelBytes ?? null }];
  }));
  const first = batches[0]!;
  const payload = {
    schemaVersion: 1,
    mergedFrom: inputArguments,
    dataset: first.dataset,
    audio: first.audio,
    manifest: batches.flatMap((batch) => batch.manifest),
    exclusions: batches.flatMap((batch) => batch.exclusions),
    sourceExclusions: [{ reciter: "Abdurrahmaan_As-Sudais_192kbps", reason: "quran-align release-2016-11-24 asset is not JSON: it begins with the published alignment crash log; no fixture was guessed or repaired." }],
    reports,
    runtime,
    promotionDecisions,
    productionWinner: "fastconformer-current",
    historicalFixtures: first.historicalFixtures,
  };
  const output = resolve(outputArgument);
  await mkdir(dirname(output), { recursive: true });
  await Promise.all([
    writeFile(`${output}.json`, `${JSON.stringify(payload, null, 2)}\n`),
    writeFile(`${output}.md`, ["# Real Quran word-timing benchmark", "", `Merged fixed fixture count: ${baseline.length}.`, "", ...reports.flatMap((report) => [timingBenchmarkMarkdown(report), "", "## Per-reciter word timing", "", ...Object.entries(report.perReciter).map(([reciter, metrics]) => `- ${reciter}: starts median/p90/bias=${metrics.wordStarts.medianAbsoluteErrorMs}/${metrics.wordStarts.p90AbsoluteErrorMs}/${metrics.wordStarts.meanSignedErrorMs} ms; ends median/p90/bias=${metrics.wordEnds.medianAbsoluteErrorMs}/${metrics.wordEnds.p90AbsoluteErrorMs}/${metrics.wordEnds.meanSignedErrorMs} ms; start coverage=${metrics.wordStarts.coveragePercent}%.`), ""]), "## Promotion decision", "", ...promotionDecisions.map((decision) => `- ${decision.candidate}: ${decision.promote ? "PROMOTE" : "do not promote"}; ${decision.reasons.join("; ")}.`), "", "## Source exclusion", "", "- Abdurrahmaan_As-Sudais_192kbps: quran-align release-2016-11-24 asset is an alignment crash log, not JSON; no fixtures were guessed or repaired.", "", "## Runtime", "", ...Object.entries(runtime).map(([engine, metrics]) => `- ${engine}: mean total=${metrics.meanTotalMs} ms; inference=${metrics.meanInferenceMs} ms; alignment=${metrics.meanAlignmentMs} ms; model/supporting assets=${metrics.modelBytes} bytes.`), "", "## Historical reviewed fixtures", "", first.historicalFixtures, ""].join("\n")),
  ]);
  process.stdout.write(`Wrote ${output}.json and ${output}.md from ${baseline.length} fixed real-audio fixtures.\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

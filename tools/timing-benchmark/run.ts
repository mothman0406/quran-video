#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { canonicalWordsForFixture, MANUAL_TIMING_FIXTURES } from "./fixtures.ts";
import { evaluateTimingBenchmark, timingBenchmarkMarkdown } from "./lib.ts";
import type { WordTimingResult } from "./types.ts";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const resultsPath = argument("--results");
  const outputBase = argument("--output");
  if (!resultsPath || !outputBase) {
    throw new Error("Usage: npm run timing:benchmark -- --results <results.json> --output <report-base-path>");
  }
  const parsed = JSON.parse(await readFile(resolve(resultsPath), "utf8")) as WordTimingResult[];
  if (!Array.isArray(parsed) || !parsed.length) throw new Error("--results must be a non-empty JSON array of WordTimingResult objects.");
  const byFixture = new Map(parsed.map((result) => [result.fixtureId, result]));
  const entries = MANUAL_TIMING_FIXTURES.flatMap((fixture) => {
    const result = byFixture.get(fixture.fixtureId);
    return result ? [{ fixture, canonicalWords: canonicalWordsForFixture(fixture), result }] : [];
  });
  if (!entries.length) throw new Error("The results file does not contain a known timing-benchmark fixture ID.");
  const report = evaluateTimingBenchmark(entries);
  const base = resolve(outputBase);
  await mkdir(dirname(base), { recursive: true });
  await Promise.all([
    writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(`${base}.md`, timingBenchmarkMarkdown(report)),
  ]);
  process.stdout.write(`Wrote ${base}.json and ${base}.md\n`);
  if (!report.aggregate.structural.valid) process.exitCode = 2;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

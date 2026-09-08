#!/usr/bin/env node
/** Development-only pre-production Quran regression runner. */
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { REAL_VIDEO_REGRESSION_FIXTURES } from "./real-video-manifest.ts";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const DATE = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const RESULT_BASE = resolve(ROOT, `tools/regression/.cache/${DATE}-quran-align-real`);
const REPORT_PATH = resolve(ROOT, `docs/regression/results/${DATE}.md`);
const TESTS = [
  "tests/fastconformer-identification.test.ts", "tests/fastconformer-primary-timing.test.ts", "tests/timing-benchmark.test.ts",
  "tests/ayah-display-splitting.test.ts", "tests/captions.test.ts", "tests/word-highlighting.test.ts", "tests/caption-generation-progress.test.ts",
  "tests/formats.test.ts", "tests/media-timeline.test.ts", "tests/social-platform-guides.test.ts", "tests/editor-history.test.ts",
  "tests/export.test.ts", "tests/export-preflight.test.ts",
] as const;

type BenchmarkReport = {
  engineId: string;
  aggregate: { structural: { valid: boolean; canonicalWordsExpected: number; canonicalWordsTimed: number; missingWords: string[]; duplicateWords: string[]; outOfOrderWords: string[]; timestampFailures: string[] }; wordStarts: { medianAbsoluteErrorMs: number; p90AbsoluteErrorMs: number }; wordEnds: { medianAbsoluteErrorMs: number; p90AbsoluteErrorMs: number } };
};
type BenchmarkPayload = { reports: BenchmarkReport[]; manifest: unknown[]; generatedAt: string };

async function command(label: string, file: string, args: string[]) {
  try {
    await execFileAsync(file, args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
    console.log(`PASS  ${label}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message.split("\n").at(-1) : String(error);
    console.log(`FAIL  ${label}: ${detail}`);
    return false;
  }
}

function reportLine(report: BenchmarkReport) {
  const value = report.aggregate;
  return `${report.engineId}: ${value.structural.canonicalWordsTimed}/${value.structural.canonicalWordsExpected} canonical words; starts median/p90 ${value.wordStarts.medianAbsoluteErrorMs}/${value.wordStarts.p90AbsoluteErrorMs}ms; ends median/p90 ${value.wordEnds.medianAbsoluteErrorMs}/${value.wordEnds.p90AbsoluteErrorMs}ms`;
}

async function main() {
  const corePassed = await command("production invariant probes", process.execPath, ["--experimental-strip-types", "--test", ...TESTS]);
  let benchmarkStatus = "SKIPPED - MEDIA NOT AVAILABLE";
  let benchmark: BenchmarkReport | null = null;
  try {
    await access(resolve(ROOT, "tools/timing-benchmark/.cache/audio"));
    const ran = await command("real quran-align / EveryAyah timing benchmark", process.execPath, ["--expose-gc", "--experimental-strip-types", "tools/timing-benchmark/real-run.ts", "--output", RESULT_BASE]);
    if (ran) {
      const payload = JSON.parse(await readFile(`${RESULT_BASE}.json`, "utf8")) as BenchmarkPayload;
      benchmark = payload.reports.find((candidate) => candidate.engineId === "fastconformer-current") ?? null;
      const structural = benchmark?.aggregate.structural;
      const metricsPass = Boolean(structural?.valid && benchmark && benchmark.aggregate.wordStarts.p90AbsoluteErrorMs <= 350 && benchmark.aggregate.wordEnds.p90AbsoluteErrorMs <= 550);
      benchmarkStatus = metricsPass ? "PASS" : "FAIL";
      console.log(`${benchmarkStatus}  production timing thresholds${benchmark ? ` (${reportLine(benchmark)})` : ""}`);
    } else benchmarkStatus = "FAIL";
  } catch {
    console.log("SKIPPED - MEDIA NOT AVAILABLE  real quran-align / EveryAyah timing benchmark");
  }

  const automatic = corePassed && benchmarkStatus === "PASS";
  const rows = REAL_VIDEO_REGRESSION_FIXTURES.map((fixture) => {
    const automated = fixture.id === "long-ayah-18-57" ? (corePassed ? "PASS" : "FAIL") : "MANUAL VALIDATION REQUIRED";
    const timing = fixture.reviewedBoundaries?.length ? "MANUAL RETEST REQUIRED" : "Not reviewed";
    return `| ${fixture.description} | ${fixture.expectedPassage ? `${fixture.expectedPassage.surah}:${fixture.expectedPassage.startAyah}-${fixture.expectedPassage.endAyah}` : "—"} | ${timing} | ${automated} | MANUAL VALIDATION REQUIRED | ${automated} |`;
  });
  await mkdir(resolve(ROOT, "docs/regression/results"), { recursive: true });
  await writeFile(REPORT_PATH, [
    "# Pre-production real-video Quran regression", "",
    `Generated: ${new Date().toISOString()}. This report intentionally contains no local media paths or media contents.`, "",
    "## Automatic run", "",
    `- Invariant probes: ${corePassed ? "PASS" : "FAIL"}.`,
    `- Real quran-align / EveryAyah benchmark: ${benchmarkStatus}. It uses ignored local audio and external machine-generated references, never human ground truth.`,
    ...(benchmark ? [`- ${reportLine(benchmark)}.`, "- Thresholds: structural validity, complete canonical coverage, p90 starts ≤350ms, p90 transition-derived ends ≤550ms."] : []),
    "",
    "## Fixture status", "",
    "| Fixture | Passage | Timing | Display | Export | Result |", "| --- | --- | --- | --- | --- | --- |", ...rows,
    "",
    "## Passage identity", "",
    `- ${corePassed ? "PASS" : "FAIL"}: production identification invariant probes retain Al-Ma'arij (70) over 32:5, reject cross-surah leakage, and model noisy Surah 74 optional-basmalah handling.`,
    "- MANUAL VALIDATION REQUIRED: no original multi-ayah Al-Ma'arij or noisy Surah 74 recordings are available, so no browser result is fabricated.",
    "",
    "## Historical timing", "",
    "- MANUAL RETEST REQUIRED: retained user-reviewed starts are 6:74-77, 69:19-32, 93:1-5, and 3:33-35. Their continuous recordings are absent; the runner does not compare unrelated single-ayah clips against them.",
    "- The clean 45-ayah quran-align/EveryAyah sample is an automatic canonical-word and timing guard only.",
    "",
    "## Browser-required checks", "",
    "See `docs/regression/MANUAL_BROWSER_CHECKLIST.md`. Export Blob/download, portrait framing, audio-only UI, pitch perception, and the retained historical recordings require a browser and retained source media.",
    "",
    `Overall automatic result: ${automatic ? "PASS" : benchmarkStatus === "SKIPPED - MEDIA NOT AVAILABLE" && corePassed ? "PASS WITH MEDIA SKIP" : "FAIL"}.`, "",
  ].join("\n"));
  console.log(`Wrote ${REPORT_PATH.replace(`${ROOT}/`, "")}`);
  if (!automatic) process.exitCode = benchmarkStatus === "SKIPPED - MEDIA NOT AVAILABLE" && corePassed ? 0 : 1;
}

void main();

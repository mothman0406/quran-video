import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  SHORT_GATE_DESIGNATIONS,
  computeLocalWinnerProgression,
  computeShortSupport,
  windowCountSensitivity,
  type ShortGateFixture,
} from "../tools/regression/short-gate-analysis.ts";

const execFileAsync = promisify(execFile);
const directory = join(process.cwd(), "tools/regression/fixtures/short-gate");

async function fixtures() {
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as ShortGateFixture));
}

test("short support and null-window tolerance are exact at small window counts", () => {
  const support = computeShortSupport([
    { coherent: null }, { coherent: null }, { coherent: {} }, { coherent: {} }, { coherent: null }, { coherent: {} }, { coherent: {} },
  ]);
  assert.deepEqual(support, {
    windows: 7,
    coherentWindows: 4,
    nullWindows: 3,
    coherentRatio: 0.571429,
    leadingNullWindows: 2,
    trailingNullWindows: 0,
    longestNullRun: 2,
    longestCoherentRun: 2,
    oneNullRatio: 0.857143,
    twoNullRatio: 0.714286,
  });
});

test("window-count sensitivity exposes the disproportionate effect without changing a gate", () => {
  assert.deepEqual(windowCountSensitivity().map((row) => [row.windows, row.twoBadRatio, row.productionRunAllowsThreeBad]), [
    [5, 0.6, false], [7, 0.714286, false], [10, 0.8, false], [15, 0.866667, false],
  ]);
});

test("independent local evidence distinguishes forward acquisition from reset and repetition", async () => {
  const values = await fixtures();
  const byId = new Map(values.map((fixture) => [fixture.id, fixture]));
  const forward = computeLocalWinnerProgression(byId.get("short-gate-design-positive-reader-i-89-1-14")!);
  assert.equal(forward.backwardTransitionCount, 0);
  assert.equal(forward.resetCount, 0);
  assert.equal(forward.longestNoProgressRun, 0);
  const backward = computeLocalWinnerProgression(byId.get("short-gate-design-negative-reader-i-89-backward")!);
  assert.equal(backward.resetCount, 1);
  const repeated = computeLocalWinnerProgression(byId.get("short-gate-design-negative-reader-j-90-repeat")!);
  assert.equal(repeated.resetCount, 1);
  assert.equal(repeated.longestNoProgressRun, 5);
});

test("design and held-out provenance stays fixed and reader H cannot calibrate the analysis", async () => {
  const values = await fixtures();
  assert.equal(values.length, SHORT_GATE_DESIGNATIONS.length);
  assert.equal(new Set(SHORT_GATE_DESIGNATIONS.map((entry) => entry.id)).size, SHORT_GATE_DESIGNATIONS.length);
  assert.equal(SHORT_GATE_DESIGNATIONS.some((entry) => entry.readerGroup === "reader-h" || entry.sourceRange?.surah === 91), false);
  for (const fixture of values) {
    const designation = SHORT_GATE_DESIGNATIONS.find((entry) => entry.id === fixture.id);
    assert.ok(designation);
    assert.equal(fixture.corpusRole, designation.corpusRole);
    assert.equal(fixture.provenance, designation.corpusRole === "design-support" ? "short-gate-design-support" : "short-gate-held-out");
  }
});

test("the offline evaluator reports no candidate and never derives values from H", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-short-gate-analysis.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const report = JSON.parse(stdout);
  assert.equal(report.hExcludedFromCalibration, true);
  assert.equal(report.candidate, null);
  assert.equal(report.conclusion, "NO CANDIDATE");
  assert.deepEqual(report.provenanceErrors, []);
});

test("short-gate fixtures retain privacy-safe recognition metadata only", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/validate-short-gate-privacy.ts"], { cwd: process.cwd() });
  assert.match(stdout, /^PASS short-gate privacy \(6 fixtures\)/u);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { buildNormalizedLongPathCorpus } from "../tools/regression/multisignal-long-path.ts";
import {
  FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS,
  calibrateProgressionThresholds,
  evaluateProgressionCandidate,
  progressionSampleFromFixture,
  progressionSampleWithoutTrajectory,
  type ProgressionSample,
} from "../tools/regression/progression-long-path.ts";
import type { ProgressionTrajectoryFixture } from "../tools/regression/progression-trajectory.ts";

const execFileAsync = promisify(execFile);

async function samples() {
  const directory = join(process.cwd(), "tools/regression/fixtures/progression-trajectory");
  const fixtures = await Promise.all((await readdir(directory)).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as ProgressionTrajectoryFixture));
  const legacy = buildNormalizedLongPathCorpus([]).filter((feature) => feature.classification === "known-positive" || feature.classification === "logical-negative").map(progressionSampleWithoutTrajectory);
  return [...fixtures.map(progressionSampleFromFixture), ...legacy];
}

function byId(all: readonly ProgressionSample[], id: string) {
  const sample = all.find((entry) => entry.id === id);
  assert.ok(sample, `missing ${id}`);
  return sample;
}

test("progression candidate thresholds are exact, frozen, and derived without held-out evidence", async () => {
  assert.deepEqual(FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS, {
    minimumGeneratedWindows: 5,
    minimumBestCtc: -0.60,
    minimumMargin: 8,
    maximumResetCount: 0,
    maximumNoProgressRun: 2,
  });
  assert.ok(Object.isFrozen(FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS));
  const designVisible = (await samples()).filter((sample) => sample.provenance !== "progression-held-out");
  const derived = calibrateProgressionThresholds(
    designVisible.filter((sample) => sample.sampleClass === "long-positive"),
    designVisible.filter((sample) => sample.sampleClass === "real-negative"),
  );
  assert.deepEqual(derived, { ...FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS });
});

test("frozen progression candidate classifies historical fixtures by the intended stage", async () => {
  const all = await samples();
  const repeated = evaluateProgressionCandidate(byId(all, "validation-negative-reader-b-repeated"));
  assert.equal(repeated.accepted, false);
  assert.equal(repeated.firstFailedStage, "progression");
  assert.equal(repeated.conditions.noReset, false);
  assert.equal(repeated.conditions.boundedNoProgressRun, false);
  for (const id of ["validation-positive-reader-a-66-1-7", "validation-positive-reader-a-1-1-7", "validation-positive-reader-b-50-16-18", "positive-alafasy-93-1-11", "positive-alafasy-94-1-8", "positive-hani-3-33-35"]) {
    assert.equal(evaluateProgressionCandidate(byId(all, id)).accepted, true, id);
  }
  assert.equal(evaluateProgressionCandidate(byId(all, "mixed-noncontiguous-quran")).firstFailedStage, "identity-margin");
  for (const id of ["repeated-93-1", "repeated-6-77", "backward-6-77-to-74", "validation-negative-reader-b-mixed-jump", "validation-negative-reader-b-backward", "isolated-muddaththir-excerpt"]) {
    assert.equal(evaluateProgressionCandidate(byId(all, id)).accepted, false, id);
  }
  // Retained design positives without per-window coordinates fail closed.
  for (const id of ["surah-2-258-259", "surah-6-74-77"]) {
    assert.equal(evaluateProgressionCandidate(byId(all, id)).firstFailedStage, "trajectory-missing", id);
  }
  const logical = all.filter((sample) => sample.sampleClass === "logical-negative");
  assert.equal(logical.length, 13);
  assert.ok(logical.every((sample) => !evaluateProgressionCandidate(sample).accepted));
  // Identity-positive, edge-wrong Husary is exposed to forced alignment as 75:1–16.
  assert.equal(byId(all, "positive-husary-75-1-15").sampleClass, "identity-positive-edge-failure");
  assert.equal(evaluateProgressionCandidate(byId(all, "positive-husary-75-1-15")).accepted, true);
});

test("progression evaluator reports held-out outcomes under the frozen candidate, including blind spots", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-progression-long-path.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const report = JSON.parse(stdout);
  assert.equal(report.frozenMatchesDesignCalibration, true);
  assert.deepEqual(report.designVisible.frozenCandidate.falsePositives, []);
  assert.ok(report.designVisible.positiveFolds.every((fold: { foldPassed: boolean }) => fold.foldPassed));
  assert.ok(report.designVisible.repetitionFolds.every((fold: { foldPassed: boolean }) => fold.foldPassed));
  const repeated50 = report.designVisible.repetitionFolds.find((fold: { fold: string }) => fold.fold.endsWith(":validation-negative-reader-b-repeated"));
  assert.equal(repeated50.heldOutAccepted, false);
  assert.equal(repeated50.firstFailedStage, "progression");
  assert.equal(report.heldOut.summary.repetitionNegativesRejected, "5/5");
  assert.equal(report.heldOut.summary.longPositivesAccepted, "1/1");
  assert.equal(report.heldOut.summary.rejectingStage["progression-heldout-repeated-alafasy-93-1-11-x2"], "progression");
  assert.equal(report.heldOut.summary.rejectingStage["progression-heldout-repeated-reader-c-55-1-5-x4"], "progression");
  // Null-coded repetition is invisible to progression; existing coherent-window support rejects it.
  assert.deepEqual(report.heldOut.summary.repetitionNegativesInvisibleToProgression, [
    "progression-heldout-alternating-alafasy-93",
    "progression-heldout-partial-reset-alafasy-94",
    "progression-heldout-repeated-hani-3-33-35-x2",
  ]);
  assert.equal(report.heldOut.summary.identityPositivesWithEdgeFailure.length, 2);
  assert.equal(report.conclusion, "PROGRESSION CANDIDATE JUSTIFIED FOR FROZEN EXTERNAL VALIDATION");
});

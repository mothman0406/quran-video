import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS, progressionSampleFromFixture, type ProgressionSample } from "../tools/regression/progression-long-path.ts";
import {
  FROZEN_PROGRESSION_VALIDATION_CANDIDATE,
  evaluateFrozenProgressionValidation,
} from "../tools/regression/progression-long-path-validation.ts";
import type { ProgressionTrajectoryFixture } from "../tools/regression/progression-trajectory.ts";

async function genuineSample() {
  const path = join(process.cwd(), "tools/regression/fixtures/progression-trajectory/validation-positive-reader-b-50-16-18.json");
  return progressionSampleFromFixture(JSON.parse(await readFile(path, "utf8")) as ProgressionTrajectoryFixture);
}

function withGates(sample: ProgressionSample, gates: Partial<ProgressionSample["gates"]>): ProgressionSample {
  return { ...sample, gates: { ...sample.gates, ...gates } };
}

function withProgression(sample: ProgressionSample, progression: Partial<NonNullable<ProgressionSample["progression"]>>): ProgressionSample {
  return { ...sample, progression: { ...sample.progression!, ...progression } };
}

test("validation candidate is the exact, immutable frozen progression candidate", () => {
  assert.equal(FROZEN_PROGRESSION_VALIDATION_CANDIDATE, FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS);
  assert.ok(Object.isFrozen(FROZEN_PROGRESSION_VALIDATION_CANDIDATE));
  assert.deepEqual({ ...FROZEN_PROGRESSION_VALIDATION_CANDIDATE }, {
    minimumGeneratedWindows: 5,
    minimumBestCtc: -0.60,
    minimumMargin: 8,
    maximumResetCount: 0,
    maximumNoProgressRun: 2,
  });
  assert.throws(() => { (FROZEN_PROGRESSION_VALIDATION_CANDIDATE as { minimumMargin: number }).minimumMargin = 7; }, TypeError);
});

test("frozen validation candidate enforces each exact boundary", async () => {
  const base = withProgression(withGates(await genuineSample(), {
    fixedSafetyGatesPass: true, totalGeneratedWindows: 5, bestCoherentCtc: -0.60, globalViterbiMargin: 8,
  }), { resetCount: 0, longestNoProgressRun: 2 });
  assert.equal(evaluateFrozenProgressionValidation(base).accepted, true);
  const rejected: Array<[string, ProgressionSample, string]> = [
    ["windows 4", withGates(base, { totalGeneratedWindows: 4 }), "existing-safety"],
    ["best CTC -0.600001", withGates(base, { bestCoherentCtc: -0.600001 }), "existing-safety"],
    ["safety fails", withGates(base, { fixedSafetyGatesPass: false }), "existing-safety"],
    ["margin 7.999999", withGates(base, { globalViterbiMargin: 7.999999 }), "identity-margin"],
    ["reset 1", withProgression(base, { resetCount: 1 }), "progression"],
    ["run 3", withProgression(base, { longestNoProgressRun: 3 }), "progression"],
  ];
  for (const [label, sample, stage] of rejected) {
    const result = evaluateFrozenProgressionValidation(sample);
    assert.equal(result.accepted, false, label);
    assert.equal(result.firstFailedStage, stage, label);
  }
});

test("observational features never change the frozen validation decision", async () => {
  const base = await genuineSample();
  const expected = evaluateFrozenProgressionValidation(base);
  const perturbed = withProgression(base, {
    noveltyRatio: 0, revisitRatio: 1, progressionEfficiency: -1,
    local: { ...base.progression!.local, behindFrontierCount: 99, agreementRatio: 0 },
  });
  assert.deepEqual(evaluateFrozenProgressionValidation(perturbed), expected);
  assert.deepEqual(evaluateFrozenProgressionValidation({ ...base, readerGroup: "unseen", negativeType: "refrain" }), expected);
});

test("validation tooling never calibrates or accepts thresholds", async () => {
  for (const file of ["tools/regression/progression-long-path-validation.ts", "tools/regression/evaluate-progression-long-path-validation.ts"]) {
    const source = await readFile(join(process.cwd(), file), "utf8").catch(() => "");
    assert.equal(/calibrate[A-Z]\w*\(/u.test(source), false, `${file} calls a calibration function`);
    for (const [, args] of source.matchAll(/evaluateProgressionCandidate\(([^)]*)\)/gu)) {
      assert.ok(!args!.includes(",") || /,\s*FROZEN_PROGRESSION_VALIDATION_CANDIDATE\s*$/u.test(args!), `${file} passes non-frozen thresholds`);
    }
  }
});

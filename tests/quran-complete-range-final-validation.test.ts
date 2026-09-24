import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import {
  COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT,
  COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS,
  COMPLETE_RANGE_FINAL_VALIDATION_PROVENANCE,
  COMPLETE_RANGE_FINAL_VALIDATION_STARTING_REVISION,
  FROZEN_COMPLETE_RANGE_CANDIDATE,
} from "../tools/regression/quran-complete-range-final-validation.ts";

const execFileAsync = promisify(execFile);

async function report() {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/evaluate-quran-complete-range-final-validation.ts",
  ], { cwd: process.cwd(), maxBuffer: 12_000_000 });
  return { stdout, parsed: JSON.parse(stdout) };
}

test("the complete-range candidate and all four roles were frozen before capture", () => {
  assert.equal(COMPLETE_RANGE_FINAL_VALIDATION_STARTING_REVISION, "10a598313dd1371341beda254cb5fe10aa077513");
  assert.equal(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT, "2026-09-24T05:37:21Z");
  assert.equal(COMPLETE_RANGE_FINAL_VALIDATION_PROVENANCE, "complete-range-final-external-validation");
  assert.equal(Object.isFrozen(FROZEN_COMPLETE_RANGE_CANDIDATE), true);
  assert.equal(Object.values(FROZEN_COMPLETE_RANGE_CANDIDATE).every(Object.isFrozen), true);
  assert.equal(Object.isFrozen(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS), true);
  assert.equal(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.length, 4);
  assert.deepEqual(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.map((entry) => entry.role), [
    "genuine-start-edge", "genuine-exact-stop", "negative-reset", "negative-out-of-order",
  ]);
  assert.equal(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.every((entry) => entry.appearedInFinalCandidateDesign === false), true);
  assert.throws(() => {
    (FROZEN_COMPLETE_RANGE_CANDIDATE.coreBoundaryLocalization as { coarseStepMs: number }).coarseStepMs = 100;
  }, TypeError);
});

test("ground truth is unavailable to the browser recognition decision", async () => {
  const source = await readFile("tools/regression/browser-quran-complete-range-final-validation.ts", "utf8");
  assert.doesNotMatch(source, /quran-complete-range-final-validation\.ts/u);
  assert.doesNotMatch(source, /expectedRange|sourceRange|orderedAyahSegments|publicReader|sourceDirectory/u);
  assert.match(source, /reconstructCanonicalPassage\(evidence\)/u);
  assert.match(source, /exposeProvisionalLocalCore\(evidence\)/u);
  assert.match(source, /validateWholeRecordingIntegrity\(core, evidence\)/u);
});

test("final evaluator requires exact positives, adversarial rejection, completeness, and historical separation", async () => {
  const first = await report();
  const second = await report();
  assert.equal(first.stdout, second.stdout);
  const result = first.parsed;
  assert.equal(result.newMediaCaptures, 4);
  assert.equal(result.criteria.exactlyFourPredesignatedCases, true);
  assert.equal(result.criteria.freezePrecededAllCases, true);
  assert.equal(result.criteria.bothGenuineExact, true);
  assert.equal(result.criteria.bothAdversariesRejected, true);
  assert.equal(result.criteria.canonicalCompleteness, true);
  assert.equal(result.criteria.maximumFourCapturesRespected, true);
  assert.equal(result.aggregate.genuineExact, "2/2");
  assert.equal(result.aggregate.adversarialRejected, "2/2");
  assert.deepEqual(result.aggregate.falsePositives, []);
  assert.deepEqual(result.aggregate.falseNegatives, []);
  assert.deepEqual(result.rows.filter((row: { expectedRange: string }) => row.expectedRange !== "none").map((row: { finalRange: string }) => row.finalRange).sort(), ["81:8-22", "86:1-12"]);
  assert.equal(result.rows.filter((row: { expectedRange: string }) => row.expectedRange === "none").every((row: { accepted: boolean }) => !row.accepted), true);
  assert.equal(result.regressions.h.finalRange, "91:1-15");
  assert.equal(result.regressions.k.finalRange, "92:1-14");
  assert.equal(result.regressions.positiveB.finalRange, "101:1-11");
  assert.equal(result.regressions.negativeA.rejected, true);
  assert.equal(result.regressions.historicalGenuine, "20/20");
  assert.equal(result.regressions.historicalAdversarial, "23/23");
  assert.equal(result.conclusion, "FINAL FROZEN VALIDATION PASSED");
  assert.equal(result.productionImplementationJustified, true);
});

test("the four committed result fixtures are privacy-safe", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/validate-quran-complete-range-final-privacy.ts",
  ], { cwd: process.cwd() });
  assert.match(stdout, /PASS Quran complete-range final privacy \(4 fixtures; aggregate evidence only\)/u);
});

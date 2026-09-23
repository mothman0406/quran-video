import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS,
  CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATED_AT,
  CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE,
  CANONICAL_RECONSTRUCTION_VALIDATION_STARTING_REVISION,
  FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE,
} from "../tools/regression/canonical-passage-reconstruction-validation.ts";
import { FROZEN_CANONICAL_RECONSTRUCTION_RULE } from "../tools/regression/canonical-passage-reconstruction.ts";

const execFileAsync = promisify(execFile);

test("external validation uses the immutable candidate frozen before all four captures", () => {
  assert.equal(CANONICAL_RECONSTRUCTION_VALIDATION_STARTING_REVISION, "40e27ef8d0d3462dc6155fd6ba41b818a39d68f5");
  assert.equal(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATED_AT, "2026-09-23T21:47:04Z");
  assert.equal(FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE, FROZEN_CANONICAL_RECONSTRUCTION_RULE);
  assert.equal(Object.isFrozen(FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE), true);
  assert.deepEqual(FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE, {
    minimumSupportingWindows: 3,
    minimumDominantSurahFraction: 0.75,
    minimumRunWindowFraction: 0.75,
    backwardWordTolerance: 2,
    maximumSkippedCanonicalWords: 6,
    maximumNoProgressRun: 1,
  });
  assert.throws(() => {
    (FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE as { minimumSupportingWindows: number }).minimumSupportingWindows = 4;
  }, TypeError);
});

test("exactly four predesignated cases have separated external provenance and required roles", () => {
  assert.equal(CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE, "canonical-reconstruction-external-validation");
  assert.equal(Object.isFrozen(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS), true);
  assert.equal(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.length, 4);
  assert.deepEqual(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.map((entry) => entry.role), [
    "positive-a", "positive-b", "negative-a", "negative-b",
  ]);
  assert.equal(new Set(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.map((entry) => entry.id)).size, 4);
  assert.equal(new Set(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.filter((entry) => entry.role.startsWith("positive")).map((entry) => entry.readerGroup)).size, 2);
  assert.equal(CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.every((entry) => Object.isFrozen(entry)), true);
});

test("frozen evaluator fails exact-positive and adversarial criteria without changing history", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/evaluate-canonical-passage-reconstruction-validation.ts",
  ], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const report = JSON.parse(stdout);
  assert.equal(report.newMediaCaptures, 4);
  assert.equal(report.criteria.exactlyFourPredesignatedFixtures, true);
  assert.equal(report.criteria.provenanceSeparated, true);
  assert.equal(report.criteria.bothPositivesExact, false);
  assert.equal(report.criteria.bothAdversariesRejected, false);
  assert.equal(report.criteria.canonicalCompleteness, true);
  assert.equal(report.criteria.historicalFixtureDigestUnchanged, true);
  assert.equal(report.criteria.historicalGenuineUnchanged, true);
  assert.equal(report.criteria.historicalAdversarialUnchanged, true);
  assert.equal(report.historical.h.reconstructedRange, "91:1-15");
  assert.equal(report.historical.k.reconstructedRange, "92:1-14");
  assert.deepEqual(report.newFalsePositives, ["canonical-validation-negative-reader-l-100-reset"]);
  assert.deepEqual(report.newFalseNegatives, ["canonical-validation-positive-reader-m-101-1-11"]);
  const positiveA = report.rows.find((row: { role: string }) => row.role === "positive-a");
  const positiveB = report.rows.find((row: { role: string }) => row.role === "positive-b");
  const negativeA = report.rows.find((row: { role: string }) => row.role === "negative-a");
  const negativeB = report.rows.find((row: { role: string }) => row.role === "negative-b");
  assert.equal(positiveA.reconstructedRange, "100:1-11");
  assert.equal(positiveA.exactPositive, true);
  assert.equal(positiveA.canonicalCompleteness, true);
  assert.equal(positiveB.localImpliedRange, "101:2-11");
  assert.equal(positiveB.reconstructedRange, "none");
  assert.equal(positiveB.exactPositive, false);
  assert.deepEqual(positiveB.rejectionReasons, ["no-dominant-continuous-run"]);
  assert.equal(negativeA.reconstructedRange, "100:1-11");
  assert.equal(negativeA.continuousRunSupport, 0.769231);
  assert.equal(negativeA.resetCount, 1);
  assert.equal(negativeA.longestNoProgressRun, 4);
  assert.equal(negativeA.adversarialRejected, false);
  assert.equal(negativeB.reconstructedRange, "none");
  assert.equal(negativeB.adversarialRejected, true);
  assert.equal(report.conclusion, "EXTERNAL VALIDATION FAILED");
  assert.equal(report.productionImplementationJustified, false);
});

test("committed validation fixtures retain only privacy-safe evidence", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/validate-canonical-passage-reconstruction-privacy.ts",
  ], { cwd: process.cwd() });
  assert.match(stdout, /PASS canonical reconstruction validation privacy \(4 fixtures\)/u);
});

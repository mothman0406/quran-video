import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("offline calibration evaluates long positives, failures, scalar separation, and feature distributions", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-ctc-calibration.ts"], { cwd: process.cwd(), maxBuffer: 2_000_000 });
  const report = JSON.parse(stdout);
  assert.deepEqual(report.corpus.shortPositiveIds, ["muddaththir-74-1-9", "positive-hani-69-19-22"]);
  assert.deepEqual(report.corpus.longPositiveIds, ["surah-2-258-259", "surah-6-74-77", "positive-alafasy-93-1-11", "positive-alafasy-94-1-8", "positive-hani-3-33-35"]);
  assert.deepEqual(report.corpus.recognitionFailureCandidateIds, ["positive-husary-75-1-15"]);
  assert.equal(report.corpus.longPositiveReciterGroups.length, 3);
  assert.equal(report.bestLongPositiveRawSeparation.exists, false);
  assert.equal(report.bestLongPositiveGateConditionedSeparation.name, "upperHalfMean");
  assert.equal(report.bestLongPositiveGateConditionedSeparation.margin, 0.212139);
  assert.deepEqual(Object.keys(report.featureDistributions.correctLongPositives.vectors["positive-alafasy-94-1-8"]), ["coherentRatio", "coverage", "agreementRatio", "globalMargin", "lexicalUniqueness", "longestUnsupportedRun", "anchorActivationIndex", "postAnchorAdvances", "fractionAboveNegative060", "fractionAboveNegative080", "fractionAboveNegative100", "medianCtc", "bestCtc", "worstCtc", "postAnchorMedian", "postAnchorSupportRatio"]);
});

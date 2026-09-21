import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  FROZEN_EXTERNAL_VALIDATION_THRESHOLDS,
  evaluateFrozenExternalValidationRule,
} from "../tools/regression/multisignal-long-path-validation.ts";
import type { NormalizedLongPathFeature } from "../tools/regression/multisignal-long-path.ts";

const execFileAsync = promisify(execFile);

test("external-validation thresholds are exact, immutable, and fixture-independent", () => {
  assert.deepEqual(FROZEN_EXTERNAL_VALIDATION_THRESHOLDS, {
    minimumGeneratedWindows: 5,
    minimumMargin: 8,
    minimumBestCtc: -0.60,
    minimumFractionAtLeastNegative060: 0.25,
  });
  assert.equal(Object.isFrozen(FROZEN_EXTERNAL_VALIDATION_THRESHOLDS), true);

  const feature = {
    fixedSafetyGatesPass: true,
    totalGeneratedWindows: 5,
    globalViterbiMargin: 8,
    bestCoherentCtc: -0.60,
    fractionAtLeastNegative060: 0.25,
  } as NormalizedLongPathFeature;
  assert.equal(evaluateFrozenExternalValidationRule(feature).accepted, true);
  assert.equal(evaluateFrozenExternalValidationRule({ ...feature, totalGeneratedWindows: 4 }).accepted, false);
  assert.equal(evaluateFrozenExternalValidationRule({ ...feature, globalViterbiMargin: 7.999999 }).accepted, false);
  assert.equal(evaluateFrozenExternalValidationRule({ ...feature, bestCoherentCtc: -0.600001 }).accepted, false);
  assert.equal(evaluateFrozenExternalValidationRule({ ...feature, fractionAtLeastNegative060: 0.249999 }).accepted, false);
});

test("offline multi-signal evaluation keeps classifications, holdouts, and protective cases explicit", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-multisignal-long-path.ts"], { cwd: process.cwd(), maxBuffer: 4_000_000 });
  const report = JSON.parse(stdout);
  assert.equal(report.corpus.total, 27);
  assert.deepEqual(report.corpus.classCounts, {
    "known-positive": 5,
    "short-positive": 2,
    "real-negative": 5,
    "logical-negative": 13,
    observational: 1,
    "recognition-failure-known-ground-truth": 1,
  });
  assert.deepEqual(report.recommended.falseNegatives, []);
  assert.deepEqual(report.recommended.falsePositives, []);
  assert.ok(report.leaveOnePositiveOut.every((fold: { accepted: boolean }) => fold.accepted));
  assert.ok(report.leaveOneRealNegativeOut.every((fold: { accepted: boolean }) => !fold.accepted));
  assert.equal(report.recommended.results.find((result: { id: string }) => result.id === "isolated-strong-window").accepted, false);
  assert.equal(report.recommended.results.find((result: { id: string }) => result.id === "repeated-93-1").accepted, false);
  assert.equal(report.recommended.results.find((result: { id: string }) => result.id === "repeated-6-77").accepted, false);
  assert.equal(report.recommended.results.find((result: { id: string }) => result.id === "mixed-noncontiguous-quran").accepted, false);
  assert.equal(report.recommended.results.find((result: { id: string }) => result.id === "backward-6-77-to-74").accepted, false);
  assert.equal(report.husary.evaluation.accepted, false);
  assert.equal(report.husary.rangePassedIfAccepted, null);
});

test("external-validation evaluator keeps provenance separate and reports frozen-rule failures", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-multisignal-long-path-validation.ts"], { cwd: process.cwd(), maxBuffer: 4_000_000 });
  const report = JSON.parse(stdout);
  assert.deepEqual(report.frozenThresholds, {
    minimumGeneratedWindows: 5,
    minimumMargin: 8,
    minimumBestCtc: -0.60,
    minimumFractionAtLeastNegative060: 0.25,
  });
  assert.equal(report.designCorpus.passes, true);
  assert.deepEqual(report.designCorpus.regression, {
    knownLongPositivesPassing: 5,
    knownLongPositiveCount: 5,
    realNegativesRejecting: 5,
    realNegativeCount: 5,
    logicalNegativesRejecting: 13,
    logicalNegativeCount: 13,
  });
  assert.equal(report.externalValidationCorpus.positives, 3);
  assert.equal(report.externalValidationCorpus.negatives, 3);
  assert.equal(report.externalValidationCorpus.independentPositiveReaderGroups, 2);
  assert.deepEqual(report.externalValidationCorpus.falseNegatives, ["validation-positive-reader-a-66-1-7"]);
  assert.deepEqual(report.externalValidationCorpus.falsePositives, ["validation-negative-reader-b-repeated"]);
  assert.ok(report.externalValidationCorpus.results.every((result: { corpusRole: string }) => result.corpusRole === "external-validation"));
  assert.equal(report.conclusion, "EXTERNAL VALIDATION FAILED");
});

test("external-validation fixtures retain only privacy-safe evidence", async () => {
  const directory = join(process.cwd(), "tools/regression/fixtures/multisignal-validation");
  const fixtures = await Promise.all((await readdir(directory)).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8"))));
  assert.equal(fixtures.length, 6);
  assert.ok(fixtures.every((fixture) => fixture.corpusRole === "external-validation"));
  const serialized = JSON.stringify(fixtures).toLowerCase();
  for (const forbidden of ["filename", "filepath", "sourcepath", "transcript", "sha256", "qurantext", "/users/", "device", "remoteaddress", "useragent"]) {
    assert.equal(serialized.includes(forbidden), false, `validation fixture unexpectedly contains ${forbidden}`);
  }
  const keys = JSON.stringify(fixtures, (key, value) => ["pcm", "samples", "channelbuffers"].includes(key.toLowerCase()) ? `forbidden:${key}` : value);
  assert.equal(keys.includes("forbidden:"), false, "validation fixtures must not retain PCM or sample buffers");
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

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

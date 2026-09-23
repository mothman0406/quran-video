import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  type CanonicalPassageWindowEvidence,
} from "../tools/regression/canonical-passage-reconstruction.ts";

const execFileAsync = promisify(execFile);

function windows(spans: readonly ([number, number] | null)[], surah = 91): CanonicalPassageWindowEvidence[] {
  return spans.map((span, windowIndex) => ({
    windowIndex,
    localWinner: span ? {
      surah,
      startAyah: span[0],
      endAyah: span[1],
      relativeStartWord: span[0] * 4,
      relativeEndWord: span[1] * 4 + 3,
      ctc: windowIndex < 3 ? -5 : -0.5,
      coverage: 0.5,
      origin: "global",
    } : null,
    coherentPathCandidate: windowIndex < 3 || !span ? null : {
      surah, startAyah: span[0], endAyah: span[1], relativeStartWord: span[0] * 4,
      relativeEndWord: span[1] * 4 + 3, ctc: -0.5, coverage: 0.5, origin: "global", origins: ["global"],
    },
    anchorEvent: "none",
  }));
}

test("overlapping local winners reconstruct weak early evidence and ignore coherent nulls", () => {
  const evidence = windows([[1, 5], [4, 8], [6, 10], [8, 12], [10, 13], [13, 14], [14, 15]]);
  const first = reconstructCanonicalPassage(evidence);
  const second = reconstructCanonicalPassage(evidence);
  assert.deepEqual(first, second);
  assert.deepEqual(first.passage && [first.passage.surah, first.passage.startAyah, first.passage.endAyah], [91, 1, 15]);
  assert.equal(first.passage?.confidence.startSupport, 1);
  assert.equal(first.passage?.confidence.endSupport, 1);
  assert.deepEqual(first.passage?.evidence.supportingWindows, [0, 1, 2, 3, 4, 5, 6]);
});

test("canonical expansion includes every ayah in an accepted inclusive range", () => {
  assert.deepEqual(expandCanonicalAyahRange({ surah: 91, startAyah: 1, endAyah: 3 }), [
    { surah: 91, startAyah: 1, endAyah: 1 },
    { surah: 91, startAyah: 2, endAyah: 2 },
    { surah: 91, startAyah: 3, endAyah: 3 },
  ]);
});

test("backward resets, complete repetition, partial reset, and plateau reject", () => {
  assert.equal(reconstructCanonicalPassage(windows([[8, 11], [9, 14], [1, 4], [2, 7]])).passage, null);
  assert.equal(reconstructCanonicalPassage(windows([[1, 4], [3, 8], [7, 10], [1, 4], [3, 8], [7, 10]])).passage, null);
  assert.equal(reconstructCanonicalPassage(windows([[1, 4], [3, 8], [7, 10], [9, 12], [1, 4], [3, 8]])).passage, null);
  assert.equal(reconstructCanonicalPassage(windows([[1, 4], [1, 4], [1, 4], [1, 4]])).passage, null);
});

test("cross-surah mixtures reject while refrain-heavy canonical coordinates continue forward", () => {
  const mixed = windows([[1, 4], [3, 6], null, null]);
  mixed[2]!.localWinner = { ...mixed[0]!.localWinner!, surah: 92, startAyah: 7, endAyah: 10 };
  mixed[3]!.localWinner = { ...mixed[0]!.localWinner!, surah: 92, startAyah: 9, endAyah: 12 };
  assert.equal(reconstructCanonicalPassage(mixed).passage, null);
  assert.deepEqual(reconstructCanonicalPassage(windows([[15, 17], [17, 19], [19, 19], [19, 21], [20, 22]], 54)).passage?.endAyah, 22);
});

test("held-out provenance and full retained-corpus result remain frozen", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-canonical-passage-reconstruction.ts"], {
    cwd: process.cwd(), maxBuffer: 8_000_000,
  });
  const report = JSON.parse(stdout);
  assert.equal(report.freezeProtocol.hExcludedFromDesign, true);
  assert.equal(report.heldOut.h.reconstructedRange, "91:1-15");
  assert.equal(report.heldOut.k.reconstructedRange, "92:1-14");
  assert.deepEqual(report.adversarial.falseContinuousPassages, []);
  assert.equal(report.conclusion, "CANDIDATE JUSTIFIED FOR ONE FROZEN EXTERNAL VALIDATION");
});

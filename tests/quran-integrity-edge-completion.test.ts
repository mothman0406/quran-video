import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  type CanonicalPassageWindowEvidence,
} from "../tools/regression/canonical-passage-reconstruction.ts";
import {
  completeBoundedEdges,
  FROZEN_BOUNDED_EDGE_RULE,
  type EdgeAcousticEvidence,
} from "../tools/regression/quran-edge-completion.ts";
import {
  FROZEN_WHOLE_RECORDING_INTEGRITY_RULE,
  validateWholeRecordingIntegrity,
} from "../tools/regression/quran-whole-recording-integrity.ts";

const execFileAsync = promisify(execFile);

function windows(spans: readonly ([number, number] | null)[], surah = 90): CanonicalPassageWindowEvidence[] {
  return spans.map((span, windowIndex) => ({
    windowIndex,
    localWinner: span ? {
      surah,
      startAyah: span[0],
      endAyah: span[1],
      relativeStartWord: span[0] * 4,
      relativeEndWord: span[1] * 4 + 3,
      ctc: -0.5,
      coverage: 1,
      origin: "global",
    } : null,
    coherentPathCandidate: null,
    anchorEvent: "none",
  }));
}

function acceptedCore(spans: readonly ([number, number] | null)[]) {
  const evidence = windows(spans);
  const passage = reconstructCanonicalPassage(evidence).passage;
  assert.ok(passage);
  return { evidence, passage };
}

function acoustic(edge: "start" | "end", candidateAyah: number): EdgeAcousticEvidence {
  return {
    edge,
    candidateAyah,
    voicedDurationMs: 820,
    candidateTokenCount: 5,
    alignedTokenCount: 5,
    candidateLogLikelihoodPerFrame: -0.4,
    noExtensionLogLikelihoodPerFrame: -0.7,
    alignmentComplete: true,
    temporallyOrderedOutsideCore: true,
    overlapsCoreAudio: false,
    optionalBasmalahOnly: false,
  };
}

test("whole-recording integrity ignores weak/null tails and ordinary single terminal overlap", () => {
  const { evidence, passage } = acceptedCore([[1, 3], [2, 5], [4, 7], [6, 9]]);
  evidence.push(...windows([null], 90).map((window) => ({ ...window, windowIndex: 4 })));
  evidence.push(...windows([[8, 9]], 90).map((window) => ({ ...window, windowIndex: 5 })));
  const result = validateWholeRecordingIntegrity(passage, evidence);
  assert.equal(result.valid, true);
  assert.deepEqual(result.vetoes, []);
  assert.deepEqual(result.metrics.afterCoreWindows, [4, 5]);
  assert.equal(result.metrics.outsideVoicedDurationMs, null);
});

test("repeated Quran reset after a strong core is a positive contradiction", () => {
  const { evidence, passage } = acceptedCore([[1, 3], [2, 5], [4, 7], [6, 9]]);
  evidence.push(...windows([[1, 3], [2, 5], [4, 6]]).map((window, index) => ({ ...window, windowIndex: index + 4 })));
  const first = validateWholeRecordingIntegrity(passage, evidence);
  const second = validateWholeRecordingIntegrity(passage, evidence);
  assert.deepEqual(first, second);
  assert.equal(first.valid, false);
  assert.ok(first.vetoes.includes("reset-or-revisit-run"));
  assert.ok(first.vetoes.includes("repeated-covered-quran-run"));
  assert.equal(first.metrics.resetCount, 3);
  assert.equal(first.metrics.longestResetOrRevisitRun, 3);
  assert.equal(first.metrics.longestNoProgressRun, 3);
});

test("cross-surah and incompatible forward runs veto, but one outlier does not", () => {
  const base = acceptedCore([[1, 3], [2, 5], [4, 7], [6, 9]]);
  const one = [...base.evidence, { ...windows([[1, 2]], 91)[0]!, windowIndex: 4 }];
  assert.equal(validateWholeRecordingIntegrity(base.passage, one).valid, true);
  const cross = [...one, { ...windows([[2, 3]], 91)[0]!, windowIndex: 5 }];
  assert.deepEqual(validateWholeRecordingIntegrity(base.passage, cross).vetoes, ["cross-surah-run"]);
  const forward = [...base.evidence,
    { ...windows([[12, 13]])[0]!, windowIndex: 4 },
    { ...windows([[13, 14]])[0]!, windowIndex: 5 }];
  assert.deepEqual(validateWholeRecordingIntegrity(base.passage, forward).vetoes, ["incompatible-forward-run"]);
});

test("bounded acoustic competition extends only the immediately adjacent ayah", () => {
  const core = { surah: 101, startAyah: 2, endAyah: 10 };
  const result = completeBoundedEdges({
    core,
    surahAyahCount: 11,
    startEvidence: acoustic("start", 1),
    endEvidence: acoustic("end", 11),
  });
  assert.deepEqual(result.range, { surah: 101, startAyah: 1, endAyah: 11 });
  assert.equal(result.start.extended, true);
  assert.equal(result.end.extended, true);
  assert.deepEqual(result.canonicalAyat, expandCanonicalAyahRange(result.range));
});

test("no extension wins without complete comparative acoustic evidence", () => {
  const core = { surah: 92, startAyah: 1, endAyah: 14 };
  const losing = { ...acoustic("end", 15), candidateLogLikelihoodPerFrame: -0.8 };
  const absent = completeBoundedEdges({ core, surahAyahCount: 21, startEvidence: null, endEvidence: null });
  const loss = completeBoundedEdges({ core, surahAyahCount: 21, startEvidence: null, endEvidence: losing });
  assert.deepEqual(absent.range, core);
  assert.deepEqual(loss.range, core);
  assert.ok(loss.end.reasons.includes("no-extension-hypothesis-wins"));
});

test("edge completion rejects partial coverage, core theft, unbounded ayat, and optional basmalah", () => {
  const core = { surah: 90, startAyah: 2, endAyah: 11 };
  const cases = [
    { ...acoustic("start", 1), alignedTokenCount: 4 },
    { ...acoustic("start", 1), overlapsCoreAudio: true },
    { ...acoustic("start", 0), candidateAyah: 0 },
    { ...acoustic("start", 1), optionalBasmalahOnly: true },
  ];
  for (const evidence of cases) {
    const result = completeBoundedEdges({ core, surahAyahCount: 20, startEvidence: evidence, endEvidence: null });
    assert.equal(result.start.extended, false);
    assert.deepEqual(result.range, core);
  }
});

test("frozen conditions are immutable and keep expansion to one ayah per edge", () => {
  assert.equal(Object.isFrozen(FROZEN_WHOLE_RECORDING_INTEGRITY_RULE), true);
  assert.equal(Object.isFrozen(FROZEN_BOUNDED_EDGE_RULE), true);
  assert.deepEqual(FROZEN_WHOLE_RECORDING_INTEGRITY_RULE, {
    minimumContradictoryRunWindows: 2,
    resetWordTolerance: 2,
  });
  assert.deepEqual(FROZEN_BOUNDED_EDGE_RULE, {
    maximumAyahExpansionPerEdge: 1,
    minimumVoicedDurationMs: 320,
    requireCompleteTargetCoverage: true,
    requireDirectNoExtensionWin: true,
  });
  assert.throws(() => {
    (FROZEN_BOUNDED_EDGE_RULE as { maximumAyahExpansionPerEdge: number }).maximumAyahExpansionPerEdge = 2;
  }, TypeError);
});

test("post-freeze evaluation excludes external failures from calibration and is deterministic", async () => {
  const run = () => execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/evaluate-quran-integrity-edge-completion.ts",
  ], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.frozenBeforeExternalEvaluation, true);
  assert.deepEqual(report.calibrationExclusions, [
    "canonical-validation-positive-reader-m-101-1-11",
    "canonical-validation-negative-reader-l-100-reset",
  ]);
  assert.equal(report.design.genuineExact, "18/18");
  assert.equal(report.design.adversarialRejected, "23/23");
  assert.equal(report.externalPostFreeze.positiveB.finalRange, "none");
  assert.equal(report.externalPostFreeze.positiveB.edgeResult, null);
  assert.equal(report.externalPostFreeze.negativeA.rejected, true);
  assert.deepEqual(report.externalPostFreeze.negativeA.integrityVetoes, [
    "reset-or-revisit-run", "repeated-covered-quran-run",
  ]);
  assert.equal(report.historical.h.finalRange, "91:1-15");
  assert.equal(report.historical.k.finalRange, "92:1-14");
  assert.equal(report.historical.genuineExact, "20/20");
  assert.equal(report.historical.adversarialRejected, "23/23");
  assert.equal(report.canonicalCompleteness, true);
  assert.equal(report.conclusion, "NO CANDIDATE");
});

test("integrity/edge investigation retains no media or sensitive capture fields", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "--experimental-strip-types", "tools/regression/validate-quran-integrity-edge-privacy.ts",
  ], { cwd: process.cwd() });
  assert.match(stdout, /PASS Quran integrity\/edge privacy \(4 source files; no new media fixtures\)/u);
});

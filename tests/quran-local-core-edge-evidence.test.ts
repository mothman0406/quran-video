import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { expandCanonicalAyahRange, type CanonicalPassageWindowEvidence } from "../tools/regression/canonical-passage-reconstruction.ts";
import { FROZEN_BOUNDARY_EVIDENCE_RULE, normalizedBlankCtcLogLikelihood } from "../tools/regression/quran-boundary-evidence.ts";
import { completeBoundedEdges, type EdgeAcousticEvidence } from "../tools/regression/quran-edge-completion.ts";
import { exposeProvisionalLocalCore, FROZEN_PROVISIONAL_LOCAL_CORE_RULE } from "../tools/regression/quran-local-core.ts";
import { validateWholeRecordingIntegrity } from "../tools/regression/quran-whole-recording-integrity.ts";

const execFileAsync = promisify(execFile);

function windows(spans: readonly ({ surah?: number; start: number; end: number } | null)[]): CanonicalPassageWindowEvidence[] {
  return spans.map((span, windowIndex) => ({
    windowIndex,
    localWinner: span ? {
      surah: span.surah ?? 101,
      startAyah: span.start,
      endAyah: span.end,
      relativeStartWord: null,
      relativeEndWord: null,
      ctc: -5,
      coverage: null,
      origin: "global",
    } : null,
    coherentPathCandidate: null,
    anchorEvent: "none",
  }));
}

function acoustic(edge: "start" | "end", candidateAyah: number): EdgeAcousticEvidence {
  return {
    edge,
    candidateAyah,
    voicedDurationMs: 800,
    candidateTokenCount: 6,
    alignedTokenCount: 6,
    candidateLogLikelihoodPerFrame: -0.4,
    noExtensionLogLikelihoodPerFrame: -0.7,
    alignmentComplete: true,
    temporallyOrderedOutsideCore: true,
    overlapsCoreAudio: false,
    optionalBasmalahOnly: false,
  };
}

test("all-null coherent path can expose only the strong chronological local core", () => {
  const evidence = windows([{ start: 2, end: 4 }, { start: 4, end: 6 }, { start: 5, end: 7 }, { start: 7, end: 9 }, { start: 9, end: 11 }]);
  const decision = exposeProvisionalLocalCore(evidence);
  assert.deepEqual(decision.rejectionReasons, []);
  assert.equal(decision.core?.provisional, true);
  assert.equal(decision.core?.authority, "local-winners-only");
  assert.deepEqual(decision.core && { surah: decision.core.surah, startAyah: decision.core.startAyah, endAyah: decision.core.endAyah }, { surah: 101, startAyah: 2, endAyah: 11 });
  assert.equal(validateWholeRecordingIntegrity(decision.core!, evidence).valid, true);
});

test("reset may expose only a provisional sub-run while repetition and cross-surah mixtures reject", () => {
  const resetEvidence = windows([
    { start: 1, end: 3 }, { start: 2, end: 4 }, { start: 3, end: 5 }, { start: 4, end: 6 },
    { start: 5, end: 7 }, { start: 6, end: 8 }, { start: 1, end: 3 }, { start: 2, end: 4 },
  ]).map((window) => window.localWinner ? { ...window, localWinner: {
    ...window.localWinner,
    relativeStartWord: window.localWinner.startAyah * 4,
    relativeEndWord: window.localWinner.endAyah * 4 + 3,
  } } : window);
  const reset = exposeProvisionalLocalCore(resetEvidence);
  const repeated = exposeProvisionalLocalCore(windows([{ start: 1, end: 3 }, { start: 2, end: 4 }, { start: 1, end: 3 }, { start: 2, end: 4 }]));
  const cross = exposeProvisionalLocalCore(windows([
    { surah: 90, start: 1, end: 3 }, { surah: 91, start: 1, end: 3 },
    { surah: 90, start: 3, end: 5 }, { surah: 91, start: 3, end: 5 },
  ]));
  assert.ok(reset.core);
  assert.equal(validateWholeRecordingIntegrity(reset.core, resetEvidence).valid, false);
  assert.equal(repeated.core, null);
  assert.equal(cross.core, null);
});

test("whole-recording integrity still vetoes repeated evidence outside a provisional sub-run", () => {
  const evidence = windows([
    { start: 1, end: 3 }, { start: 2, end: 5 }, { start: 4, end: 7 }, { start: 6, end: 9 }, { start: 8, end: 11 }, { start: 10, end: 13 },
    { start: 1, end: 3 }, { start: 2, end: 5 },
  ]).map((window) => window.localWinner ? {
    ...window,
    localWinner: {
      ...window.localWinner,
      relativeStartWord: window.localWinner.startAyah * 4,
      relativeEndWord: window.localWinner.endAyah * 4 + 3,
    },
  } : window);
  const decision = exposeProvisionalLocalCore(evidence);
  assert.ok(decision.core);
  assert.deepEqual(validateWholeRecordingIntegrity(decision.core, evidence).vetoes, ["reset-or-revisit-run", "repeated-covered-quran-run"]);
});

test("bounded start and end edges extend on complete wins and abstain on real losses", () => {
  const core = { surah: 90, startAyah: 2, endAyah: 11 };
  const yes = completeBoundedEdges({ core, surahAyahCount: 20, startEvidence: acoustic("start", 1), endEvidence: acoustic("end", 12) });
  assert.deepEqual(yes.range, { surah: 90, startAyah: 1, endAyah: 12 });
  const noStart = { ...acoustic("start", 1), candidateLogLikelihoodPerFrame: -0.8 };
  const noEnd = { ...acoustic("end", 12), voicedDurationMs: 0 };
  const no = completeBoundedEdges({ core, surahAyahCount: 20, startEvidence: noStart, endEvidence: noEnd });
  assert.deepEqual(no.range, core);
});

test("coverage, ordering, core theft, and basmalah remain mandatory independent conditions", () => {
  const core = { surah: 101, startAyah: 2, endAyah: 10 };
  const failures = [
    { ...acoustic("start", 1), alignedTokenCount: 5 },
    { ...acoustic("start", 1), temporallyOrderedOutsideCore: false },
    { ...acoustic("start", 1), overlapsCoreAudio: true },
    { ...acoustic("start", 1), optionalBasmalahOnly: true },
  ];
  for (const evidence of failures) assert.equal(completeBoundedEdges({ core, surahAyahCount: 11, startEvidence: evidence, endEvidence: null }).start.extended, false);
});

test("blank/no-extension likelihood is a real normalized CTC acoustic path", () => {
  const logits = { values: new Float32Array([0, 2, 0, 0, 2, 0]), frames: 2, vocabularySize: 3 };
  const score = normalizedBlankCtcLogLikelihood(logits, 1);
  assert.ok(score !== null && score < 0);
  assert.equal(score, normalizedBlankCtcLogLikelihood(logits, 1));
});

test("frozen local-core and boundary rules are immutable and reader-agnostic", () => {
  assert.equal(Object.isFrozen(FROZEN_PROVISIONAL_LOCAL_CORE_RULE), true);
  assert.equal(Object.isFrozen(FROZEN_BOUNDARY_EVIDENCE_RULE), true);
  assert.equal("reader" in FROZEN_PROVISIONAL_LOCAL_CORE_RULE, false);
  assert.equal("surah" in FROZEN_PROVISIONAL_LOCAL_CORE_RULE, false);
  assert.throws(() => {
    (FROZEN_PROVISIONAL_LOCAL_CORE_RULE as { minimumSupportingWindows: number }).minimumSupportingWindows = 2;
  }, TypeError);
});

test("post-freeze evaluator excludes Positive B, preserves regressions, completeness, and provisional non-acceptance", async () => {
  const run = () => execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-quran-local-core-edge.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.deepEqual(report.calibrationExclusions, ["canonical-validation-positive-reader-m-101-1-11", "canonical-validation-negative-reader-l-100-reset"]);
  assert.equal(report.design.edgePositive.decision, false);
  assert.equal(report.design.edgeNegative.decision, false);
  assert.equal(report.design.distinguishesEdges, false);
  assert.equal(report.externalPostFreeze.positiveB.provisionalRange, "101:2-11");
  assert.equal(report.externalPostFreeze.positiveB.integrityValid, true);
  assert.equal(report.externalPostFreeze.positiveB.finalCombinedRange, "none");
  assert.equal(report.externalPostFreeze.negativeA.integrityValid, false);
  assert.deepEqual(report.externalPostFreeze.negativeA.integrityVetoes, ["reset-or-revisit-run", "repeated-covered-quran-run"]);
  assert.equal(report.historical.h.finalRange, "91:1-15");
  assert.equal(report.historical.k.finalRange, "92:1-14");
  assert.equal(report.historical.genuineExact, "20/20");
  assert.equal(report.historical.adversarialRejected, "23/23");
  assert.equal(report.canonicalCompleteness, true);
  assert.equal(report.conclusion, "NO CANDIDATE");
  assert.equal(report.totalMediaRecognitionRuns, 3);
});

test("canonical range expansion remains inclusive, ordered, and unique", () => {
  const expanded = expandCanonicalAyahRange({ surah: 101, startAyah: 1, endAyah: 11 });
  assert.equal(expanded.length, 11);
  assert.equal(new Set(expanded.map((ayah) => `${ayah.surah}:${ayah.startAyah}`)).size, 11);
  assert.deepEqual(expanded.map((ayah) => ayah.startAyah), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test("retained boundary fixtures pass privacy validation", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/validate-quran-local-core-edge-privacy.ts"], { cwd: process.cwd() });
  assert.match(stdout, /PASS Quran local-core\/edge privacy \(2 fixtures; no media or PCM\)/u);
});

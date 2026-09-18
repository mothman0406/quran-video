import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createCtcCalibrationCapture, parseMediaDebugEvents } from "../tools/regression/ctc-calibration-capture.ts";
import { calibrationCaptureToPathFixture } from "../tools/regression/ctc-calibration-corpus.ts";

const prefix = "[Quran AutoCaption debug]";
const line = (event: string, facts: unknown) => `${prefix} ${event} ${JSON.stringify(facts)}`;

test("calibration capture whitelists chronological CTC, anchor, weight, and final gate evidence", () => {
  const log = [
    "unrelated browser output containing a private file name",
    line("vad-window-summary", { totalGeneratedIdentificationWindows: 2, usableWindows: 2, windows: [{ index: 0, voicedMs: 7000 }, { index: 1, voicedMs: 6500 }] }),
    line("fastconformer-window-result", { index: 0, continuation: { anchorActive: true, event: "anchor-activated", reason: "discarded" } }),
    line("fastconformer-window-result", { index: 1, continuation: { anchorActive: true, event: "anchor-advanced", reason: "discarded" } }),
    line("ctc-gate-input", { windowIndex: 1, voicedMs: 6500, coherentPathCandidate: { normalizedCtcScore: -0.2, targetCoverage: 0.75, targetTokenCount: 8, origins: ["continuation"] }, independentWindowWinner: { secret: "discarded" } }),
    line("ctc-gate-input", { windowIndex: 0, voicedMs: 7000, coherentPathCandidate: null }),
    line("final-passage-decision", { usableWindowCount: 2, agreeingWindowCount: 1, coherentRatio: 0.5, coverage: 0.7, longestUnsupportedRun: 1, margin: 0.1, lexicalUniqueness: 0.4, structuralValidity: true, surahConsistency: true, bestWindowCtc: -0.2, coherentPathMeanCtc: -0.2, decision: "abstained", proposedSurah: 74, startAyah: 1, endAyah: 9, failedAcceptanceRules: ["window-agreement"] }),
    line("final-identity-decision", { decision: "accepted", authority: "whisper-fallback", proposedSurah: 74, startAyah: 1, endAyah: 9 }),
  ].join("\n");
  const capture = createCtcCalibrationCapture(log, { id: "repeated-phrase", expected: { outcome: "negative", intent: "Repetition must not imply progress.", surah: 74, startAyah: 1, endAyah: 1 } });
  assert.deepEqual(capture.windows.map((window) => [window.index, window.coherentPathCtc, window.anchorEvent]), [[0, null, "anchor-activated"], [1, -0.2, "anchor-advanced"]]);
  assert.equal(capture.fastConformerOutcome, "abstained");
  assert.equal(capture.finalOutcome, "accepted");
  assert.equal(capture.finalAuthority, "whisper-fallback");
  assert.deepEqual(capture.fastConformerProposedRange, { surah: 74, startAyah: 1, endAyah: 9 });
  assert.deepEqual(capture.finalProposedRange, { surah: 74, startAyah: 1, endAyah: 9 });
  assert.equal(JSON.stringify(capture).includes("private file"), false);
  assert.equal(JSON.stringify(capture).includes("secret"), false);
  assert.equal(JSON.stringify(capture).includes("reason"), false);
  const fixture = calibrationCaptureToPathFixture(capture);
  assert.deepEqual(fixture.voicedDurationWeights, [7000, 6500]);
  assert.deepEqual(fixture.targetCoverageWeights, [0, 0.75]);
  assert.equal(fixture.otherProductionGatesPass, false);
});

test("debug parser tolerates DevTools prefixes and ignores malformed copied rows", () => {
  const events = parseMediaDebugEvents(`12:00 INFO ${line("one", { ok: true })}\n${prefix} broken {\n`);
  assert.deepEqual(events, [{ event: "one", facts: { ok: true } }]);
});

test("capture uses only the latest browser run when DevTools replays an earlier session", () => {
  const run = (score: number) => [
    line("build-marker", { buildCommit: "local-development" }),
    line("vad-window-summary", { totalGeneratedIdentificationWindows: 1, windows: [{ index: 0, voicedMs: 5000 }] }),
    line("fastconformer-window-result", { index: 0, continuation: { anchorActive: false, event: "none" } }),
    line("ctc-gate-input", { windowIndex: 0, voicedMs: 5000, coherentPathCandidate: { normalizedCtcScore: score, targetCoverage: 1, targetTokenCount: 8, origins: ["global"] } }),
    line("final-passage-decision", { usableWindowCount: 1, agreeingWindowCount: 1, coherentRatio: 1, coverage: 1, longestUnsupportedRun: 0, margin: 1, lexicalUniqueness: 0.5, structuralValidity: true, surahConsistency: true, bestWindowCtc: score, coherentPathMeanCtc: score, decision: "accepted", proposedSurah: 94, startAyah: 1, endAyah: 8, failedAcceptanceRules: [] }),
  ];
  const capture = createCtcCalibrationCapture([...run(-2), ...run(-0.3)].join("\n"), { id: "latest-session", expected: { outcome: "positive", intent: "Latest run only.", surah: 94, startAyah: 1, endAyah: 8 } });
  assert.deepEqual(capture.windows.map((window) => window.coherentPathCtc), [-0.3]);
});

test("retained acoustic captures are privacy-safe and include real positive and negative distributions", async () => {
  const directory = join(process.cwd(), "tools/regression/fixtures/ctc-calibration");
  const captures = await Promise.all((await readdir(directory)).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8"))));
  assert.deepEqual(captures.map((capture) => capture.id), ["backward-6-77-to-74", "isolated-muddaththir-excerpt", "mixed-noncontiguous-quran", "muddaththir-74-1-9", "positive-alafasy-93-1-11", "positive-alafasy-94-1-8", "positive-hani-3-33-35", "positive-hani-69-19-22", "positive-husary-75-1-15", "repeated-6-77", "repeated-93-1"]);
  assert.equal(captures.filter((capture) => capture.expected.outcome === "negative").length, 5);
  const alafasy = captures.find((capture) => capture.id === "positive-alafasy-93-1-11");
  assert.deepEqual(alafasy?.expected, { outcome: "positive", intent: "Independent-reader continuous 93:1–11 must be accepted as the verified canonical passage.", surah: 93, startAyah: 1, endAyah: 11 });
  assert.equal(alafasy?.totalGeneratedWindows, 9);
  assert.equal(alafasy?.fastConformerOutcome, "abstained");
  assert.equal(alafasy?.finalOutcome, "accepted");
  assert.equal(alafasy?.finalAuthority, "whisper-fallback");
  assert.equal(captures.find((capture) => capture.id === "repeated-6-77")?.finalOutcome, "accepted", "retain the discovered Whisper fallback false positive");
  assert.deepEqual(captures.find((capture) => capture.id === "positive-alafasy-94-1-8")?.fastConformerProposedRange, { surah: 94, startAyah: 1, endAyah: 8 });
  assert.deepEqual(captures.find((capture) => capture.id === "positive-husary-75-1-15")?.fastConformerProposedRange, { surah: 75, startAyah: 1, endAyah: 16 }, "retain the recognizer mismatch without changing the expected range");
  const serialized = JSON.stringify(captures);
  for (const forbidden of ["source audio", "transcript", "filename", "fileName", "absolutePath", "pcm", "hash", "lexicalText", "ctcTokenSequence"]) {
    assert.equal(serialized.includes(forbidden), false, `capture unexpectedly contains ${forbidden}`);
  }
});

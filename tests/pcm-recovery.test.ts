import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { recoveryDiagnosticsForNativeAttempt, selectRecoveryPassage, shouldRetryFfmpegRecognitionPcm } from "../src/lib/recognition/pcm-recovery.ts";
import type { FastConformerPassageDecision } from "../src/lib/recognition/passage-decision.ts";

/**
 * Safe deterministic evidence from the supplied private Al-Muddaththir clip.
 * It contains no media, PCM, transcript, logits, filename, or customer data.
 */
const MUDDATHTHIR_PCM_RECOVERY_FIXTURE = {
  id: "muddaththir-74-1-9-native-pcm-recovery",
  expected: { surah: 74, startAyah: 1, endAyah: 9 },
  native: { selectedSurah: 74, endAyah: 6, accepted: false, reason: "insufficient-voiced-path-coverage" },
  ffmpegRecovery: { selectedSurah: 74, endAyah: 9, accepted: true },
} as const;

function decision(overrides: Partial<FastConformerPassageDecision> = {}): FastConformerPassageDecision {
  const accepted = overrides.accepted ?? true;
  return {
    accepted,
    state: accepted ? "accepted" : "insufficient-evidence",
    reason: accepted ? "fixture accepted" : "fixture rejected",
    evidence: {
      strongWindowCount: 4,
      agreeingStrongWindows: 4,
      contradictoryStrongWindows: 0,
      totalWindowCount: 4,
      usableWindowCount: 4,
      coherentWindowCount: 4,
      coherentWindowRatio: 1,
      longestUnexplainedWindowRun: 0,
      normalizedBestCtcScore: -0.2,
      normalizedCoherentCtcScore: -0.2,
      bestVsSecondMargin: 0.2,
      voicedAudioExplained: 0.8,
      continuityScore: 2,
      lexicalUniqueness: 0.5,
      sharedPhraseReliance: 0.5,
      selectedSurah: 74,
      structuralReasons: [],
    },
    ...overrides,
  };
}

test("a rejected native Al-Muddaththir result gets one independent local PCM recovery pass", () => {
  assert.equal(MUDDATHTHIR_PCM_RECOVERY_FIXTURE.native.accepted, false);
  assert.deepEqual(MUDDATHTHIR_PCM_RECOVERY_FIXTURE.ffmpegRecovery, { selectedSurah: 74, endAyah: 9, accepted: true });
  assert.equal(shouldRetryFfmpegRecognitionPcm(MUDDATHTHIR_PCM_RECOVERY_FIXTURE.native.accepted, false), true);
});

test("accepted or already-FFmpeg PCM never incurs a second recovery decode", () => {
  assert.equal(shouldRetryFfmpegRecognitionPcm(true, false), false);
  assert.equal(shouldRetryFfmpegRecognitionPcm(false, true), false);
});

test("developer recovery facts retain native rejection and recovered coverage without media", () => {
  const diagnostics = recoveryDiagnosticsForNativeAttempt({
    accepted: false,
    state: "insufficient-evidence",
    reason: "fixture",
    evidence: { strongWindowCount: 1, agreeingStrongWindows: 1, contradictoryStrongWindows: 0, totalWindowCount: 1, usableWindowCount: 1, coherentWindowCount: 1, coherentWindowRatio: 1, longestUnexplainedWindowRun: 0, normalizedBestCtcScore: -0.2, normalizedCoherentCtcScore: -0.2, bestVsSecondMargin: 0.3, voicedAudioExplained: 0.3519, continuityScore: 0.5, lexicalUniqueness: 0.5, sharedPhraseReliance: 0.1, selectedSurah: 74, structuralReasons: [] },
  }, 22_104, 3);
  diagnostics.recovery = { state: "recovery-accepted", voicedCoverage: 0.6481, durationMs: 22_104, speechRegionCount: 3 };
  assert.deepEqual(diagnostics, {
    nativeAttempt: { state: "native-attempt-rejected", voicedCoverage: 0.3519, durationMs: 22_104, speechRegionCount: 3 },
    recovery: { state: "recovery-accepted", voicedCoverage: 0.6481, durationMs: 22_104, speechRegionCount: 3 },
  });
  assert.equal(JSON.stringify(diagnostics).includes("audio"), false);
});

test("native acceptance remains authoritative and never asks recovery to arbitrate", () => {
  assert.equal(shouldRetryFfmpegRecognitionPcm(true, false), false);
  assert.equal(selectRecoveryPassage(decision(), null).selectedSource, "native");
});

test("recovery replaces rejected native PCM only with a material coherent improvement", () => {
  const native = decision({ accepted: false, state: "insufficient-evidence", reason: "native coverage", evidence: { ...decision().evidence, voicedAudioExplained: 0.3519, coherentWindowRatio: 0.5, selectedSurah: 74 } });
  const recovery = decision({ evidence: { ...decision().evidence, voicedAudioExplained: 0.6481, coherentWindowRatio: 1, selectedSurah: 74 } });
  assert.deepEqual(selectRecoveryPassage(native, recovery), {
    selectedSource: "recovery",
    selectedDecision: recovery,
    reason: "Recovery independently passed and materially improved globally coherent evidence.",
  });
});

test("weak, inconsistent, and non-decisive disagreeing recovery evidence abstains", () => {
  const native = decision({ accepted: false, state: "insufficient-evidence", evidence: { ...decision().evidence, voicedAudioExplained: 0.49, coherentWindowRatio: 0.5, selectedSurah: 74 } });
  const barelyPassing = decision({ evidence: { ...decision().evidence, voicedAudioExplained: 0.55, coherentWindowRatio: 0.55 } });
  assert.equal(selectRecoveryPassage(native, barelyPassing).selectedSource, "abstain");
  const inconsistent = decision({ accepted: false, state: "ambiguous", reason: "mixed windows", evidence: { ...decision().evidence, coherentWindowRatio: 0.4, longestUnexplainedWindowRun: 3 } });
  assert.equal(selectRecoveryPassage(native, inconsistent).selectedSource, "abstain");
  const disagreement = decision({ evidence: { ...decision().evidence, selectedSurah: 32, voicedAudioExplained: 0.62, coherentWindowRatio: 1 } });
  assert.equal(selectRecoveryPassage(native, disagreement).selectedSource, "abstain");
});

test("recovery cannot bypass the authoritative evidence gate", () => {
  const native = decision({ accepted: false, state: "insufficient-evidence", evidence: { ...decision().evidence, voicedAudioExplained: 0.2 } });
  const rejectedRecovery = decision({ accepted: false, state: "ambiguous", reason: "global path is mixed", evidence: { ...decision().evidence, voicedAudioExplained: 0.95, coherentWindowRatio: 0.4 } });
  const selection = selectRecoveryPassage(native, rejectedRecovery);
  assert.deepEqual({ source: selection.selectedSource, reason: selection.reason }, { source: "abstain", reason: "Recovery evidence was independently rejected: global path is mixed" });
});

test("both caption-generation flows use the sole shared PCM extractor before Whisper fallback", () => {
  for (const path of ["src/components/editor-client.tsx", "src/lib/video-generation.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /shouldRetryFfmpegRecognitionPcm\(/);
    assert.match(source, /extractRecognitionPcm/);
  }
});

test("recovery is abortable, serialized with media jobs, and does not reset customer-facing caption progress", () => {
  const editor = readFileSync("src/components/editor-client.tsx", "utf8");
  const generation = readFileSync("src/lib/video-generation.ts", "utf8");
  const jobs = readFileSync("src/lib/video-jobs.ts", "utf8");
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(editor, /extractRecognitionPcm\(sourceFile, abort\.signal/);
  assert.match(editor, /cancelMediaPreparation\(\);/);
  assert.match(generation, /extractRecognitionPcm\(input\.file, input\.signal\)/);
  assert.match(jobs, /signal: runtime\.abort\.signal/);
  assert.match(compatibility, /let ffmpegJobQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(compatibility, /ffmpegJobQueue = scheduled\.then\(\(\) => undefined, \(\) => undefined\)/);
  assert.match(compatibility, /return runFfmpegJob\(signal, async \(runtime\)/);
});

test("recovery has no bespoke FFmpeg loader and preserves the diagnostic tail facts", () => {
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.equal((compatibility.match(/await import\("@ffmpeg\/ffmpeg"\)/g) ?? []).length, 1);
  assert.equal((compatibility.match(/new FFmpeg\(\)/g) ?? []).length, 1);
  assert.match(compatibility, /export async function extractRecognitionPcm/);
  for (const field of ["sampleCount", "sha256", "rms", "peak", "finalNonNegligibleSample", "finalWindowSha256"]) {
    assert.match(compatibility, new RegExp(field));
  }
});

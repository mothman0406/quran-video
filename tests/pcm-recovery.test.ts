import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { recoveryDiagnosticsForNativeAttempt, shouldRetryFfmpegRecognitionPcm } from "../src/lib/recognition/pcm-recovery.ts";

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
    evidence: { strongWindowCount: 1, agreeingStrongWindows: 1, contradictoryStrongWindows: 0, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.3, voicedAudioExplained: 0.3519, continuityScore: 0.5, lexicalUniqueness: 0.5, sharedPhraseReliance: 0.1, selectedSurah: 74, structuralReasons: [] },
  }, 22_104, 3);
  diagnostics.recovery = { state: "recovery-accepted", voicedCoverage: 0.6481, durationMs: 22_104, speechRegionCount: 3 };
  assert.deepEqual(diagnostics, {
    nativeAttempt: { state: "native-attempt-rejected", voicedCoverage: 0.3519, durationMs: 22_104, speechRegionCount: 3 },
    recovery: { state: "recovery-accepted", voicedCoverage: 0.6481, durationMs: 22_104, speechRegionCount: 3 },
  });
  assert.equal(JSON.stringify(diagnostics).includes("audio"), false);
});

test("both caption-generation flows perform the recovery before Whisper fallback", () => {
  for (const path of ["src/components/editor-client.tsx", "src/lib/video-generation.ts"]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /shouldRetryFfmpegRecognitionPcm\(/);
    assert.match(source, /decodeRecognitionAudioFallback/);
  }
});

test("recovery is abortable and does not reset customer-facing caption progress", () => {
  const editor = readFileSync("src/components/editor-client.tsx", "utf8");
  const generation = readFileSync("src/lib/video-generation.ts", "utf8");
  const jobs = readFileSync("src/lib/video-jobs.ts", "utf8");
  assert.match(editor, /decodeRecognitionAudioFallback\(sourceFile, abort\.signal/);
  assert.match(editor, /cancelMediaPreparation\(\);/);
  assert.match(generation, /decodeRecognitionAudioFallback\(input\.file, input\.signal\)/);
  assert.match(jobs, /signal: runtime\.abort\.signal/);
});

/**
 * Native browser decode is normally the lowest-cost recognition input. A
 * browser may still produce a PCM representation whose acoustic model evidence
 * is insufficient even though the original media is decodable. In that case,
 * one local FFmpeg PCM extraction may provide an independent decode/resample
 * without weakening passage acceptance criteria.
 */
export function shouldRetryFfmpegRecognitionPcm(
  fastConformerAccepted: boolean,
  alreadyUsingFfmpegPcm: boolean,
): boolean {
  return !fastConformerAccepted && !alreadyUsingFfmpegPcm;
}

/**
 * Privacy-safe developer facts for the two representations. This deliberately
 * contains only the evidence gate result and VAD summary, never PCM or media
 * identity.
 */
export type RecognitionPcmRecoveryDiagnostics = {
  nativeAttempt: {
    state: "native-attempt-accepted" | "native-attempt-rejected";
    voicedCoverage: number;
    durationMs: number;
    speechRegionCount: number;
  };
  recovery: null | {
    state: "recovery-started" | "recovery-complete" | "recovery-accepted" | "recovery-rejected";
    voicedCoverage: number | null;
    durationMs: number | null;
    speechRegionCount: number | null;
  };
};

export function recoveryDiagnosticsForNativeAttempt(
  decision: FastConformerPassageDecision,
  durationMs: number,
  speechRegionCount: number,
): RecognitionPcmRecoveryDiagnostics {
  return {
    nativeAttempt: {
      state: decision.accepted ? "native-attempt-accepted" : "native-attempt-rejected",
      voicedCoverage: decision.evidence.voicedAudioExplained,
      durationMs,
      speechRegionCount,
    },
    recovery: null,
  };
}
import type { FastConformerPassageDecision } from "./passage-decision.ts";

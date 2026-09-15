import type { FastConformerIdentificationResult } from "./fastconformer-identification.ts";
import type { FastConformerPassageDecision } from "./passage-decision.ts";

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

export type RecoveryPassageSelection = {
  selectedSource: "native" | "recovery" | "abstain";
  selectedDecision: FastConformerPassageDecision | null;
  reason: string;
};

/**
 * A recovered PCM representation is a second observation, not an authority.
 * It must pass the same gate and then clear a deliberately material evidence
 * improvement over the rejected native attempt. Wrong Quran text is worse
 * than requesting manual passage correction.
 */
export function selectRecoveryPassage(
  native: FastConformerPassageDecision,
  recovery: FastConformerPassageDecision | null,
): RecoveryPassageSelection {
  if (native.accepted) return { selectedSource: "native", selectedDecision: native, reason: "Native FastConformer evidence already passed; recovery is not needed." };
  if (!recovery) return { selectedSource: "abstain", selectedDecision: null, reason: "Native evidence was rejected and no recovery evidence is available." };
  if (!recovery.accepted) return { selectedSource: "abstain", selectedDecision: null, reason: `Recovery evidence was independently rejected: ${recovery.reason}` };

  const coverageGain = recovery.evidence.voicedAudioExplained - native.evidence.voicedAudioExplained;
  const supportGain = recovery.evidence.coherentWindowRatio - native.evidence.coherentWindowRatio;
  const passagesDisagree = native.evidence.selectedSurah !== null
    && recovery.evidence.selectedSurah !== null
    && native.evidence.selectedSurah !== recovery.evidence.selectedSurah;
  if (recovery.evidence.voicedAudioExplained < 0.6) return { selectedSource: "abstain", selectedDecision: null, reason: "Recovery passed the base gate but explains too little voiced audio to replace native evidence." };
  if (coverageGain < 0.1 && supportGain < 0.15) return { selectedSource: "abstain", selectedDecision: null, reason: "Recovery did not materially improve coherent passage evidence over native PCM." };
  if (passagesDisagree && coverageGain < 0.2) return { selectedSource: "abstain", selectedDecision: null, reason: "Native and recovery passages disagree without decisive recovery coverage improvement." };
  return { selectedSource: "recovery", selectedDecision: recovery, reason: passagesDisagree ? "Recovery independently passed and decisively improved globally coherent evidence over the disagreeing native attempt." : "Recovery independently passed and materially improved globally coherent evidence." };
}

export type RecognitionDecisionDebugFacts = {
  source: "native" | "recovery";
  decision: FastConformerPassageDecision;
  identification?: FastConformerIdentificationResult | null;
  selection?: RecoveryPassageSelection;
};

/** Developer-only and intentionally compact: no media identity, text, or logits. */
export function recognitionDecisionDebug(event: "recognition-primary-result" | "recognition-recovery-result" | "recognition-final-selection", facts: RecognitionDecisionDebugFacts): void {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("debugMedia") !== "1") return;
  const evidence = facts.decision.evidence;
  const span = facts.identification?.canonicalSpan ?? null;
  console.info("[Quran AutoCaption recognition]", {
    event,
    source: facts.source,
    surah: evidence.selectedSurah,
    startAyah: span?.start.ayah ?? null,
    endAyah: span?.end.ayah ?? null,
    accepted: facts.decision.accepted,
    coherentCoverage: evidence.voicedAudioExplained,
    continuity: evidence.continuityScore,
    usableWindows: evidence.usableWindowCount,
    totalWindows: evidence.totalWindowCount,
    rejectionReason: facts.decision.accepted ? null : facts.decision.reason,
    selectedSource: facts.selection?.selectedSource ?? null,
    selectionReason: facts.selection?.reason ?? null,
  });
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

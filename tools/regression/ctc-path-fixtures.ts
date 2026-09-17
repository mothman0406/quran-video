import type { CtcPathFixture } from "./ctc-path-statistics.ts";

function uniformWeights(length: number) {
  return Array.from({ length }, () => 1);
}

function fixture(value: Omit<CtcPathFixture, "voicedDurationWeights" | "targetCoverageWeights">): CtcPathFixture {
  return { ...value, voicedDurationWeights: uniformWeights(value.scores.length), targetCoverageWeights: uniformWeights(value.scores.length) };
}

export const REAL_CTC_PATH_FIXTURES: readonly CtcPathFixture[] = [
  fixture({
    id: "surah-2-258-259",
    intent: "Overwhelming coherent Quran passage currently rejected by brittle acoustic aggregation.",
    classification: "retained-positive",
    scores: [-1.656940, -1.765054, null, -2.059549, -1.431230, -0.491861, -0.559934, -1.544629, -0.509931, -0.623413, -0.853490, -0.943385, -0.668966, -0.225020, -0.415917, -0.168907, -0.331827, -0.751740, -0.204600],
    anchorActivationIndex: 5,
    otherProductionGatesPass: true,
    metadata: { coverage: 0.95, coherentRatio: 0.9474, agreeingWindowCount: 18, longestUnsupportedRun: 1, margin: 38.5135, lexicalUniqueness: null, structuralValidity: true, surahConsistency: true },
  }),
  fixture({
    id: "surah-6-74-77",
    intent: "Known positive control currently rescued by Whisper.",
    classification: "retained-positive",
    scores: [null, -2.952631, -1.088382, -0.734792, -2.303825, -0.630700, -0.450955, -0.718719, -2.333734, -0.357359, -0.207528],
    anchorActivationIndex: 6,
    otherProductionGatesPass: true,
    metadata: { coverage: 0.9767, coherentRatio: 0.9091, agreeingWindowCount: 10, longestUnsupportedRun: 1, margin: 17.2596, lexicalUniqueness: null, structuralValidity: true, surahConsistency: true },
  }),
  fixture({
    id: "surah-20-100-104",
    intent: "Observational real-world candidate; passage truth is not independently documented.",
    classification: "observational",
    scores: [-0.672825, null, -1.529949, -0.540149, -0.608483],
    anchorActivationIndex: 3,
    otherProductionGatesPass: true,
    metadata: { coverage: 0.7878, coherentRatio: 0.8, agreeingWindowCount: 4, longestUnsupportedRun: 1, margin: 7.7877, lexicalUniqueness: null, structuralValidity: true, surahConsistency: true },
  }),
] as const;

const passingMetadata = { coverage: 0.9, coherentRatio: 1, agreeingWindowCount: 5, longestUnsupportedRun: 0, margin: 0.2, lexicalUniqueness: 0.5, structuralValidity: true, surahConsistency: true } as const;

export const PROTECTED_NEGATIVE_CTC_FIXTURES: readonly CtcPathFixture[] = [
  fixture({ id: "isolated-strong-window", intent: "One excellent phrase cannot carry four weak coherent candidates.", classification: "protected-negative", scores: [-0.2, -1.2125, -1.2125, -1.2125, -1.2125], anchorActivationIndex: 0, otherProductionGatesPass: true, protection: "whole-path acoustic evidence", metadata: passingMetadata }),
  fixture({ id: "three-window-unsupported-gap", intent: "Three consecutive unsupported windows remain an abstention.", classification: "protected-negative", scores: [-0.2, null, null, null, -0.2, -0.2], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "unsupported-run", metadata: { ...passingMetadata, coherentRatio: 0.5, agreeingWindowCount: 3, longestUnsupportedRun: 3 } }),
  fixture({ id: "repeated-shared-language", intent: "Strong common Quran phrases lack location authority.", classification: "protected-negative", scores: [-0.2, -0.22, -0.19, -0.21, -0.2], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "lexical uniqueness", metadata: { ...passingMetadata, lexicalUniqueness: 0.02 } }),
  fixture({ id: "low-lexical-uniqueness", intent: "A long path dominated by repeated language remains ambiguous.", classification: "protected-negative", scores: [-0.3, -0.31, -0.29, -0.32, -0.3], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "lexical uniqueness", metadata: { ...passingMetadata, lexicalUniqueness: 0.02 } }),
  fixture({ id: "low-coverage", intent: "A short target explaining too little voiced audio remains insufficient.", classification: "protected-negative", scores: [-0.2, -0.21, -0.19, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "VAD-qualified coverage", metadata: { ...passingMetadata, coverage: 0.49 } }),
  fixture({ id: "small-global-margin", intent: "A close competing path remains ambiguous.", classification: "protected-negative", scores: [-0.2, -0.21, -0.19, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "global margin", metadata: { ...passingMetadata, margin: 0.049 } }),
  fixture({ id: "wrong-surah-transitions", intent: "Contradictory surah evidence cannot be promoted.", classification: "protected-negative", scores: [-0.2, -0.21, -0.19, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "surah consistency", metadata: { ...passingMetadata, surahConsistency: false } }),
  fixture({ id: "backward-jumps", intent: "Backward canonical motion is rejected by continuity/structure.", classification: "protected-negative", scores: [-0.2, -0.21, -0.19, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "continuity structure", metadata: { ...passingMetadata, structuralValidity: false } }),
  fixture({ id: "structurally-invalid-passage", intent: "Illegal or reversed Quran coordinates fail closed.", classification: "protected-negative", scores: [-0.2, -0.21, -0.19, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "structural validity", metadata: { ...passingMetadata, structuralValidity: false } }),
  fixture({ id: "non-finite-evidence", intent: "Non-finite acoustic evidence fails closed.", classification: "protected-negative", scores: [-0.2, Number.NaN, -0.3, -0.2, -0.22], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "finite evidence", metadata: { ...passingMetadata, structuralValidity: false } }),
  fixture({ id: "short-target-low-capacity", intent: "A tiny target cannot explain a long acoustic window.", classification: "protected-negative", scores: [-0.1], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "target coverage and single-window gates", metadata: { ...passingMetadata, coverage: 0.05, coherentRatio: 1, agreeingWindowCount: 1 } }),
  fixture({ id: "basmalah-only", intent: "Optional basmalah has no Quran-wide location authority.", classification: "protected-negative", scores: [null], anchorActivationIndex: null, otherProductionGatesPass: false, protection: "candidate retrieval", metadata: { ...passingMetadata, coverage: 0, coherentRatio: 0, agreeingWindowCount: 0 } }),
  fixture({ id: "mixed-unrelated-window-matches", intent: "Unrelated local matches cannot assemble a passage.", classification: "protected-negative", scores: [-0.2, null, -0.25, null, -0.22, null], anchorActivationIndex: 0, otherProductionGatesPass: false, protection: "coherent ratio and continuity", metadata: { ...passingMetadata, coherentRatio: 0.5, agreeingWindowCount: 3, longestUnsupportedRun: 1, surahConsistency: false } }),
] as const;

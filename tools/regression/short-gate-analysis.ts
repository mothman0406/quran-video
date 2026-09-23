export const SHORT_GATE_PROVENANCE = "short-gate-design-support" as const;
export const SHORT_GATE_HELD_OUT_PROVENANCE = "short-gate-held-out" as const;

export type ShortGateCorpusRole = "design-support" | "held-out-validation";

export type ShortGateDesignation = {
  id: string;
  corpusRole: ShortGateCorpusRole;
  expectedOutcome: "positive" | "negative";
  readerGroup: string;
  sourceRange: { surah: number; startAyah: number; endAyah: number } | null;
  construction: string;
  negativeType: string | null;
};

/**
 * Frozen before any case below was recognized. Ground truth comes only from
 * public per-ayah source keys. Reader H and every progression-validation case
 * are deliberately absent.
 */
export const SHORT_GATE_DESIGNATIONS: readonly ShortGateDesignation[] = Object.freeze([
  {
    id: "short-gate-design-positive-reader-i-89-1-14",
    corpusRole: "design-support",
    expectedOutcome: "positive",
    readerGroup: "reader-i",
    sourceRange: { surah: 89, startAyah: 1, endAyah: 14 },
    construction: "89:1-14",
    negativeType: null,
  },
  {
    id: "short-gate-design-positive-reader-j-90-1-12",
    corpusRole: "design-support",
    expectedOutcome: "positive",
    readerGroup: "reader-j",
    sourceRange: { surah: 90, startAyah: 1, endAyah: 12 },
    construction: "90:1-12",
    negativeType: null,
  },
  {
    id: "short-gate-heldout-positive-reader-k-92-1-14",
    corpusRole: "held-out-validation",
    expectedOutcome: "positive",
    readerGroup: "reader-k",
    sourceRange: { surah: 92, startAyah: 1, endAyah: 14 },
    construction: "92:1-14",
    negativeType: null,
  },
  {
    id: "short-gate-design-negative-reader-i-89-backward",
    corpusRole: "design-support",
    expectedOutcome: "negative",
    readerGroup: "reader-i",
    sourceRange: { surah: 89, startAyah: 1, endAyah: 14 },
    construction: "89:8-14, 89:1-7",
    negativeType: "backward-halves",
  },
  {
    id: "short-gate-design-negative-reader-j-90-repeat",
    corpusRole: "design-support",
    expectedOutcome: "negative",
    readerGroup: "reader-j",
    sourceRange: { surah: 90, startAyah: 1, endAyah: 6 },
    construction: "90:1-6, 90:1-6",
    negativeType: "repeated-partial-passage",
  },
  {
    id: "short-gate-heldout-negative-cross-reader-i-k",
    corpusRole: "held-out-validation",
    expectedOutcome: "negative",
    readerGroup: "reader-i+k",
    sourceRange: null,
    construction: "89:1-7, 92:8-14",
    negativeType: "cross-surah-mixture",
  },
]);

export type ShortGateFixture = ProgressionTrajectoryFixture & {
  corpusRole: ShortGateCorpusRole;
  architectureEvidence: {
    canonicalPcmPreparations: number;
    topLevelFastConformerDecisions: number;
    whisperEntered: boolean;
  };
  forcedAlignment: {
    status: "complete" | "failed" | "not-run";
    resultingStartAyah: number | null;
    resultingEndAyah: number | null;
  };
};

export type ShortSupportFeatures = {
  windows: number;
  coherentWindows: number;
  nullWindows: number;
  coherentRatio: number;
  leadingNullWindows: number;
  trailingNullWindows: number;
  longestNullRun: number;
  longestCoherentRun: number;
  oneNullRatio: number;
  twoNullRatio: number;
};

function longestRun(values: readonly boolean[], target: boolean) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value === target ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Pure small-sample support calculations; it never changes recognition. */
export function computeShortSupport(windows: readonly { coherent: unknown | null }[]): ShortSupportFeatures {
  const supported = windows.map((window) => window.coherent !== null);
  const coherentWindows = supported.filter(Boolean).length;
  const leadingNullWindows = supported.findIndex(Boolean);
  const lastSupported = supported.findLastIndex(Boolean);
  return {
    windows: supported.length,
    coherentWindows,
    nullWindows: supported.length - coherentWindows,
    coherentRatio: supported.length ? Number((coherentWindows / supported.length).toFixed(6)) : 0,
    leadingNullWindows: leadingNullWindows < 0 ? supported.length : leadingNullWindows,
    trailingNullWindows: lastSupported < 0 ? supported.length : supported.length - lastSupported - 1,
    longestNullRun: longestRun(supported, false),
    longestCoherentRun: longestRun(supported, true),
    oneNullRatio: supported.length ? Number(((supported.length - 1) / supported.length).toFixed(6)) : 0,
    twoNullRatio: supported.length ? Number((Math.max(0, supported.length - 2) / supported.length).toFixed(6)) : 0,
  };
}

export type LocalEvidenceFeatures = {
  windowsWithLocalWinner: number;
  correctSurahWindows: number | null;
  expectedOverlapWindows: number | null;
  missingStartRegionWindows: number | null;
  longestCorrectSurahRun: number | null;
  earliestCorrectSurahWindow: number | null;
  latestCorrectSurahWindow: number | null;
  localGlobalAgreementRatio: number | null;
  anchorActivationIndex: number | null;
  postAnchorCoherentRatio: number | null;
};

/** Uses only retained winner coordinates; absent top-N lists are never invented. */
export function computeLocalEvidence(fixture: Pick<ShortGateFixture, "expected" | "trajectory">): LocalEvidenceFeatures {
  const expected = fixture.expected.surah === null || fixture.expected.startAyah === null || fixture.expected.endAyah === null
    ? null
    : { surah: fixture.expected.surah, start: fixture.expected.startAyah, end: fixture.expected.endAyah };
  const ordered = [...fixture.trajectory.windows].sort((left, right) => left.index - right.index);
  const correct = ordered.map((window) => Boolean(expected && window.localWinner?.surah === expected.surah));
  const overlaps = ordered.map((window) => Boolean(expected && window.localWinner?.surah === expected.surah
    && window.localWinner.startAyah <= expected.end && window.localWinner.endAyah >= expected.start));
  const missingStart = ordered.map((window) => Boolean(expected && window.localWinner?.surah === expected.surah
    && window.localWinner.startAyah <= expected.start + 6 && window.localWinner.endAyah >= expected.start));
  const anchorActivationIndex = ordered.find((window) => window.anchorEvent === "anchor-activated")?.index ?? null;
  const afterAnchor = anchorActivationIndex === null ? [] : ordered.filter((window) => window.index >= anchorActivationIndex);
  const correctIndexes = expected ? ordered.filter((_, index) => correct[index]).map((window) => window.index) : [];
  return {
    windowsWithLocalWinner: ordered.filter((window) => window.localWinner !== null).length,
    correctSurahWindows: expected ? correct.filter(Boolean).length : null,
    expectedOverlapWindows: expected ? overlaps.filter(Boolean).length : null,
    missingStartRegionWindows: expected ? missingStart.filter(Boolean).length : null,
    longestCorrectSurahRun: expected ? longestRun(correct, true) : null,
    earliestCorrectSurahWindow: correctIndexes[0] ?? null,
    latestCorrectSurahWindow: correctIndexes.at(-1) ?? null,
    localGlobalAgreementRatio: computeProgressionFeatures(ordered).local.agreementRatio,
    anchorActivationIndex,
    postAnchorCoherentRatio: afterAnchor.length
      ? Number((afterAnchor.filter((window) => window.coherent !== null).length / afterAnchor.length).toFixed(6))
      : null,
  };
}

/** Reuses progression geometry over independent local winners only. */
export function computeLocalWinnerProgression(fixture: Pick<ShortGateFixture, "trajectory">) {
  return computeProgressionFeatures(fixture.trajectory.windows.map((window) => ({
    index: window.index,
    coherent: window.localWinner?.sameSurah && window.localWinner.start !== null && window.localWinner.end !== null
      ? {
          surah: window.localWinner.surah,
          startAyah: window.localWinner.startAyah,
          endAyah: window.localWinner.endAyah,
          start: window.localWinner.start,
          end: window.localWinner.end,
          ctc: window.localWinner.ctc,
          origins: ["global"],
        }
      : null,
    localWinner: null,
    anchorEvent: window.anchorEvent,
  })));
}

export function windowCountSensitivity(windowCounts: readonly number[] = [5, 7, 10, 15]) {
  return windowCounts.map((windows) => ({
    windows,
    oneBadRatio: Number(((windows - 1) / windows).toFixed(6)),
    twoBadRatio: Number(((windows - 2) / windows).toFixed(6)),
    threeBadRatio: Number(((windows - 3) / windows).toFixed(6)),
    productionRatioAllowsTwoBad: (windows - 2) / windows >= 0.6,
    productionRunAllowsTwoBad: 2 < 3,
    productionRunAllowsThreeBad: 3 < 3,
  }));
}

export function exactRange(fixture: Pick<CtcCalibrationCapture, "expected" | "fastConformerProposedRange">) {
  const expected = fixture.expected;
  const proposed = fixture.fastConformerProposedRange;
  return Boolean(proposed && expected.surah !== null && expected.startAyah !== null && expected.endAyah !== null
    && proposed.surah === expected.surah && proposed.startAyah === expected.startAyah && proposed.endAyah === expected.endAyah);
}
import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import { computeProgressionFeatures, type ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

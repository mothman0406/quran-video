import type {
  CanonicalPassageWindowEvidence,
  ReconstructedPassage,
} from "./canonical-passage-reconstruction.ts";

export const FROZEN_WHOLE_RECORDING_INTEGRITY_RULE = Object.freeze({
  minimumContradictoryRunWindows: 2,
  resetWordTolerance: 2,
});

export type IntegrityWindowEvidence = CanonicalPassageWindowEvidence & {
  /** Optional VAD-derived voiced duration represented by this window. */
  voicedDurationMs?: number | null;
};

export type WholeRecordingIntegrityDecision = {
  valid: boolean;
  vetoes: string[];
  metrics: {
    insideCoreWindows: number[];
    beforeCoreWindows: number[];
    afterCoreWindows: number[];
    outsideCoreWindows: number[];
    outsideDominantSurah: number | null;
    outsideCanonicalPositions: Array<{
      windowIndex: number;
      surah: number;
      startAyah: number;
      endAyah: number;
      relativeStartWord: number | null;
      relativeEndWord: number | null;
    }>;
    resetCount: number;
    revisitCount: number;
    repeatedCoveredAyahWindowCount: number;
    longestNoProgressRun: number;
    longestResetOrRevisitRun: number;
    longestRepeatedCoveredRun: number;
    longestIncompatibleForwardRun: number;
    longestCrossSurahRun: number;
    outsideVoicedDurationMs: number | null;
  };
};

function longestOutsideRun(
  windows: readonly IntegrityWindowEvidence[],
  values: readonly boolean[],
  requireSameSurah = false,
) {
  let current = 0;
  let longest = 0;
  let previousWindow = Number.NEGATIVE_INFINITY;
  let previousSurah: number | null = null;
  for (const [index, value] of values.entries()) {
    const window = windows[index]!;
    const surah = window.localWinner?.surah ?? null;
    const contiguous = window.windowIndex === previousWindow + 1;
    const sameSurah = !requireSameSurah || (surah !== null && surah === previousSurah);
    current = value && contiguous && sameSurah ? current + 1 : value ? 1 : 0;
    longest = Math.max(longest, current);
    previousWindow = window.windowIndex;
    previousSurah = surah;
  }
  return longest;
}

function dominantSurah(windows: readonly IntegrityWindowEvidence[]) {
  const counts = new Map<number, { count: number; first: number }>();
  for (const window of windows) {
    const surah = window.localWinner?.surah;
    if (surah === undefined) continue;
    const current = counts.get(surah);
    counts.set(surah, current ? { ...current, count: current.count + 1 } : { count: 1, first: window.windowIndex });
  }
  return [...counts].sort((left, right) => right[1].count - left[1].count
    || left[1].first - right[1].first || left[0] - right[0])[0]?.[0] ?? null;
}

/**
 * Audits positive Quran evidence outside the selected core. Null/weak windows
 * are transparent: only local Quran winners can form a contradiction run.
 */
export function validateWholeRecordingIntegrity(
  core: ReconstructedPassage,
  windows: readonly IntegrityWindowEvidence[],
): WholeRecordingIntegrityDecision {
  const ordered = [...windows].sort((left, right) => left.windowIndex - right.windowIndex);
  const inside = new Set(core.evidence.supportingWindows);
  const firstCore = Math.min(...inside);
  const lastCore = Math.max(...inside);
  const outside = ordered.filter((window) => !inside.has(window.windowIndex));
  const coreCandidates = ordered.flatMap((window) => inside.has(window.windowIndex) && window.localWinner?.surah === core.surah
    && window.localWinner.relativeStartWord !== null && window.localWinner.relativeEndWord !== null
    ? [window.localWinner] : []);
  const coreFrontier = Math.max(...coreCandidates.map((candidate) => candidate.relativeEndWord!), Number.NEGATIVE_INFINITY);
  const finalCoreStart = coreCandidates.at(-1)?.relativeStartWord ?? Number.NEGATIVE_INFINITY;

  const positions = outside.flatMap((window) => window.localWinner ? [{
    windowIndex: window.windowIndex,
    surah: window.localWinner.surah,
    startAyah: window.localWinner.startAyah,
    endAyah: window.localWinner.endAyah,
    relativeStartWord: window.localWinner.relativeStartWord,
    relativeEndWord: window.localWinner.relativeEndWord,
  }] : []);
  const resetFlags = outside.map((window) => Boolean(window.localWinner?.surah === core.surah
    && window.localWinner.relativeStartWord !== null
    && window.localWinner.relativeStartWord < finalCoreStart - FROZEN_WHOLE_RECORDING_INTEGRITY_RULE.resetWordTolerance));
  const revisitFlags = outside.map((window) => Boolean(window.localWinner?.surah === core.surah
    && window.localWinner.relativeEndWord !== null && window.localWinner.relativeEndWord <= coreFrontier));
  const repeatedFlags = outside.map((window) => Boolean(window.localWinner?.surah === core.surah
    && window.localWinner.startAyah <= core.endAyah && window.localWinner.endAyah >= core.startAyah));
  const incompatibleForwardFlags = outside.map((window) => Boolean(window.localWinner?.surah === core.surah
    && window.localWinner.startAyah > core.endAyah + 1));
  const crossSurahFlags = outside.map((window) => Boolean(window.localWinner && window.localWinner.surah !== core.surah));
  const resetOrRevisitFlags = outside.map((window, index) => Boolean(window.localWinner) && (resetFlags[index]! || revisitFlags[index]!));

  let frontier = coreFrontier;
  let noProgress = 0;
  let longestNoProgress = 0;
  let previousOutsideIndex = Number.NEGATIVE_INFINITY;
  for (const window of outside) {
    const candidate = window.localWinner;
    if (!candidate || candidate.surah !== core.surah || candidate.relativeEndWord === null
      || window.windowIndex !== previousOutsideIndex + 1) {
      noProgress = 0;
      frontier = coreFrontier;
      if (candidate?.surah === core.surah && candidate.relativeEndWord !== null
        && candidate.relativeEndWord <= frontier) {
        noProgress = 1;
        longestNoProgress = Math.max(longestNoProgress, noProgress);
      }
      previousOutsideIndex = window.windowIndex;
      continue;
    }
    if (candidate.relativeEndWord <= frontier) noProgress += 1;
    else noProgress = 0;
    frontier = Math.max(frontier, candidate.relativeEndWord);
    longestNoProgress = Math.max(longestNoProgress, noProgress);
    previousOutsideIndex = window.windowIndex;
  }

  const minimum = FROZEN_WHOLE_RECORDING_INTEGRITY_RULE.minimumContradictoryRunWindows;
  const resetRun = longestOutsideRun(outside, resetOrRevisitFlags);
  const repeatedRun = longestOutsideRun(outside, repeatedFlags);
  const incompatibleRun = longestOutsideRun(outside, incompatibleForwardFlags);
  const crossSurahRun = longestOutsideRun(outside, crossSurahFlags, true);
  const vetoes = [
    ...(resetRun >= minimum && resetFlags.some(Boolean) ? ["reset-or-revisit-run"] : []),
    ...(repeatedRun >= minimum && resetFlags.some(Boolean) ? ["repeated-covered-quran-run"] : []),
    ...(incompatibleRun >= minimum ? ["incompatible-forward-run"] : []),
    ...(crossSurahRun >= minimum ? ["cross-surah-run"] : []),
  ];
  const voiced = outside.map((window) => window.voicedDurationMs);
  const outsideVoicedDurationMs = voiced.length > 0 && voiced.every((value) => typeof value === "number" && Number.isFinite(value))
    ? voiced.reduce<number>((total, value) => total + (value ?? 0), 0) : null;

  return {
    valid: vetoes.length === 0,
    vetoes,
    metrics: {
      insideCoreWindows: [...inside].sort((left, right) => left - right),
      beforeCoreWindows: outside.filter((window) => window.windowIndex < firstCore).map((window) => window.windowIndex),
      afterCoreWindows: outside.filter((window) => window.windowIndex > lastCore).map((window) => window.windowIndex),
      outsideCoreWindows: outside.map((window) => window.windowIndex),
      outsideDominantSurah: dominantSurah(outside),
      outsideCanonicalPositions: positions,
      resetCount: resetFlags.filter(Boolean).length,
      revisitCount: revisitFlags.filter(Boolean).length,
      repeatedCoveredAyahWindowCount: repeatedFlags.filter(Boolean).length,
      longestNoProgressRun: longestNoProgress,
      longestResetOrRevisitRun: resetRun,
      longestRepeatedCoveredRun: repeatedRun,
      longestIncompatibleForwardRun: incompatibleRun,
      longestCrossSurahRun: crossSurahRun,
      outsideVoicedDurationMs,
    },
  };
}

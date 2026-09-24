type TrajectoryWindow = {
  index: number;
  localWinner: { surah: number; startAyah: number; endAyah: number; start: number | null; end: number | null; ctc: number | null } | null;
  coherent: { surah: number; startAyah: number; endAyah: number; start: number | null; end: number | null; ctc: number | null; origins: string[] } | null;
  anchorEvent: string;
};

export type CanonicalRange = {
  surah: number;
  startAyah: number;
  endAyah: number;
};

export type CanonicalPassageCandidate = CanonicalRange & {
  relativeStartWord: number | null;
  relativeEndWord: number | null;
  ctc: number | null;
  coverage: number | null;
  origin: string | null;
};

export type CanonicalPassageWindowEvidence = {
  windowIndex: number;
  localWinner: CanonicalPassageCandidate | null;
  coherentPathCandidate: (CanonicalPassageCandidate & { origins: string[] }) | null;
  anchorEvent: string;
};

export const FROZEN_CANONICAL_RECONSTRUCTION_RULE = Object.freeze({
  minimumSupportingWindows: 3,
  minimumDominantSurahFraction: 0.75,
  minimumRunWindowFraction: 0.75,
  backwardWordTolerance: 2,
  maximumSkippedCanonicalWords: 6,
  maximumNoProgressRun: 1,
});

export type ReconstructedPassage = CanonicalRange & {
  confidence: {
    sequenceSupport: number;
    startSupport: number;
    endSupport: number;
  };
  edges: {
    firstStartSupportingWindow: number;
    lastStartSupportingWindow: number;
    firstEndSupportingWindow: number;
    lastEndSupportingWindow: number;
  };
  evidence: {
    supportingWindows: number[];
    dominantSurahWindowCount: number;
    totalWindowCount: number;
    resetCount: number;
    repeatedSpanRevisitCount: number;
    longestNoProgressRun: number;
    skippedCanonicalWords: number;
    adjacentOverlapCount: number;
    progressionConsistency: number;
  };
};

export type ReconstructionDecision = {
  passage: ReconstructedPassage | null;
  rejectionReasons: string[];
  dominantSurah: number | null;
  dominantSurahFraction: number;
};

type LocatedCandidate = CanonicalPassageCandidate & {
  windowIndex: number;
  relativeStartWord: number;
  relativeEndWord: number;
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function dominantSurah(windows: readonly CanonicalPassageWindowEvidence[]) {
  const counts = new Map<number, { count: number; firstWindow: number }>();
  for (const window of windows) {
    const surah = window.localWinner?.surah;
    if (surah === undefined) continue;
    const current = counts.get(surah);
    counts.set(surah, current
      ? { ...current, count: current.count + 1 }
      : { count: 1, firstWindow: window.windowIndex });
  }
  return [...counts.entries()].sort((left, right) => right[1].count - left[1].count
    || left[1].firstWindow - right[1].firstWindow
    || left[0] - right[0])[0] ?? null;
}

function noProgressRun(candidates: readonly LocatedCandidate[]) {
  let frontier = Number.NEGATIVE_INFINITY;
  let current = 0;
  let longest = 0;
  for (const candidate of candidates) {
    if (candidate.relativeEndWord <= frontier) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      frontier = candidate.relativeEndWord;
      current = 0;
    }
  }
  return longest;
}

function buildRuns(candidates: readonly LocatedCandidate[]) {
  const runs: LocatedCandidate[][] = [];
  let current: LocatedCandidate[] = [];
  let frontier = Number.NEGATIVE_INFINITY;
  let stalled = 0;
  for (const candidate of candidates) {
    const previous = current.at(-1);
    const backward = Boolean(previous && (
      candidate.relativeStartWord < previous.relativeStartWord - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance
      || candidate.relativeEndWord < previous.relativeEndWord - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance
    ));
    const skipped = previous
      ? Math.max(0, candidate.relativeStartWord - previous.relativeEndWord - 1)
      : 0;
    const nextStalled = candidate.relativeEndWord <= frontier ? stalled + 1 : 0;
    if (previous && (backward
      || skipped > FROZEN_CANONICAL_RECONSTRUCTION_RULE.maximumSkippedCanonicalWords
      || nextStalled > FROZEN_CANONICAL_RECONSTRUCTION_RULE.maximumNoProgressRun)) {
      runs.push(current);
      current = [];
      frontier = Number.NEGATIVE_INFINITY;
      stalled = 0;
    }
    current.push(candidate);
    stalled = candidate.relativeEndWord <= frontier ? stalled + 1 : 0;
    frontier = Math.max(frontier, candidate.relativeEndWord);
  }
  if (current.length) runs.push(current);
  return runs;
}

function rangeSupport(candidates: readonly LocatedCandidate[], ayah: number) {
  return candidates.filter((candidate) => candidate.startAyah <= ayah && candidate.endAyah >= ayah);
}

/**
 * Reconstructs one inclusive canonical range from independent local winners.
 * Acoustic CTC is retained as diagnostic evidence but never deletes a window.
 */
export function reconstructCanonicalPassage(
  windows: readonly CanonicalPassageWindowEvidence[],
): ReconstructionDecision {
  const ordered = [...windows].sort((left, right) => left.windowIndex - right.windowIndex);
  const dominant = dominantSurah(ordered);
  if (!dominant) return { passage: null, rejectionReasons: ["no-local-winners"], dominantSurah: null, dominantSurahFraction: 0 };
  const [surah, support] = dominant;
  const dominantFraction = ordered.length ? round(support.count / ordered.length) : 0;
  const candidates = ordered.flatMap((window): LocatedCandidate[] => {
    const candidate = window.localWinner;
    return candidate?.surah === surah && candidate.relativeStartWord !== null && candidate.relativeEndWord !== null
      ? [{ ...candidate, relativeStartWord: candidate.relativeStartWord, relativeEndWord: candidate.relativeEndWord, windowIndex: window.windowIndex }]
      : [];
  });
  const resets = candidates.slice(1).filter((candidate, index) => {
    const previous = candidates[index]!;
    return candidate.relativeStartWord < previous.relativeStartWord - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance
      || candidate.relativeEndWord < previous.relativeEndWord - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance;
  }).length;
  const repeatedSpanRevisitCount = candidates.slice(1).filter((candidate, index) => {
    const priorFrontier = Math.max(...candidates.slice(0, index + 1).map((item) => item.relativeEndWord));
    return candidate.relativeEndWord <= priorFrontier;
  }).length;
  const runs = buildRuns(candidates);
  const best = runs.sort((left, right) => right.length - left.length
    || (right.at(-1)!.relativeEndWord - right[0]!.relativeStartWord) - (left.at(-1)!.relativeEndWord - left[0]!.relativeStartWord)
    || left[0]!.windowIndex - right[0]!.windowIndex)[0] ?? [];
  const rejectionReasons = [
    ...(support.count < FROZEN_CANONICAL_RECONSTRUCTION_RULE.minimumSupportingWindows ? ["insufficient-dominant-surah-windows"] : []),
    ...(dominantFraction < FROZEN_CANONICAL_RECONSTRUCTION_RULE.minimumDominantSurahFraction ? ["surah-inconsistency"] : []),
    ...(best.length / Math.max(1, ordered.length) < FROZEN_CANONICAL_RECONSTRUCTION_RULE.minimumRunWindowFraction ? ["no-dominant-continuous-run"] : []),
  ];
  if (rejectionReasons.length || !best.length) {
    return { passage: null, rejectionReasons, dominantSurah: surah, dominantSurahFraction: dominantFraction };
  }

  const bestWindows = new Set(best.map((candidate) => candidate.windowIndex));
  const localContinuationEdges = ordered.flatMap((window): LocatedCandidate[] => {
    const candidate = window.coherentPathCandidate;
    return bestWindows.has(window.windowIndex) && window.anchorEvent === "anchor-advanced"
      && candidate?.surah === surah && candidate.origins.length === 1 && candidate.origins[0] === "local"
      && candidate.relativeStartWord !== null && candidate.relativeEndWord !== null
      ? [{ ...candidate, relativeStartWord: candidate.relativeStartWord, relativeEndWord: candidate.relativeEndWord, windowIndex: window.windowIndex }]
      : [];
  });
  const edgeEvidence = [...best, ...localContinuationEdges];
  const startAyah = Math.min(...edgeEvidence.map((candidate) => candidate.startAyah));
  const endAyah = Math.max(...edgeEvidence.map((candidate) => candidate.endAyah));
  const startSupport = rangeSupport(edgeEvidence, startAyah).filter((candidate, index, values) => values.findIndex((item) => item.windowIndex === candidate.windowIndex) === index);
  const endSupport = rangeSupport(edgeEvidence, endAyah).filter((candidate, index, values) => values.findIndex((item) => item.windowIndex === candidate.windowIndex) === index);
  const transitions = best.slice(1).map((candidate, index) => ({ previous: best[index]!, candidate }));
  const skippedCanonicalWords = transitions.reduce((total, { previous, candidate }) => total
    + Math.max(0, candidate.relativeStartWord - previous.relativeEndWord - 1), 0);
  const adjacentOverlapCount = transitions.filter(({ previous, candidate }) => candidate.relativeStartWord <= previous.relativeEndWord).length;
  const consistentTransitions = transitions.filter(({ previous, candidate }) => candidate.relativeStartWord >= previous.relativeStartWord
    - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance
    && candidate.relativeEndWord >= previous.relativeEndWord - FROZEN_CANONICAL_RECONSTRUCTION_RULE.backwardWordTolerance).length;
  return {
    passage: {
      surah,
      startAyah,
      endAyah,
      confidence: {
        sequenceSupport: round(best.length / ordered.length),
        startSupport: startSupport.length,
        endSupport: endSupport.length,
      },
      edges: {
        firstStartSupportingWindow: startSupport[0]!.windowIndex,
        lastStartSupportingWindow: startSupport.at(-1)!.windowIndex,
        firstEndSupportingWindow: endSupport[0]!.windowIndex,
        lastEndSupportingWindow: endSupport.at(-1)!.windowIndex,
      },
      evidence: {
        supportingWindows: best.map((candidate) => candidate.windowIndex),
        dominantSurahWindowCount: support.count,
        totalWindowCount: ordered.length,
        resetCount: resets,
        repeatedSpanRevisitCount,
        longestNoProgressRun: noProgressRun(candidates),
        skippedCanonicalWords,
        adjacentOverlapCount,
        progressionConsistency: transitions.length ? round(consistentTransitions / transitions.length) : 1,
      },
    },
    rejectionReasons: [],
    dominantSurah: surah,
    dominantSurahFraction: dominantFraction,
  };
}

/** Expands an accepted inclusive range without consulting acoustic omissions. */
export function expandCanonicalAyahRange(range: CanonicalRange): CanonicalRange[] {
  if (!Number.isInteger(range.surah) || !Number.isInteger(range.startAyah) || !Number.isInteger(range.endAyah)
    || range.surah < 1 || range.startAyah < 1 || range.endAyah < range.startAyah) return [];
  return Array.from({ length: range.endAyah - range.startAyah + 1 }, (_, index) => ({
    surah: range.surah,
    startAyah: range.startAyah + index,
    endAyah: range.startAyah + index,
  }));
}

/** Adapts the already-retained privacy-safe trajectory; no new instrumentation is required. */
export function reconstructionEvidenceFromTrajectory(windows: readonly TrajectoryWindow[]): CanonicalPassageWindowEvidence[] {
  return windows.map((window) => ({
    windowIndex: window.index,
    localWinner: window.localWinner ? {
      surah: window.localWinner.surah,
      startAyah: window.localWinner.startAyah,
      endAyah: window.localWinner.endAyah,
      relativeStartWord: window.localWinner.start,
      relativeEndWord: window.localWinner.end,
      ctc: window.localWinner.ctc,
      coverage: null,
      origin: null,
    } : null,
    coherentPathCandidate: window.coherent ? {
      surah: window.coherent.surah,
      startAyah: window.coherent.startAyah,
      endAyah: window.coherent.endAyah,
      relativeStartWord: window.coherent.start,
      relativeEndWord: window.coherent.end,
      ctc: window.coherent.ctc,
      coverage: null,
      origin: null,
      origins: window.coherent.origins,
    } : null,
    anchorEvent: window.anchorEvent,
  }));
}

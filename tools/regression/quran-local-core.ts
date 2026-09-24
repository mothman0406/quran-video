import type {
  CanonicalPassageWindowEvidence,
  ReconstructedPassage,
} from "./canonical-passage-reconstruction.ts";

/** Frozen before external Positive B is loaded. */
export const FROZEN_PROVISIONAL_LOCAL_CORE_RULE = Object.freeze({
  minimumSupportingWindows: 3,
  minimumDominantSurahNumerator: 3,
  minimumDominantSurahDenominator: 4,
  minimumRunWindowNumerator: 3,
  minimumRunWindowDenominator: 4,
  maximumSkippedAyat: 1,
  maximumNoProgressWindows: 1,
});

export type ProvisionalLocalCore = ReconstructedPassage & {
  provisional: true;
  authority: "local-winners-only";
};

export type ProvisionalLocalCoreDecision = {
  core: ProvisionalLocalCore | null;
  rejectionReasons: string[];
  dominantSurah: number | null;
  dominantSurahWindowCount: number;
  totalWindowCount: number;
};

type Located = NonNullable<CanonicalPassageWindowEvidence["localWinner"]> & { windowIndex: number };

function dominantSurah(windows: readonly CanonicalPassageWindowEvidence[]) {
  const counts = new Map<number, { count: number; first: number }>();
  for (const window of windows) {
    const surah = window.localWinner?.surah;
    if (surah === undefined) continue;
    const current = counts.get(surah);
    counts.set(surah, current ? { ...current, count: current.count + 1 } : { count: 1, first: window.windowIndex });
  }
  return [...counts].sort((left, right) => right[1].count - left[1].count
    || left[1].first - right[1].first || left[0] - right[0])[0] ?? null;
}

function buildRuns(candidates: readonly Located[]) {
  const runs: Located[][] = [];
  let current: Located[] = [];
  let frontier = Number.NEGATIVE_INFINITY;
  let stalled = 0;
  for (const candidate of candidates) {
    const previous = current.at(-1);
    const reset = Boolean(previous && (candidate.startAyah < previous.startAyah || candidate.endAyah < previous.endAyah));
    const skipped = previous ? Math.max(0, candidate.startAyah - previous.endAyah - 1) : 0;
    const nextStalled = candidate.endAyah <= frontier ? stalled + 1 : 0;
    if (previous && (reset || skipped > FROZEN_PROVISIONAL_LOCAL_CORE_RULE.maximumSkippedAyat
      || nextStalled > FROZEN_PROVISIONAL_LOCAL_CORE_RULE.maximumNoProgressWindows)) {
      runs.push(current);
      current = [];
      frontier = Number.NEGATIVE_INFINITY;
      stalled = 0;
    }
    current.push(candidate);
    stalled = candidate.endAyah <= frontier ? stalled + 1 : 0;
    frontier = Math.max(frontier, candidate.endAyah);
  }
  if (current.length) runs.push(current);
  return runs;
}

function ratioAtLeast(value: number, total: number, numerator: number, denominator: number) {
  return value * denominator >= total * numerator;
}

/** Exposes only locally covered ayat. It never grants final acceptance. */
export function exposeProvisionalLocalCore(
  windows: readonly CanonicalPassageWindowEvidence[],
): ProvisionalLocalCoreDecision {
  const ordered = [...windows].sort((left, right) => left.windowIndex - right.windowIndex);
  const dominant = dominantSurah(ordered);
  if (!dominant) return { core: null, rejectionReasons: ["no-local-winners"], dominantSurah: null, dominantSurahWindowCount: 0, totalWindowCount: ordered.length };
  const [surah, support] = dominant;
  const candidates = ordered.flatMap((window): Located[] => window.localWinner?.surah === surah
    ? [{ ...window.localWinner, windowIndex: window.windowIndex }] : []);
  const best = (buildRuns(candidates).sort((left, right) => right.length - left.length
    || (right.at(-1)!.endAyah - right[0]!.startAyah) - (left.at(-1)!.endAyah - left[0]!.startAyah)
    || left[0]!.windowIndex - right[0]!.windowIndex)[0] ?? []);
  const rejectionReasons = [
    ...(support.count < FROZEN_PROVISIONAL_LOCAL_CORE_RULE.minimumSupportingWindows ? ["insufficient-dominant-surah-windows"] : []),
    ...(!ratioAtLeast(support.count, ordered.length, FROZEN_PROVISIONAL_LOCAL_CORE_RULE.minimumDominantSurahNumerator, FROZEN_PROVISIONAL_LOCAL_CORE_RULE.minimumDominantSurahDenominator) ? ["surah-inconsistency"] : []),
    ...(!ratioAtLeast(best.length, ordered.length, FROZEN_PROVISIONAL_LOCAL_CORE_RULE.minimumRunWindowNumerator, FROZEN_PROVISIONAL_LOCAL_CORE_RULE.minimumRunWindowDenominator) ? ["no-dominant-forward-run"] : []),
  ];
  if (rejectionReasons.length || !best.length) return { core: null, rejectionReasons, dominantSurah: surah, dominantSurahWindowCount: support.count, totalWindowCount: ordered.length };

  const transitions = best.slice(1).map((candidate, index) => ({ previous: best[index]!, candidate }));
  const startAyah = Math.min(...best.map((candidate) => candidate.startAyah));
  const endAyah = Math.max(...best.map((candidate) => candidate.endAyah));
  const startSupport = best.filter((candidate) => candidate.startAyah <= startAyah && candidate.endAyah >= startAyah);
  const endSupport = best.filter((candidate) => candidate.startAyah <= endAyah && candidate.endAyah >= endAyah);
  let frontier = Number.NEGATIVE_INFINITY;
  let stalled = 0;
  let longestStalled = 0;
  for (const candidate of candidates) {
    stalled = candidate.endAyah <= frontier ? stalled + 1 : 0;
    longestStalled = Math.max(longestStalled, stalled);
    frontier = Math.max(frontier, candidate.endAyah);
  }
  return {
    core: {
      provisional: true,
      authority: "local-winners-only",
      surah,
      startAyah,
      endAyah,
      confidence: { sequenceSupport: best.length / Math.max(1, ordered.length), startSupport: startSupport.length, endSupport: endSupport.length },
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
        resetCount: candidates.slice(1).filter((candidate, index) => candidate.startAyah < candidates[index]!.startAyah || candidate.endAyah < candidates[index]!.endAyah).length,
        repeatedSpanRevisitCount: candidates.slice(1).filter((candidate, index) => candidate.endAyah <= Math.max(...candidates.slice(0, index + 1).map((item) => item.endAyah))).length,
        longestNoProgressRun: longestStalled,
        skippedCanonicalWords: transitions.reduce((total, { previous, candidate }) => total + Math.max(0, candidate.startAyah - previous.endAyah - 1), 0),
        adjacentOverlapCount: transitions.filter(({ previous, candidate }) => candidate.startAyah <= previous.endAyah + 1).length,
        progressionConsistency: transitions.length ? transitions.filter(({ previous, candidate }) => candidate.startAyah >= previous.startAyah && candidate.endAyah >= previous.endAyah).length / transitions.length : 1,
      },
    },
    rejectionReasons: [],
    dominantSurah: surah,
    dominantSurahWindowCount: support.count,
    totalWindowCount: ordered.length,
  };
}

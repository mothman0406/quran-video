import {
  createCtcCalibrationCapture,
  parseMediaDebugEvents,
  type CalibrationExpectation,
  type CtcCalibrationCapture,
} from "./ctc-calibration-capture.ts";

/**
 * Offline-only canonical trajectory of the winning coherent FastConformer
 * path. Coordinates are canonical word positions relative to the smallest
 * coherent-candidate start, so fixtures retain progression shape without Quran
 * text, absolute word indices, audio, or source identity.
 */
export type TrajectoryCoherentCandidate = {
  surah: number;
  startAyah: number;
  endAyah: number;
  /** Inclusive relative canonical word coordinates. */
  start: number;
  end: number;
  ctc: number | null;
  origins: string[];
};

export type TrajectoryLocalWinner = {
  surah: number;
  startAyah: number;
  endAyah: number;
  /** Relative coordinates only when the independent winner is in the coherent path's surah. */
  sameSurah: boolean;
  start: number | null;
  end: number | null;
  ctc: number | null;
};

export type TrajectoryWindow = {
  index: number;
  coherent: TrajectoryCoherentCandidate | null;
  localWinner: TrajectoryLocalWinner | null;
  anchorEvent: string;
};

export type ProgressionProvenance =
  | "design"
  | "external-validation"
  | "progression-design-support"
  | "progression-held-out"
  | "short-gate-design-support"
  | "short-gate-held-out"
  /** Frozen external validation of the progression candidate; never used for calibration. */
  | "progression-external-validation"
  /** Frozen external validation of canonical passage reconstruction. */
  | "canonical-reconstruction-external-validation";

export type ProgressionTrajectoryFixture = CtcCalibrationCapture & {
  provenance: ProgressionProvenance;
  readerGroup: string;
  /** Null for positives. */
  negativeType: string | null;
  trajectory: {
    coordinateOrigin: "minimum-coherent-start";
    windows: TrajectoryWindow[];
  };
};

type Position = { surah: number; ayah: number; globalWordIndex: number };
type RawCandidate = { start: Position; end: Position; normalizedCtcScore?: unknown; origins?: unknown };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function position(value: unknown): Position | null {
  const facts = object(value);
  const surah = facts?.surah;
  const ayah = facts?.ayah;
  const globalWordIndex = facts?.globalWordIndex;
  return Number.isInteger(surah) && Number.isInteger(ayah) && Number.isInteger(globalWordIndex)
    ? { surah: surah as number, ayah: ayah as number, globalWordIndex: globalWordIndex as number }
    : null;
}

function candidate(value: unknown): RawCandidate | null {
  const facts = object(value);
  const start = position(facts?.start);
  const end = position(facts?.end);
  return facts && start && end ? { start, end, normalizedCtcScore: facts.normalizedCtcScore, origins: facts.origins } : null;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Builds a privacy-safe trajectory from the latest build-marked debug run. */
export function extractTrajectoryWindows(input: string): TrajectoryWindow[] {
  const parsed = parseMediaDebugEvents(input);
  const lastBuildMarker = parsed.findLastIndex((entry) => entry.event === "build-marker");
  const events = parsed.slice(Math.max(0, lastBuildMarker));
  const results = new Map(events.filter((entry) => entry.event === "fastconformer-window-result").map((entry) => [entry.facts.index, entry.facts]));
  const gates = events.filter((entry) => entry.event === "ctc-gate-input").map((entry) => entry.facts)
    .sort((left, right) => Number(left.windowIndex) - Number(right.windowIndex));
  const coherent = gates.map((gate) => candidate(gate.coherentPathCandidate));
  const starts = coherent.flatMap((entry) => entry ? [entry.start.globalWordIndex] : []);
  const origin = starts.length ? Math.min(...starts) : null;
  const surah = coherent.find((entry) => entry)?.start.surah ?? null;
  return gates.map((gate, position) => {
    const selected = coherent[position] ?? null;
    const local = candidate(gate.independentWindowWinner);
    const continuation = object(results.get(gate.windowIndex)?.continuation);
    const sameSurah = local !== null && surah !== null && local.start.surah === surah && local.end.surah === surah;
    return {
      index: gate.windowIndex as number,
      coherent: selected && origin !== null ? {
        surah: selected.start.surah,
        startAyah: selected.start.ayah,
        endAyah: selected.end.ayah,
        start: selected.start.globalWordIndex - origin,
        end: selected.end.globalWordIndex - origin,
        ctc: finite(selected.normalizedCtcScore),
        origins: Array.isArray(selected.origins) ? selected.origins.filter((item): item is string => typeof item === "string") : [],
      } : null,
      localWinner: local ? {
        surah: local.start.surah,
        startAyah: local.start.ayah,
        endAyah: local.end.ayah,
        sameSurah,
        start: sameSurah && origin !== null ? local.start.globalWordIndex - origin : null,
        end: sameSurah && origin !== null ? local.end.globalWordIndex - origin : null,
        ctc: finite(local.normalizedCtcScore),
      } : null,
      anchorEvent: typeof continuation?.event === "string" ? continuation.event : "unknown",
    };
  });
}

export function createProgressionTrajectoryFixture(
  input: string,
  metadata: {
    id: string;
    expected: CalibrationExpectation;
    provenance: ProgressionProvenance;
    readerGroup: string;
    negativeType: string | null;
  },
): ProgressionTrajectoryFixture {
  const capture = createCtcCalibrationCapture(input, { id: metadata.id, expected: metadata.expected });
  const windows = extractTrajectoryWindows(input);
  if (windows.length !== capture.windows.length) throw new Error("Trajectory and gate windows disagree.");
  return {
    ...capture,
    provenance: metadata.provenance,
    readerGroup: metadata.readerGroup,
    negativeType: metadata.negativeType,
    trajectory: { coordinateOrigin: "minimum-coherent-start", windows },
  };
}

/**
 * Tolerance, in canonical words, for treating a start that moves slightly
 * earlier as ordinary overlap/span widening. It matches the production
 * continuity solver's own backward-movement boundary (`movement < -2`).
 */
export const BACKWARD_TOLERANCE_WORDS = 2;
/** A coherent window whose new canonical words are below this fraction of its span primarily revisits prior coverage. */
export const REVISIT_NEW_FRACTION = 0.25;

export type ProgressionTransition = {
  fromIndex: number;
  toIndex: number;
  deltaStart: number;
  deltaEnd: number;
  /** |previous ∩ current| / |current| for consecutive coherent candidates. */
  candidateOverlap: number;
  forwardConsistent: boolean;
  backward: boolean;
  reset: boolean;
};

export type ProgressionFeatures = {
  generatedWindowCount: number;
  coherentWindowCount: number;
  transitionCount: number;
  transitions: ProgressionTransition[];
  newWordsByCoherentWindow: number[];
  medianCandidateOverlap: number | null;
  maximumCandidateOverlap: number | null;
  medianNewWordsPerWindow: number | null;
  minimumNewWordsPerWindow: number | null;
  forwardTransitionCount: number;
  backwardTransitionCount: number;
  backwardRatio: number | null;
  monotonicityRatio: number | null;
  resetCount: number;
  resetAfterProgressCount: number;
  distinctCoverage: number;
  totalCandidateCoverage: number;
  noveltyRatio: number | null;
  progressionEfficiency: number | null;
  revisitWindowCount: number;
  revisitRatio: number | null;
  noProgressWindowCount: number;
  longestNoProgressRun: number;
  /** Distinct canonical positions covered after each generated window. */
  cumulativeCoverage: number[];
  local: {
    comparableWindowCount: number;
    agreeingWindowCount: number;
    agreementRatio: number | null;
    behindFrontierCount: number;
    forcedForwardCount: number;
  };
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function median(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
}

function spanLength(span: { start: number; end: number }) {
  return Math.max(0, span.end - span.start + 1);
}

function intersection(left: { start: number; end: number }, right: { start: number; end: number }) {
  return Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start) + 1);
}

/** Pure progression features over the chronological coherent path. */
export function computeProgressionFeatures(windows: readonly TrajectoryWindow[]): ProgressionFeatures {
  const ordered = [...windows].sort((left, right) => left.index - right.index);
  const covered = new Set<number>();
  const transitions: ProgressionTransition[] = [];
  const newWords: number[] = [];
  const cumulativeCoverage: number[] = [];
  let previous: { index: number; coherent: TrajectoryCoherentCandidate } | null = null;
  let first: TrajectoryCoherentCandidate | null = null;
  let totalCandidateCoverage = 0;
  let absoluteMidpointMovement = 0;
  let madeProgress = false;
  let resetAfterProgressCount = 0;
  let revisitWindowCount = 0;
  let noProgressWindowCount = 0;
  let noProgressRun = 0;
  let longestNoProgressRun = 0;
  let comparableWindowCount = 0;
  let agreeingWindowCount = 0;
  let behindFrontierCount = 0;
  let forcedForwardCount = 0;

  for (const window of ordered) {
    const local = window.localWinner;
    if (local) {
      comparableWindowCount += 1;
      const current = window.coherent;
      if (current && local.sameSurah && local.start !== null && local.end !== null
        && Math.abs(local.start - current.start) <= BACKWARD_TOLERANCE_WORDS && Math.abs(local.end - current.end) <= BACKWARD_TOLERANCE_WORDS) {
        agreeingWindowCount += 1;
      }
      if (previous && local.sameSurah && local.end !== null && local.end < previous.coherent.start - BACKWARD_TOLERANCE_WORDS) {
        behindFrontierCount += 1;
        if (current && current.start >= previous.coherent.start - BACKWARD_TOLERANCE_WORDS) forcedForwardCount += 1;
      }
    }

    const current = window.coherent;
    if (current) {
      const length = spanLength(current);
      let added = 0;
      for (let position = current.start; position <= current.end; position += 1) {
        if (!covered.has(position)) added += 1;
      }
      if (previous) {
        const deltaStart = current.start - previous.coherent.start;
        const deltaEnd = current.end - previous.coherent.end;
        const backward = deltaStart < -BACKWARD_TOLERANCE_WORDS;
        const reset = backward && current.end < previous.coherent.start;
        transitions.push({
          fromIndex: previous.index,
          toIndex: window.index,
          deltaStart,
          deltaEnd,
          candidateOverlap: round(intersection(previous.coherent, current) / Math.max(1, length)),
          forwardConsistent: deltaStart >= -BACKWARD_TOLERANCE_WORDS && deltaEnd >= -BACKWARD_TOLERANCE_WORDS,
          backward,
          reset,
        });
        if (reset && madeProgress) resetAfterProgressCount += 1;
        absoluteMidpointMovement += Math.abs((current.start + current.end) / 2 - (previous.coherent.start + previous.coherent.end) / 2);
        if (added > 0) madeProgress = true;
        const revisit = added < REVISIT_NEW_FRACTION * length;
        if (revisit) revisitWindowCount += 1;
        if (added === 0) {
          noProgressWindowCount += 1;
          noProgressRun += 1;
          longestNoProgressRun = Math.max(longestNoProgressRun, noProgressRun);
        } else {
          noProgressRun = 0;
        }
      }
      for (let position = current.start; position <= current.end; position += 1) covered.add(position);
      newWords.push(added);
      totalCandidateCoverage += length;
      first ??= current;
      previous = { index: window.index, coherent: current };
    }
    cumulativeCoverage.push(covered.size);
  }

  const coherentWindowCount = newWords.length;
  const transitionCount = transitions.length;
  const forwardTransitionCount = transitions.filter((transition) => transition.forwardConsistent).length;
  const backwardTransitionCount = transitions.filter((transition) => transition.backward).length;
  const later = newWords.slice(1);
  const netMidpointMovement = first && previous
    ? (previous.coherent.start + previous.coherent.end) / 2 - (first.start + first.end) / 2
    : 0;
  return {
    generatedWindowCount: ordered.length,
    coherentWindowCount,
    transitionCount,
    transitions,
    newWordsByCoherentWindow: newWords,
    medianCandidateOverlap: median(transitions.map((transition) => transition.candidateOverlap)),
    maximumCandidateOverlap: transitionCount ? Math.max(...transitions.map((transition) => transition.candidateOverlap)) : null,
    medianNewWordsPerWindow: median(later),
    minimumNewWordsPerWindow: later.length ? Math.min(...later) : null,
    forwardTransitionCount,
    backwardTransitionCount,
    backwardRatio: transitionCount ? round(backwardTransitionCount / transitionCount) : null,
    monotonicityRatio: transitionCount ? round(forwardTransitionCount / transitionCount) : null,
    resetCount: transitions.filter((transition) => transition.reset).length,
    resetAfterProgressCount,
    distinctCoverage: covered.size,
    totalCandidateCoverage,
    noveltyRatio: totalCandidateCoverage ? round(covered.size / totalCandidateCoverage) : null,
    progressionEfficiency: absoluteMidpointMovement > 0 ? round(netMidpointMovement / absoluteMidpointMovement) : null,
    revisitWindowCount,
    revisitRatio: later.length ? round(revisitWindowCount / later.length) : null,
    noProgressWindowCount,
    longestNoProgressRun,
    cumulativeCoverage,
    local: {
      comparableWindowCount,
      agreeingWindowCount,
      agreementRatio: comparableWindowCount ? round(agreeingWindowCount / comparableWindowCount) : null,
      behindFrontierCount,
      forcedForwardCount,
    },
  };
}

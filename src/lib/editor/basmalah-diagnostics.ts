import { CANONICAL_BASMALAH_ARABIC } from "../quran/content.ts";
import {
  arabicCaptionDisplay,
  arabicCaptionPresentationWords,
  type CaptionSegment,
  type CaptionWordTiming,
  type WordHighlightMode,
} from "./captions.ts";

type PreludeWordTiming = Pick<CaptionWordTiming, "canonicalWordIndex" | "startMs" | "endMs">;

export type BasmalahDiagnosticsPrelude = {
  startMs: number | null;
  endMs: number | null;
  wordTimings?: readonly PreludeWordTiming[];
};

type DisplayTokenMapping = {
  displayTokenIndex: number;
  wordTimingIndex: number | null;
  canonicalWordIndex: number | null;
};

export type BasmalahDiagnostic = {
  contentKind: "basmalah-prelude";
  startMs: number;
  endMs: number;
  canonicalBasmalahText: string;
  canonicalLexicalTokenCount: number;
  canonicalTokens: string[];
  optionalPrelude: {
    startMs: number | null;
    endMs: number | null;
    wordTimings: Array<PreludeWordTiming>;
  } | null;
  captionWordTimings: Array<CaptionWordTiming & { index: number }>;
  displayTokens: string[];
  presentationTokens: string[];
  normalizedComparisonTokens: string[];
  displayTokenToWordTiming: DisplayTokenMapping[];
  wordHighlightMode: WordHighlightMode;
  counts: {
    canonicalWordCount: number;
    optionalPreludeWordTimingCount: number;
    captionWordTimingCount: number;
    displayTokenCount: number;
    mappedDisplayTokenCount: number;
  };
  finalWord: {
    canonicalWordIndex: number;
    hasPreludeTiming: boolean;
    hasCaptionTiming: boolean;
    hasPresentationMapping: boolean;
    hasValidStart: boolean;
    hasValidEnd: boolean;
  };
  representativeHighlightEvaluation: Array<{
    label: "before-final-word-start" | "at-final-word-start" | "midpoint-to-segment-end" | "before-segment-end";
    timeMs: number;
    highlightedCanonicalWordIndexes: number[];
  }> | null;
};

function tokens(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

/** Comparison-only normalization; it never changes the displayed Quran text. */
function normalizeComparisonToken(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[ٱأإآ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ـ/gu, "")
    .replace(/[^\u0621-\u063a\u0641-\u064a]/gu, "");
}

function displayTokenMappings(displayTokens: readonly string[], timings: readonly (CaptionWordTiming & { index: number })[]): DisplayTokenMapping[] {
  const mappings: DisplayTokenMapping[] = displayTokens.map((_, displayTokenIndex) => ({ displayTokenIndex, wordTimingIndex: null, canonicalWordIndex: null }));
  let cursor = 0;
  for (const timing of [...timings].sort((left, right) => left.sourceWordStart - right.sourceWordStart || left.canonicalWordIndex - right.canonicalWordIndex)) {
    const valid = Number.isInteger(timing.canonicalWordIndex)
      && timing.canonicalWordIndex > 0
      && Number.isInteger(timing.sourceWordStart)
      && Number.isInteger(timing.sourceWordEnd)
      && timing.sourceWordStart >= 0
      && timing.sourceWordStart < timing.sourceWordEnd
      && timing.sourceWordEnd <= displayTokens.length
      && Number.isFinite(timing.startMs)
      && Number.isFinite(timing.endMs)
      && timing.startMs < timing.endMs;
    if (!valid || timing.sourceWordStart < cursor) continue;
    for (let displayTokenIndex = timing.sourceWordStart; displayTokenIndex < timing.sourceWordEnd; displayTokenIndex += 1) {
      mappings[displayTokenIndex] = {
        displayTokenIndex,
        wordTimingIndex: timing.index,
        canonicalWordIndex: timing.canonicalWordIndex,
      };
    }
    cursor = timing.sourceWordEnd;
  }
  return mappings;
}

function presentationCanonicalIndexes(segment: CaptionSegment, wordHighlightMode: WordHighlightMode, timeMs: number): number[] {
  const displayTokens = tokens(arabicCaptionDisplay(segment, false).canonicalText);
  const timings = (segment.wordTimings ?? []).map((timing, index) => ({ ...timing, index }));
  const mappings = displayTokenMappings(displayTokens, timings);
  const presentationWords = arabicCaptionPresentationWords(segment, false, timeMs, wordHighlightMode)
    .filter((word) => word.kind === "quran-word");
  return presentationWords.flatMap((word, index) => word.highlighted
    ? mappings[index]?.canonicalWordIndex === null || mappings[index]?.canonicalWordIndex === undefined
      ? []
      : [mappings[index]!.canonicalWordIndex!]
    : []);
}

/** Explicit query gate so diagnostics remain unavailable in ordinary production use. */
export function basmalahDiagnosticsEnabled(search: string): boolean {
  return new URLSearchParams(search).get("debugBasmalah") === "1";
}

/** The control is scoped to the actual prelude segment and never to DOM layout. */
export function shouldShowBasmalahDiagnostics(search: string, segments: readonly CaptionSegment[]): boolean {
  return basmalahDiagnosticsEnabled(search) && segments.some((segment) => segment.contentKind === "basmalah-prelude");
}

/**
 * Builds a copy-safe view of the prelude's alignment-to-presentation handoff.
 * It reads logical source token indexes only; line wrapping never participates.
 */
export function createBasmalahDiagnostic({
  segment,
  optionalPrelude,
  wordHighlightMode,
}: {
  segment: CaptionSegment;
  optionalPrelude: BasmalahDiagnosticsPrelude | null;
  wordHighlightMode: WordHighlightMode;
}): BasmalahDiagnostic {
  if (segment.contentKind !== "basmalah-prelude") throw new Error("Basmalah diagnostics require a basmalah-prelude segment.");
  const canonicalTokens = tokens(CANONICAL_BASMALAH_ARABIC);
  const displayTokens = tokens(arabicCaptionDisplay(segment, false).canonicalText);
  const captionWordTimings = (segment.wordTimings ?? []).map((timing, index) => ({ index, ...timing }));
  const mappings = displayTokenMappings(displayTokens, captionWordTimings);
  const finalCanonicalWordIndex = canonicalTokens.length;
  const preludeFinalTiming = optionalPrelude?.wordTimings?.find((timing) => timing.canonicalWordIndex === finalCanonicalWordIndex) ?? null;
  const captionFinalTiming = captionWordTimings.find((timing) => timing.canonicalWordIndex === finalCanonicalWordIndex) ?? null;
  const hasValidStart = Boolean(captionFinalTiming && Number.isFinite(captionFinalTiming.startMs));
  const hasValidEnd = Boolean(captionFinalTiming
    && Number.isFinite(captionFinalTiming.startMs)
    && Number.isFinite(captionFinalTiming.endMs)
    && captionFinalTiming.startMs < captionFinalTiming.endMs);
  const representativeHighlightEvaluation = hasValidStart && captionFinalTiming
    ? [
      { label: "before-final-word-start" as const, timeMs: captionFinalTiming.startMs - 1 },
      { label: "at-final-word-start" as const, timeMs: captionFinalTiming.startMs },
      ...(Number.isFinite(segment.endMs) && captionFinalTiming.startMs < segment.endMs
        ? [{ label: "midpoint-to-segment-end" as const, timeMs: Math.floor((captionFinalTiming.startMs + segment.endMs) / 2) }]
        : []),
      { label: "before-segment-end" as const, timeMs: segment.endMs - 1 },
    ].map(({ label, timeMs }) => ({ label, timeMs, highlightedCanonicalWordIndexes: presentationCanonicalIndexes(segment, wordHighlightMode, timeMs) }))
    : null;

  return {
    contentKind: segment.contentKind,
    startMs: segment.startMs,
    endMs: segment.endMs,
    canonicalBasmalahText: CANONICAL_BASMALAH_ARABIC,
    canonicalLexicalTokenCount: canonicalTokens.length,
    canonicalTokens,
    optionalPrelude: optionalPrelude ? {
      startMs: optionalPrelude.startMs,
      endMs: optionalPrelude.endMs,
      wordTimings: optionalPrelude.wordTimings?.map((timing) => ({ ...timing })) ?? [],
    } : null,
    captionWordTimings,
    displayTokens,
    presentationTokens: arabicCaptionPresentationWords(segment, false, segment.startMs, "off").filter((word) => word.kind === "quran-word").map((word) => word.text),
    normalizedComparisonTokens: displayTokens.map(normalizeComparisonToken),
    displayTokenToWordTiming: mappings,
    wordHighlightMode,
    counts: {
      canonicalWordCount: canonicalTokens.length,
      optionalPreludeWordTimingCount: optionalPrelude?.wordTimings?.length ?? 0,
      captionWordTimingCount: captionWordTimings.length,
      displayTokenCount: displayTokens.length,
      mappedDisplayTokenCount: mappings.filter((mapping) => mapping.wordTimingIndex !== null).length,
    },
    finalWord: {
      canonicalWordIndex: finalCanonicalWordIndex,
      hasPreludeTiming: preludeFinalTiming !== null,
      hasCaptionTiming: captionFinalTiming !== null,
      hasPresentationMapping: mappings.some((mapping) => mapping.canonicalWordIndex === finalCanonicalWordIndex),
      hasValidStart,
      hasValidEnd,
    },
    representativeHighlightEvaluation,
  };
}

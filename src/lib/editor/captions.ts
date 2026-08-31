import { quranDisplayText } from "../quran/content.ts";
import type { QuranVerseContent } from "../quran/content.ts";
import type { VerseAlignment } from "./recognition.ts";
import type { z } from "zod";
import type { CaptionBackgroundSchema, CaptionPositioningSchema, TransitionSettingsSchema, TypographySchema } from "../schemas/project.ts";
import type { ProjectFormat } from "../schemas/project.ts";

export type Typography = z.infer<typeof TypographySchema>;
export type CaptionBackground = z.infer<typeof CaptionBackgroundSchema>;
export type CaptionPositioning = z.infer<typeof CaptionPositioningSchema>;
export type TransitionSettings = z.infer<typeof TransitionSettingsSchema>;
export type CaptionPresentationSettings = { showVerseNumber: boolean };

export const DEFAULT_CAPTION_PRESENTATION: CaptionPresentationSettings = {
  showVerseNumber: false,
};

const DEFAULT_VERTICAL_CAPTION_POSITIONING: CaptionPositioning = {
  anchor: "bottom",
  x: 0.5,
  y: 0.62,
  translationX: 0.5,
  translationY: 0.74,
  translationPositionLinked: true,
  maxWidthPercent: 0.9,
  translationMaxWidthPercent: 0.9,
  translationGapPx: 8,
};

export const DEFAULT_CAPTION_POSITIONING: CaptionPositioning = { ...DEFAULT_VERTICAL_CAPTION_POSITIONING };

export const DEFAULT_CAPTION_POSITIONING_BY_FORMAT: Record<ProjectFormat["preset"], CaptionPositioning> = {
  vertical: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING },
  landscape: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING, y: 0.68, translationY: 0.8 },
  square: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING, y: 0.64, translationY: 0.76 },
};

export const DEFAULT_TYPOGRAPHY: Typography = {
  quranStyle: "uthmani",
  arabicFontFamily: "UthmanicHafs",
  translationFontFamily: "Arial, Helvetica, sans-serif",
  transliterationFontFamily: "Arial, Helvetica, sans-serif",
  arabicFontSize: 38,
  translationFontSize: 15,
  transliterationFontSize: 14,
  textColor: "#ffffff",
  arabicOutlineEnabled: false,
  arabicOutlineWidth: 1,
  arabicOutlineColor: "#000000",
  arabicShadowEnabled: true,
  arabicShadowBlur: 8,
  arabicShadowStrength: 0.65,
  arabicOpacity: 1,
  textAlign: "center",
  arabicLineSpacing: 1.35,
  translationVisible: true,
  translationTextColor: "#f2f2f2",
  translationOutlineEnabled: false,
  translationOutlineWidth: 1,
  translationOutlineColor: "#000000",
  translationShadowEnabled: true,
  translationShadowBlur: 5,
  translationShadowStrength: 0.55,
  translationOpacity: 0.82,
  translationSpacingBelowArabic: 8,
  translationTextAlign: "center",
  transliterationVisible: false,
};

export const DEFAULT_CAPTION_BACKGROUND: CaptionBackground = {
  enabled: false,
  color: "#10221d",
  opacity: 0,
  cornerRadius: 16,
  horizontalPadding: 20,
  verticalPadding: 16,
};

export const DEFAULT_TRANSITION_SETTINGS: TransitionSettings = {
  type: "fade",
  fadeInMs: 225,
  fadeOutMs: 225,
  blurFadeEnabled: false,
  blurFadeMaxPx: 12,
};

export function resetTypography(): Typography {
  return { ...DEFAULT_TYPOGRAPHY };
}

export function resetCaptionBackground(): CaptionBackground {
  return { ...DEFAULT_CAPTION_BACKGROUND };
}

export function resetTransitionSettings(): TransitionSettings {
  return { ...DEFAULT_TRANSITION_SETTINGS };
}

export function captionVerseNumberLabel(segment: Pick<CaptionSegment, "verseKeys">): string {
  return segment.verseKeys.map((verseKey) => verseKey.split(":")[1] ?? verseKey).join(", ");
}

export function clampNormalizedPosition(value: number, minimum = 0.06, maximum = 0.94): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function captionPositionBounds(format: ProjectFormat, maxWidthPercent = DEFAULT_CAPTION_POSITIONING.maxWidthPercent): { x: [number, number]; y: [number, number] } {
  const horizontalInset = Math.min(0.46, Math.max(0.06, maxWidthPercent / 2));
  const socialBottom = format.preset === "vertical" ? 0.82 : 0.94;
  const minimumY = 0.06;
  return { x: [horizontalInset, 1 - horizontalInset], y: [minimumY, socialBottom] };
}

export function clampCaptionPositioning(positioning: CaptionPositioning, format: ProjectFormat): CaptionPositioning {
  const bounds = captionPositionBounds(format, positioning.maxWidthPercent);
  const next = { ...positioning };
  next.translationMaxWidthPercent = Math.min(0.96, Math.max(0.2, positioning.translationMaxWidthPercent ?? positioning.maxWidthPercent));
  next.x = clampNormalizedPosition(positioning.x, bounds.x[0], bounds.x[1]);
  next.y = clampNormalizedPosition(positioning.y, bounds.y[0], bounds.y[1]);
  next.translationX = clampNormalizedPosition(positioning.translationX, bounds.x[0], bounds.x[1]);
  next.translationY = clampNormalizedPosition(positioning.translationY, bounds.y[0], bounds.y[1]);
  if (next.translationPositionLinked) {
    next.translationX = next.x;
    next.translationY = clampNormalizedPosition(next.y + 0.12, bounds.y[0], bounds.y[1]);
  }
  return next;
}

export function resizeCaptionWidth(
  positioning: CaptionPositioning,
  kind: "arabic" | "translation",
  widthPercent: number,
  format: ProjectFormat,
): CaptionPositioning {
  const next = {
    ...positioning,
    translationPositionLinked: false,
    ...(kind === "arabic"
      ? { maxWidthPercent: widthPercent }
      : { translationMaxWidthPercent: widthPercent }),
  };
  return clampCaptionPositioning(next, format);
}

export function resetCaptionPositioning(format: ProjectFormat): CaptionPositioning {
  return clampCaptionPositioning(DEFAULT_CAPTION_POSITIONING_BY_FORMAT[format.preset], format);
}

export function updateCaptionPosition(
  positioning: CaptionPositioning,
  kind: "arabic" | "translation",
  x: number,
  y: number,
  format?: ProjectFormat,
): CaptionPositioning {
  const next = { ...positioning };
  const bounds = format ? captionPositionBounds(format, positioning.maxWidthPercent) : { x: [0.06, 0.94] as [number, number], y: [0.06, 0.94] as [number, number] };
  if (kind === "arabic") {
    next.x = clampNormalizedPosition(x, bounds.x[0], bounds.x[1]);
    next.y = clampNormalizedPosition(y, bounds.y[0], bounds.y[1]);
    if (next.translationPositionLinked) {
      next.translationX = next.x;
      next.translationY = clampNormalizedPosition(next.y + 0.12, bounds.y[0], bounds.y[1]);
    }
  } else {
    next.translationX = clampNormalizedPosition(x, bounds.x[0], bounds.x[1]);
    next.translationY = clampNormalizedPosition(y, bounds.y[0], bounds.y[1]);
  }
  return next;
}

function hexToRgba(color: string, opacity: number): string {
  const value = color.replace("#", "");
  const hex = value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
  if (!/^[\da-f]{6}$/i.test(hex)) return "transparent";
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function captionBackgroundStyle(background: CaptionBackground): {
  backgroundColor: string;
  borderRadius: string;
  padding: string;
} {
  return {
    backgroundColor: background.enabled ? hexToRgba(background.color, background.opacity) : "transparent",
    borderRadius: `${background.cornerRadius}px`,
    padding: `${background.verticalPadding}px ${background.horizontalPadding}px`,
  };
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function adjacentTransitionRange(
  segment: Pick<CaptionSegment, "endMs">,
  next: Pick<CaptionSegment, "startMs">,
  settings: TransitionSettings,
): { startMs: number; endMs: number } | null {
  if (settings.type !== "fade" || settings.fadeInMs <= 0 || settings.fadeOutMs <= 0) return null;
  if (next.startMs - segment.endMs > Math.max(settings.fadeInMs, settings.fadeOutMs)) return null;
  const startMs = segment.endMs - settings.fadeOutMs;
  const endMs = next.startMs + settings.fadeInMs;
  return endMs > startMs ? { startMs, endMs } : null;
}

export type CaptionTransitionState = {
  opacity: number;
  blurPx: number;
};

function blurAtOpacity(opacity: number, settings: TransitionSettings): number {
  return settings.blurFadeEnabled ? settings.blurFadeMaxPx * (1 - opacity) : 0;
}

/** Pure visual interpolation tied to absolute video time. */
export function captionTransitionAtTime(
  segment: Pick<CaptionSegment, "startMs" | "endMs">,
  timeMs: number,
  settings: TransitionSettings = DEFAULT_TRANSITION_SETTINGS,
): CaptionTransitionState {
  if (!Number.isFinite(timeMs) || timeMs < segment.startMs || timeMs >= segment.endMs) return { opacity: 0, blurPx: 0 };
  if (settings.type === "none") return { opacity: 1, blurPx: 0 };
  const fadeIn = settings.fadeInMs > 0 ? clampOpacity((timeMs - segment.startMs) / settings.fadeInMs) : 1;
  const fadeOut = settings.fadeOutMs > 0 ? clampOpacity((segment.endMs - timeMs) / settings.fadeOutMs) : 1;
  const opacity = Math.min(fadeIn, fadeOut);
  return { opacity, blurPx: blurAtOpacity(opacity, settings) };
}

/**
 * Returns the deterministic opacity for a segment at a video timestamp.
 * It intentionally has no timers or playback state, so seeking is equivalent
 * to playback at the same timestamp.
 */
export function captionOpacityAtTime(
  segment: Pick<CaptionSegment, "startMs" | "endMs">,
  timeMs: number,
  settings: TransitionSettings = DEFAULT_TRANSITION_SETTINGS,
): number {
  return captionTransitionAtTime(segment, timeMs, settings).opacity;
}

export type CaptionVisualState<T extends { startMs: number; endMs: number }> = {
  segment: T;
  opacity: number;
  blurPx: number;
};

/**
 * Computes the visible caption layers for preview. Adjacent segments get a
 * short visual crossfade when their editable timings touch; their stored
 * timing ranges remain non-overlapping.
 */
export function captionVisualStatesAtTime<T extends { startMs: number; endMs: number }>(
  segments: readonly T[],
  timeMs: number,
  settings: TransitionSettings = DEFAULT_TRANSITION_SETTINGS,
): CaptionVisualState<T>[] {
  return segments.flatMap((segment, index) => {
    const baseState = captionTransitionAtTime(segment, timeMs, settings);
    let opacity = baseState.opacity;
    let blurPx = baseState.blurPx;
    const previous = segments[index - 1];
    const next = segments[index + 1];
    const incoming = previous ? adjacentTransitionRange(previous, segment, settings) : null;
    const outgoing = next ? adjacentTransitionRange(segment, next, settings) : null;
    if (incoming && timeMs >= incoming.startMs && timeMs < incoming.endMs) {
      opacity = clampOpacity((timeMs - incoming.startMs) / (incoming.endMs - incoming.startMs));
    } else if (outgoing && timeMs >= outgoing.startMs && timeMs < outgoing.endMs) {
      opacity = clampOpacity((outgoing.endMs - timeMs) / (outgoing.endMs - outgoing.startMs));
    }
    blurPx = blurAtOpacity(opacity, settings);
    return opacity > 0 ? [{ segment, opacity, blurPx }] : [];
  });
}

export type CaptionTimingSource = "direct-asr-word" | "chunk-text-alignment" | "interpolation" | "derived";

export type CaptionSegment = {
  id: string;
  verseKeys: string[];
  startMs: number;
  endMs: number;
  arabic: string;
  translation: string | null;
  transliteration: string | null;
  wordStart: number;
  wordEnd: number;
  wordCount: number;
  timingEvidence: {
    start: { timestampMs: number; source: CaptionTimingSource };
    end: { timestampMs: number; source: CaptionTimingSource };
    derived: boolean;
  };
};

export type CaptionTimingPatch = { startMs?: number; endMs?: number };

/** Clamp editable display timing to duration and neighboring display segments. */
export function updateCaptionSegmentTiming(
  segments: readonly CaptionSegment[],
  id: string,
  patch: CaptionTimingPatch,
  durationMs: number,
): CaptionSegment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return [...segments];
  const current = segments[index];
  const minimumStart = index > 0 ? segments[index - 1].endMs : 0;
  const maximumEnd = index < segments.length - 1 ? segments[index + 1].startMs : Math.max(0, durationMs);
  const lowerEnd = Math.min(maximumEnd, Math.max(minimumStart + 1, current.endMs));
  let startMs = Math.round(Number.isFinite(patch.startMs ?? current.startMs) ? patch.startMs ?? current.startMs : current.startMs);
  let endMs = Math.round(Number.isFinite(patch.endMs ?? current.endMs) ? patch.endMs ?? current.endMs : current.endMs);
  startMs = Math.max(minimumStart, Math.min(startMs, lowerEnd - 1));
  endMs = Math.min(maximumEnd, Math.max(endMs, startMs + 1));
  if (endMs > maximumEnd) {
    endMs = maximumEnd;
    startMs = Math.min(startMs, endMs - 1);
  }
  return segments.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, startMs, endMs } : segment);
}

export function resetCaptionSegmentTiming(segments: readonly CaptionSegment[], id: string, durationMs: number): CaptionSegment[] {
  const segment = segments.find((item) => item.id === id);
  if (!segment) return [...segments];
  return updateCaptionSegmentTiming(segments, id, {
    startMs: segment.timingEvidence.start.timestampMs,
    endMs: segment.timingEvidence.end.timestampMs,
  }, durationMs);
}

/** Translation remains attached to the parent verse when Arabic is visually split. */
export function translationForCaptionSegment(
  segment: Pick<CaptionSegment, "verseKeys">,
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
): string | null {
  return segment.verseKeys.map((verseKey) => content[verseKey]?.translation ?? null).find(Boolean) ?? null;
}

export const DEFAULT_MAX_WORDS_PER_SEGMENT = 8;

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function chunkBoundaries(totalWords: number, maxWords: number): Array<[number, number]> {
  if (totalWords <= maxWords) return [[0, totalWords]];
  const chunkCount = Math.ceil(totalWords / maxWords);
  const baseSize = Math.floor(totalWords / chunkCount);
  const largerChunks = totalWords % chunkCount;
  const boundaries: Array<[number, number]> = [];
  let start = 0;
  for (let index = 0; index < chunkCount; index += 1) {
    const size = baseSize + (index < largerChunks ? 1 : 0);
    boundaries.push([start, start + size]);
    start += size;
  }
  return boundaries;
}

function segmentTiming(alignment: VerseAlignment, startWord: number, endWord: number, totalWords: number) {
  const duration = Math.max(0, alignment.endMs - alignment.startMs);
  const startMs = Math.round(alignment.startMs + duration * startWord / totalWords);
  const endMs = endWord === totalWords ? alignment.endMs : Math.round(alignment.startMs + duration * endWord / totalWords);
  return {
    startMs,
    endMs: Math.max(startMs, endMs),
    timingEvidence: {
      start: { timestampMs: startMs, source: startWord === 0 ? alignment.timingEvidence.start.source : "derived" as const },
      end: { timestampMs: endMs, source: endWord === totalWords ? alignment.timingEvidence.end.source : "derived" as const },
      derived: startWord > 0 || endWord < totalWords,
    },
  };
}

export function createCaptionSegments(
  alignments: readonly VerseAlignment[],
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
  maxWordsPerSegment = DEFAULT_MAX_WORDS_PER_SEGMENT,
): CaptionSegment[] {
  if (!Number.isInteger(maxWordsPerSegment) || maxWordsPerSegment < 1) throw new Error("maxWordsPerSegment must be a positive integer");
  return alignments.flatMap((alignment) => {
    const verse = content[alignment.verseKey];
    const arabic = verse ? quranDisplayText(verse) : "";
    const verseWords = words(arabic);
    if (!verseWords.length) return [];
    const chunks: CaptionSegment[] = [];
    for (const [start, end] of chunkBoundaries(verseWords.length, maxWordsPerSegment)) {
      const timing = segmentTiming(alignment, start, end, verseWords.length);
      chunks.push({
        id: `${alignment.verseKey}#${chunks.length + 1}`,
        verseKeys: [alignment.verseKey],
        ...timing,
        arabic: verseWords.slice(start, end).join(" "),
        translation: verseWords.length <= maxWordsPerSegment ? verse?.translation ?? null : null,
        transliteration: verseWords.length <= maxWordsPerSegment ? verse?.transliteration ?? null : null,
        wordStart: start,
        wordEnd: end,
        wordCount: end - start,
      });
    }
    return chunks;
  });
}

export function splitCaptionSegment(segment: CaptionSegment, boundary: number): CaptionSegment[] {
  const verseWords = words(segment.arabic);
  if (!Number.isInteger(boundary) || boundary <= 0 || boundary >= verseWords.length) return [segment];
  const duration = segment.endMs - segment.startMs;
  const splitMs = Math.round(segment.startMs + duration * boundary / verseWords.length);
  const make = (start: number, end: number, suffix: string, startMs: number, endMs: number): CaptionSegment => ({
    ...segment,
    id: `${segment.id}.${suffix}`,
    startMs,
    endMs,
    arabic: verseWords.slice(start, end).join(" "),
    translation: segment.translation,
    transliteration: null,
    wordStart: segment.wordStart + start,
    wordEnd: segment.wordStart + end,
    timingEvidence: {
      start: { timestampMs: startMs, source: start === 0 ? segment.timingEvidence.start.source : "derived" },
      end: { timestampMs: endMs, source: end === verseWords.length ? segment.timingEvidence.end.source : "derived" },
      derived: true,
    },
  });
  return [make(0, boundary, "a", segment.startMs, splitMs), make(boundary, verseWords.length, "b", splitMs, segment.endMs)];
}

function mergeSegments(left: CaptionSegment, right: CaptionSegment): CaptionSegment {
  return {
    ...left,
    id: `${left.id}+${right.id}`,
    verseKeys: unique([...left.verseKeys, ...right.verseKeys]),
    endMs: right.endMs,
    arabic: `${left.arabic} ${right.arabic}`.trim(),
    translation: left.translation ?? right.translation,
    transliteration: null,
    wordEnd: right.wordEnd,
    wordCount: left.wordCount + right.wordCount,
    timingEvidence: {
      start: left.timingEvidence.start,
      end: right.timingEvidence.end,
      derived: left.timingEvidence.derived || right.timingEvidence.derived,
    },
  };
}

export function mergeCaptionWithPrevious(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index <= 0 || index >= segments.length) return [...segments];
  return [...segments.slice(0, index - 1), mergeSegments(segments[index - 1], segments[index]), ...segments.slice(index + 1)];
}

export function mergeCaptionWithNext(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index < 0 || index >= segments.length - 1) return [...segments];
  return [...segments.slice(0, index), mergeSegments(segments[index], segments[index + 1]), ...segments.slice(index + 2)];
}

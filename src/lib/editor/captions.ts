import { CANONICAL_BASMALAH_ARABIC, quranDisplayText } from "../quran/content.ts";
import { canonicalDisplayWords, DEFAULT_MAX_ARABIC_VISIBLE_CHARS, planAyahDisplaySplit, type CanonicalDisplayWord } from "./ayah-display-splitting.ts";
import type { QuranVerseContent } from "../quran/content.ts";
import type { VerseAlignment } from "./recognition.ts";
import type { VerseBoundary } from "../recognition/core.ts";
import type { z } from "zod";
import type { CaptionBackgroundSchema, CaptionPositioningSchema, TransitionSettingsSchema, TypographySchema } from "../schemas/project.ts";
import type { ProjectFormat } from "../schemas/project.ts";

export type Typography = z.infer<typeof TypographySchema>;
export type CaptionBackground = z.infer<typeof CaptionBackgroundSchema>;
export type CaptionPositioning = z.infer<typeof CaptionPositioningSchema>;
export type TransitionSettings = z.infer<typeof TransitionSettingsSchema>;
export type CaptionPresentationSettings = { showVerseNumber: boolean };

export const DEFAULT_CAPTION_PRESENTATION: CaptionPresentationSettings = {
  showVerseNumber: true,
};

const ARABIC_INDIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;

function ayahNumberFromVerseKey(verseKey: string | undefined): number | null {
  const value = verseKey?.split(":")[1];
  if (!value || !/^\d+$/u.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Formats a canonical ayah number without altering canonical Quran text. */
export function arabicIndicNumber(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return "";
  return String(value).replace(/\d/gu, (digit) => ARABIC_INDIC_DIGITS[Number(digit)]!);
}

/**
 * Produces the presentation-only Quranic ayah number for a segment. In the
 * UthmanicHafs browser font, an Arabic-Indic digit already renders inside its
 * own ayah frame; prepending U+06DD creates a second, empty frame.
 * The explicit metadata lets a future split show the number only on its final
 * piece, while legacy whole-ayah projects retain the current default.
 */
export function inlineVerseNumber(segment: Pick<CaptionSegment, "contentKind" | "verseKeys" | "showVerseNumberAtEnd">, showVerseNumber: boolean): string | null {
  if (!showVerseNumber || segment.contentKind !== "ayah" || segment.showVerseNumberAtEnd === false || segment.verseKeys.length !== 1) return null;
  const number = ayahNumberFromVerseKey(segment.verseKeys[0]);
  return number === null ? null : arabicIndicNumber(number);
}

export type ArabicCaptionDisplay = {
  canonicalText: string;
  verseNumber: string | null;
  text: string;
};

/** Removes only a terminal presentation-only ayah marker, never Quranic marks elsewhere. */
function withoutTerminalAyahMarker(value: string): string {
  return value.replace(/\s*\u06dd\s*[0-9٠-٩۰-۹]*\s*$/u, "").trimEnd();
}

/** Shared preview/export display composition; canonical source text is never mutated. */
export function arabicCaptionDisplay(segment: Pick<CaptionSegment, "arabic" | "contentKind" | "verseKeys" | "showVerseNumberAtEnd">, showVerseNumber: boolean): ArabicCaptionDisplay {
  // Existing display snapshots can already have a terminal U+06DD. When the
  // toggle is on, replace that presentation marker with the one numbered
  // marker below. When off, ayah text retains its pre-toggle appearance.
  const canonicalText = showVerseNumber || segment.contentKind === "basmalah-prelude"
    ? withoutTerminalAyahMarker(segment.arabic)
    : segment.arabic;
  const verseNumber = inlineVerseNumber(segment, showVerseNumber);
  return {
    canonicalText,
    verseNumber,
    text: verseNumber ? `${canonicalText}\u00a0${verseNumber}` : canonicalText,
  };
}

/** Canvas export uses the exact text composed from the same display metadata. */
export function composeArabicCaptionText(segment: Pick<CaptionSegment, "arabic" | "contentKind" | "verseKeys" | "showVerseNumberAtEnd">, showVerseNumber: boolean): string {
  return arabicCaptionDisplay(segment, showVerseNumber).text;
}

/** Canonical Hafs display text for the acoustically selected opening prelude. */
export { CANONICAL_BASMALAH_ARABIC } from "../quran/content.ts";

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

export type CaptionTransitionState = {
  opacity: number;
  blurPx: number;
};

/** The one authoritative half-open interval lookup used by preview and timeline. */
export function getActiveCaptionSegment<T extends { startMs: number; endMs: number }>(
  segments: readonly T[],
  currentTimeMs: number,
): T | null {
  if (!Number.isFinite(currentTimeMs)) return null;
  return segments.find((segment) => segment.startMs <= currentTimeMs && currentTimeMs < segment.endMs) ?? null;
}

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
 * Computes preview layers directly from the editable segment intervals. A
 * transition only interpolates opacity inside its own interval, so a caption
 * can never appear before `startMs` or persist at/after `endMs`.
 */
export function captionVisualStatesAtTime<T extends { startMs: number; endMs: number }>(
  segments: readonly T[],
  timeMs: number,
  settings: TransitionSettings = DEFAULT_TRANSITION_SETTINGS,
): CaptionVisualState<T>[] {
  const active = getActiveCaptionSegment(segments, timeMs);
  if (!active) return [];
  return [{ segment: active, ...captionTransitionAtTime(active, timeMs, settings) }];
}

// Legacy values remain readable for saved projects; new recognition writes the
// more specific two-stage evidence values.
export type CaptionTimingSource = "fastconformer" | "word-audio-refined" | "word-timestamp" | "merged-token-word1" | "bounded-recovery" | "token-interpolated" | "chunk-interpolated" | "low-confidence-fallback" | "direct-asr-word" | "chunk-text-alignment" | "interpolation" | "interpolated" | "low-confidence" | "micro-asr" | "pcm-refined" | "chunk-coarse" | "unknown" | "forced-alignment" | "derived";

type CaptionSegmentBase = {
  id: string;
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

/** Quran content is either canonically owned by ayat or an acoustic prelude. */
export type CaptionSegment = CaptionSegmentBase & {
  contentKind: "ayah" | "basmalah-prelude";
  /** Empty only for Quran preludes, which deliberately have no ayah owner. */
  verseKeys: string[];
  /** False on an intermediate split piece; legacy segments default to true. */
  showVerseNumberAtEnd?: boolean;
};

export type OptionalPreludeTiming = {
  available: boolean;
  selected: "present" | "absent";
  startMs: number | null;
  endMs: number | null;
};

export type CaptionTimingPatch = { startMs?: number; endMs?: number };

/**
 * CaptionSegment timing is the editable display model. Recognition evidence is
 * retained separately in timingEvidence so a manual edit is never mistaken for
 * a new recognition result.
 */
export function updateCaptionSegmentTiming(
  segments: readonly CaptionSegment[],
  id: string,
  patch: CaptionTimingPatch,
  durationMs: number,
): CaptionSegment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return [...segments];
  const current = segments[index];
  let startMs = Math.round(Number.isFinite(patch.startMs ?? current.startMs) ? patch.startMs ?? current.startMs : current.startMs);
  let endMs = Math.round(Number.isFinite(patch.endMs ?? current.endMs) ? patch.endMs ?? current.endMs : current.endMs);
  const maximumTime = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1);
  startMs = Math.max(0, Math.min(startMs, maximumTime - 1));
  endMs = Math.max(startMs + 1, Math.min(endMs, maximumTime));
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

/** Restore every display interval to its recognition-derived recommendation. */
export function resetAllCaptionSegmentTiming(segments: readonly CaptionSegment[], durationMs: number): CaptionSegment[] {
  return segments.reduce(
    (current, segment) => resetCaptionSegmentTiming(current, segment.id, durationMs),
    [...segments],
  );
}

/** Translation remains attached to the parent verse when Arabic is visually split. */
export function translationForCaptionSegment(
  segment: Pick<CaptionSegment, "verseKeys">,
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
): string | null {
  return segment.verseKeys.map((verseKey) => content[verseKey]?.translation ?? null).find(Boolean) ?? null;
}

/**
 * Kept for callers from older projects. Automatic generation is intentionally
 * whole-ayah regardless of this value; visual line wrapping is CSS, not a
 * second timed caption set.
 */
export const DEFAULT_MAX_WORDS_PER_SEGMENT = 8;
/** Central display-only threshold. It does not affect Quran recognition or alignment. */
export { DEFAULT_MAX_ARABIC_VISIBLE_CHARS } from "./ayah-display-splitting.ts";

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

/**
 * Default display timing deliberately differs from recognition timing: after
 * the first detected Quran onset, each next set starts at its own detected
 * onset and the previous set remains visible until that transition.
 */
function continuousDisplayTiming(segments: CaptionSegment[]): CaptionSegment[] {
  if (!segments.length) return segments;
  return segments.map((segment, index) => ({
    ...segment,
    startMs: segment.timingEvidence.start.timestampMs,
    endMs: index < segments.length - 1
      ? segments[index + 1].timingEvidence.start.timestampMs
      : segment.timingEvidence.end.timestampMs,
  })).map((segment) => ({
    ...segment,
    endMs: Math.max(segment.startMs + 1, segment.endMs),
  }));
}

export function createCaptionSegments(
  alignments: readonly VerseAlignment[],
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
  maxWordsPerSegment = DEFAULT_MAX_WORDS_PER_SEGMENT,
): CaptionSegment[] {
  if (!Number.isInteger(maxWordsPerSegment) || maxWordsPerSegment < 1) throw new Error("maxWordsPerSegment must be a positive integer");
  const generated = alignments.flatMap((alignment) => {
    const verse = content[alignment.verseKey];
    const arabic = verse ? quranDisplayText(verse) : "";
    const verseWords = words(arabic);
    if (!verseWords.length) return [];
    return [{
      id: `${alignment.verseKey}#1`,
      contentKind: "ayah" as const,
      verseKeys: [alignment.verseKey],
      startMs: alignment.startMs,
      endMs: alignment.endMs,
      arabic: verseWords.join(" "),
      translation: verse?.translation ?? null,
      transliteration: verse?.transliteration ?? null,
      wordStart: 0,
      wordEnd: verseWords.length,
      wordCount: verseWords.length,
      showVerseNumberAtEnd: true,
      timingEvidence: {
        start: { timestampMs: alignment.startMs, source: alignment.timingEvidence.start.source },
        end: { timestampMs: alignment.endMs, source: alignment.timingEvidence.end.source },
        derived: false,
      },
    }];
  });
  return continuousDisplayTiming(generated);
}

function canonicalArabicForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/gu, "")
    .replace(/[ۖۗۚۛۜۙۘ۝۞]/gu, "")
    .replace(/[ٱأإآ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ـ/gu, "")
    .replace(/[^\u0621-\u063a\u0641-\u064a]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isCanonicalBasmalah(verse: QuranVerseContent): boolean {
  return canonicalArabicForComparison(quranDisplayText(verse))
    === canonicalArabicForComparison(CANONICAL_BASMALAH_ARABIC);
}

function createBasmalahPreludeSegment(
  optionalPrelude: OptionalPreludeTiming | undefined,
  firstCanonicalSegment: CaptionSegment | undefined,
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
): CaptionSegment | null {
  const startMs = optionalPrelude?.startMs;
  const endMs = optionalPrelude?.endMs;
  const firstVerseKey = firstCanonicalSegment?.contentKind === "ayah" ? firstCanonicalSegment.verseKeys[0] : undefined;
  const firstVerse = firstVerseKey ? content[firstVerseKey] : undefined;
  if (!optionalPrelude?.available
    || optionalPrelude.selected !== "present"
    || typeof startMs !== "number"
    || typeof endMs !== "number"
    || !Number.isFinite(startMs)
    || !Number.isFinite(endMs)
    || startMs >= endMs
    || !firstCanonicalSegment
    || endMs > firstCanonicalSegment.startMs
    || !firstVerse
    || isCanonicalBasmalah(firstVerse)) return null;

  const wordCount = words(CANONICAL_BASMALAH_ARABIC).length;
  return {
    id: "basmalah-prelude#1",
    contentKind: "basmalah-prelude",
    verseKeys: [],
    startMs,
    endMs,
    arabic: CANONICAL_BASMALAH_ARABIC,
    translation: null,
    transliteration: null,
    wordStart: 0,
    wordEnd: wordCount,
    wordCount,
    showVerseNumberAtEnd: false,
    timingEvidence: {
      start: { timestampMs: startMs, source: "fastconformer" },
      end: { timestampMs: endMs, source: "fastconformer" },
      derived: false,
    },
  };
}

/** Builds the editor's single generated display array directly from the pure
 * resolver output. VerseAlignment-shaped values are diagnostics only. */
export function createCaptionSegmentsFromVerseBoundaries(
  boundaries: readonly VerseBoundary[],
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
  optionalPrelude?: OptionalPreludeTiming,
  fastConformerWords?: readonly {
    verseKey: string;
    canonicalWordIndex: number;
    canonicalArabic: string;
    startMs: number;
    endMs: number;
  }[],
): CaptionSegment[] {
  const ayahSegments = boundaries.flatMap((boundary) => {
    const verse = content[boundary.verseKey];
    const arabic = verse ? quranDisplayText(verse) : "";
    const canonicalWords = words(arabic);
    if (!canonicalWords.length) return [];
    const aligned = fastConformerWords?.filter((word) => word.verseKey === boundary.verseKey) ?? [];
    const ordered = aligned.slice().sort((left, right) => left.canonicalWordIndex - right.canonicalWordIndex);
    const hasExactFastConformerWords = ordered.length === canonicalWords.length
      && ordered.every((word, index) => word.canonicalWordIndex === index + 1
        && word.canonicalArabic === canonicalWords[index]
        && Number.isFinite(word.startMs)
        && Number.isFinite(word.endMs)
        && word.startMs <= word.endMs);
    const displayWords: CanonicalDisplayWord[] = hasExactFastConformerWords
      ? canonicalDisplayWords(ordered)
      : [];
    const plan = displayWords.length
      ? planAyahDisplaySplit(displayWords, DEFAULT_MAX_ARABIC_VISIBLE_CHARS)
      : null;
    // Missing/mismatched word alignment is intentionally safe: retain the
    // complete ayah rather than inventing a display-transition timestamp.
    const pieces = plan?.pieces.length ? plan.pieces : [{
      canonicalStartWordIndex: 1,
      canonicalEndWordIndex: canonicalWords.length,
      visibleCharCount: 0,
      endingWaqfType: "ordinary" as const,
    }];
    if (plan?.requiredSplit && process.env.NODE_ENV === "development") {
      console.debug("AYAH_DISPLAY_SPLIT", {
        verseKey: boundary.verseKey,
        totalVisibleChars: plan.totalVisibleChars,
        maxVisibleChars: plan.maxVisibleChars,
        requiredSplit: plan.requiredSplit,
        candidateCuts: plan.candidateCuts,
        selectedCuts: plan.selectedCuts,
        pieces: pieces.map((piece, index) => ({
          ...piece,
          startMs: index === 0 ? boundary.startMs : displayWords[piece.canonicalStartWordIndex - 1]!.alignmentStartMs,
          endMs: index === pieces.length - 1 ? boundary.endMs : displayWords[pieces[index + 1]!.canonicalStartWordIndex - 1]!.alignmentStartMs,
          showVerseNumberAtEnd: index === pieces.length - 1,
        })),
      });
    }
    return pieces.map((piece, index): CaptionSegment => {
      const isFinal = index === pieces.length - 1;
      const startMs = index === 0 ? boundary.startMs : displayWords[piece.canonicalStartWordIndex - 1]!.alignmentStartMs;
      const endMs = isFinal ? boundary.endMs : displayWords[pieces[index + 1]!.canonicalStartWordIndex - 1]!.alignmentStartMs;
      const wordStart = piece.canonicalStartWordIndex - 1;
      const wordEnd = piece.canonicalEndWordIndex;
      return {
        id: `${boundary.verseKey}#${index + 1}`,
        contentKind: "ayah",
        verseKeys: [boundary.verseKey],
        startMs,
        endMs,
        arabic: canonicalWords.slice(wordStart, wordEnd).join(" "),
        // Translation/transliteration remain whole-parent-ayah text until a
        // semantic word-range mapping is introduced in a later milestone.
        translation: verse?.translation ?? null,
        transliteration: verse?.transliteration ?? null,
        wordStart,
        wordEnd,
        wordCount: wordEnd - wordStart,
        showVerseNumberAtEnd: isFinal,
        timingEvidence: {
          start: { timestampMs: startMs, source: boundary.evidence.source },
          end: { timestampMs: endMs, source: boundary.evidence.source },
          derived: false,
        },
      };
    });
  });
  const prelude = createBasmalahPreludeSegment(optionalPrelude, ayahSegments[0], content);
  return prelude ? [prelude, ...ayahSegments] : ayahSegments;
}

export type GeneratedCaptionBoundaryTrace = {
  previousVerseKey: string;
  nextVerseKey: string;
  captionSegment: { previousEndMs: number | null; nextStartMs: number | null };
};

/** Produces boundaries from the actual editable/rendered CaptionSegment array. */
export function generatedCaptionBoundaryTrace(
  segments: readonly CaptionSegment[],
): GeneratedCaptionBoundaryTrace[] {
  return segments.slice(0, -1).map((previous, index) => {
    const next = segments[index + 1]!;
    return {
      previousVerseKey: previous.verseKeys.join(","),
      nextVerseKey: next.verseKeys.join(","),
      captionSegment: {
        previousEndMs: previous.endMs,
        nextStartMs: next.startMs,
      },
    };
  });
}

/** Development guard: retained diagnostic timing must be derived from, and
 * agree with, the CaptionSegment array that actually renders. */
export function assertDerivedTimingMatchesCaptions(
  segments: readonly CaptionSegment[],
  diagnostics: readonly { verseKey: string; startMs: number; endMs: number }[],
): void {
  if (process.env.NODE_ENV === "production") return;
  const byVerse = new Map(segments.flatMap((segment) => segment.verseKeys.map((verseKey) => [verseKey, segment] as const)));
  for (const timing of diagnostics) {
    const segment = byVerse.get(timing.verseKey);
    if (segment && (segment.startMs !== timing.startMs || segment.endMs !== timing.endMs)) {
      throw new Error(`NON-AUTHORITATIVE timing diverged from CaptionSegment for ${timing.verseKey}: ${timing.startMs}-${timing.endMs} vs ${segment.startMs}-${segment.endMs}.`);
    }
  }
}

export function splitCaptionSegment(segment: CaptionSegment, boundary: number): CaptionSegment[] {
  if (segment.contentKind !== "ayah") return [segment];
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
    showVerseNumberAtEnd: end === verseWords.length ? segment.showVerseNumberAtEnd : false,
    timingEvidence: {
      start: { timestampMs: startMs, source: start === 0 ? segment.timingEvidence.start.source : "derived" },
      end: { timestampMs: endMs, source: end === verseWords.length ? segment.timingEvidence.end.source : "derived" },
      derived: true,
    },
  });
  return [make(0, boundary, "a", segment.startMs, splitMs), make(boundary, verseWords.length, "b", splitMs, segment.endMs)];
}

function mergeSegments(left: CaptionSegment, right: CaptionSegment): CaptionSegment {
  if (left.contentKind !== "ayah" || right.contentKind !== "ayah") throw new Error("Only ayah caption segments can be merged.");
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
    showVerseNumberAtEnd: right.showVerseNumberAtEnd,
    timingEvidence: {
      start: left.timingEvidence.start,
      end: right.timingEvidence.end,
      derived: left.timingEvidence.derived || right.timingEvidence.derived,
    },
  };
}

export function mergeCaptionWithPrevious(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index <= 0 || index >= segments.length) return [...segments];
  if (segments[index - 1]?.contentKind !== "ayah" || segments[index]?.contentKind !== "ayah") return [...segments];
  return [...segments.slice(0, index - 1), mergeSegments(segments[index - 1], segments[index]), ...segments.slice(index + 1)];
}

export function mergeCaptionWithNext(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index < 0 || index >= segments.length - 1) return [...segments];
  if (segments[index]?.contentKind !== "ayah" || segments[index + 1]?.contentKind !== "ayah") return [...segments];
  return [...segments.slice(0, index), mergeSegments(segments[index], segments[index + 1]), ...segments.slice(index + 2)];
}

export function captionSegmentLabel(segment: Pick<CaptionSegment, "contentKind" | "verseKeys">): string {
  return segment.contentKind === "basmalah-prelude" ? "Basmalah" : segment.verseKeys[0] ?? "Ayah";
}

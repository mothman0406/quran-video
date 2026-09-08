import { CANONICAL_BASMALAH_ARABIC, quranDisplayText } from "../quran/content.ts";
import { canonicalDisplayWords, DEFAULT_MAX_ARABIC_VISIBLE_CHARS, planAyahDisplaySplit, visibleArabicCharacterCount, type CanonicalDisplayWord } from "./ayah-display-splitting.ts";
import type { QuranVerseContent } from "../quran/content.ts";
import type { VerseAlignment } from "./recognition.ts";
import type { VerseBoundary } from "../recognition/core.ts";
import type { z } from "zod";
import type { CaptionBackgroundSchema, CaptionPositioningSchema, CaptionStyleOverridesSchema, TransitionSettingsSchema, TypographySchema } from "../schemas/project.ts";
import type { ProjectFormat } from "../schemas/project.ts";
import { SAHEEH_PHRASE_BOUNDARIES } from "./translation-segmentation.ts";

export type Typography = z.infer<typeof TypographySchema>;
export type CaptionBackground = z.infer<typeof CaptionBackgroundSchema>;
export type CaptionPositioning = z.infer<typeof CaptionPositioningSchema>;
export type TransitionSettings = z.infer<typeof TransitionSettingsSchema>;
export type CaptionStyleOverrides = z.infer<typeof CaptionStyleOverridesSchema>;
export type CaptionPresentationSettings = { showVerseNumber: boolean };

export type WordHighlightPresentation = {
  color: string;
  glowColor: string;
  glowBlurPx: number;
  glowOpacity: number;
};

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

/**
 * Tanzil's canonical Uthmani text includes recitation and waqf annotations.
 * These code points are intentionally listed (rather than removing a broad
 * Unicode range): split planning still reads the original segment text for
 * waqf metadata, while caption presentation omits only these annotations.
 * Ordinary harakat and U+0670 superscript alef are preserved.
 */
const QURANIC_DISPLAY_ANNOTATIONS = /[\u06d6-\u06dc\u06df\u06e0\u06e2\u06e3\u06e5-\u06e8\u06ea-\u06ed]/gu;

/** Cleans only the text sent to preview, timeline, and export. */
export function cleanQuranArabicForDisplay(value: string): string {
  return value
    .replace(QURANIC_DISPLAY_ANNOTATIONS, "")
    .replace(/\s{2,}/gu, " ")
    .trim();
}

/** Shared preview/export display composition; canonical source text is never mutated. */
export function arabicCaptionDisplay(segment: Pick<CaptionSegment, "arabic" | "contentKind" | "verseKeys" | "showVerseNumberAtEnd">, showVerseNumber: boolean): ArabicCaptionDisplay {
  // Existing display snapshots can already have a terminal U+06DD. When the
  // toggle is on, replace that presentation marker with the one numbered
  // marker below. When off, ayah text retains its pre-toggle appearance.
  const sourceText = showVerseNumber || segment.contentKind === "basmalah-prelude"
    ? withoutTerminalAyahMarker(segment.arabic)
    : segment.arabic;
  const canonicalText = cleanQuranArabicForDisplay(sourceText);
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

function validWordTiming(timing: CaptionWordTiming, sourceWordCount: number): boolean {
  return Number.isInteger(timing.canonicalWordIndex)
    && timing.canonicalWordIndex > 0
    && Number.isInteger(timing.sourceWordStart)
    && Number.isInteger(timing.sourceWordEnd)
    && timing.sourceWordStart >= 0
    && timing.sourceWordStart < timing.sourceWordEnd
    && timing.sourceWordEnd <= sourceWordCount
    && Number.isFinite(timing.startMs)
    && Number.isFinite(timing.endMs)
    && timing.startMs < timing.endMs;
}

/** Pure, half-open canonical acoustic-word selection shared by preview/export. */
export function isCaptionWordHighlighted(
  segment: Pick<CaptionSegment, "startMs" | "endMs">,
  timing: CaptionWordTiming,
  timeMs: number,
  mode: WordHighlightMode,
): boolean {
  if (mode === "off" || !Number.isFinite(timeMs) || timeMs < segment.startMs || timeMs >= segment.endMs) return false;
  if (!Number.isFinite(timing.startMs) || !Number.isFinite(timing.endMs) || timing.startMs >= timing.endMs) return false;
  return mode === "current-word"
    ? timeMs >= timing.startMs && timeMs < timing.endMs
    : timeMs >= timing.startMs;
}

function colorWithOpacity(color: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0");
  if (/^#[0-9a-f]{6}$/iu.test(color)) return `${color}${alpha}`;
  if (/^#[0-9a-f]{3}$/iu.test(color)) return `#${color.slice(1).split("").map((value) => value + value).join("")}${alpha}`;
  return color;
}

/** One visual model used by both DOM preview and the canvas export renderer. */
export function resolveWordHighlightPresentation({
  baseTextColor,
  highlightColor,
  intensity,
  isHighlighted,
}: {
  baseTextColor: string;
  highlightColor: string;
  intensity: number;
  isHighlighted: boolean;
}): WordHighlightPresentation {
  if (!isHighlighted) return { color: baseTextColor, glowColor: "transparent", glowBlurPx: 0, glowOpacity: 0 };
  const strength = Math.max(0, Math.min(1, intensity));
  const glowOpacity = 0.18 + strength * 0.62;
  return {
    color: highlightColor,
    glowColor: colorWithOpacity(highlightColor, glowOpacity),
    glowBlurPx: 2 + strength * 9,
    glowOpacity,
  };
}

/**
 * Maps immutable Quran source words to display spans. The renderer never
 * writes markup into Quran strings: standalone waqf/annotation source tokens
 * remain presentation-only content attached to their canonical owner.
 */
export function arabicCaptionPresentationWords(
  segment: Pick<CaptionSegment, "arabic" | "contentKind" | "verseKeys" | "showVerseNumberAtEnd" | "startMs" | "endMs" | "wordTimings">,
  showVerseNumber: boolean,
  timeMs: number,
  mode: WordHighlightMode,
): ArabicPresentationWord[] {
  const sourceText = showVerseNumber || segment.contentKind === "basmalah-prelude"
    ? withoutTerminalAyahMarker(segment.arabic)
    : segment.arabic;
  const sourceWords = sourceText.trim().split(/\s+/u).filter(Boolean);
  const result: ArabicPresentationWord[] = [];
  const appendNormal = (start: number, end: number) => {
    for (const sourceWord of sourceWords.slice(start, end)) {
      const text = cleanQuranArabicForDisplay(sourceWord);
      if (text) result.push({ text, highlighted: false, kind: "quran-word" });
    }
  };
  let cursor = 0;
  for (const timing of [...(segment.wordTimings ?? [])].sort((left, right) => left.sourceWordStart - right.sourceWordStart || left.canonicalWordIndex - right.canonicalWordIndex)) {
    if (!validWordTiming(timing, sourceWords.length) || timing.sourceWordStart < cursor) continue;
    appendNormal(cursor, timing.sourceWordStart);
    const text = cleanQuranArabicForDisplay(sourceWords.slice(timing.sourceWordStart, timing.sourceWordEnd).join(" "));
    if (text) result.push({ text, highlighted: isCaptionWordHighlighted(segment, timing, timeMs, mode), kind: "quran-word" });
    cursor = timing.sourceWordEnd;
  }
  appendNormal(cursor, sourceWords.length);
  const verseNumber = inlineVerseNumber(segment, showVerseNumber);
  // The ornament has no acoustic timing of its own. It follows the final
  // canonical word only on the ayah piece that is allowed to display it.
  const finalTiming = [...(segment.wordTimings ?? [])]
    .filter((timing) => validWordTiming(timing, sourceWords.length))
    .sort((left, right) => left.canonicalWordIndex - right.canonicalWordIndex)
    .at(-1);
  if (verseNumber) result.push({ text: verseNumber, highlighted: finalTiming ? isCaptionWordHighlighted(segment, finalTiming, timeMs, mode) : false, kind: "verse-number" });
  return result;
}

/** Canonical Hafs display text for the acoustically selected opening prelude. */
export { CANONICAL_BASMALAH_ARABIC } from "../quran/content.ts";

const DEFAULT_VERTICAL_CAPTION_POSITIONING: CaptionPositioning = {
  anchor: "bottom",
  x: 0.5,
  y: 0.52,
  translationX: 0.5,
  translationY: 0.66,
  translationPositionLinked: true,
  maxWidthPercent: 0.9,
  translationMaxWidthPercent: 0.9,
  translationGapPx: 8,
};

export const DEFAULT_CAPTION_POSITIONING: CaptionPositioning = { ...DEFAULT_VERTICAL_CAPTION_POSITIONING };

export const DEFAULT_CAPTION_POSITIONING_BY_FORMAT: Record<ProjectFormat["preset"], CaptionPositioning> = {
  vertical: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING },
  landscape: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING, y: 0.5, translationY: 0.66 },
  square: { ...DEFAULT_VERTICAL_CAPTION_POSITIONING, y: 0.52, translationY: 0.66 },
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
  wordHighlightMode: "read-so-far",
  wordHighlightColor: "#B7FF00",
  wordHighlightIntensity: 0.85,
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

export type LinkedCaptionStackLayout = {
  /** Center of the measured stack in normalized canvas coordinates. */
  centerY: number;
  topY: number;
  bottomY: number;
};

/**
 * Places the default linked Arabic/translation stack inside the selected safe
 * region using its measured height. The stack's normal document flow keeps
 * translation below Arabic; this calculation only rebalances the complete
 * stack when a multi-line caption would otherwise leave the safe area.
 */
export function linkedCaptionStackLayout(
  format: ProjectFormat,
  anchorY: number,
  canvasHeight: number,
  stackHeight: number,
): LinkedCaptionStackLayout {
  const [minimumY, maximumY] = captionPositionBounds(format).y;
  if (!Number.isFinite(canvasHeight) || canvasHeight <= 0 || !Number.isFinite(stackHeight) || stackHeight < 0) {
    const centerY = clampNormalizedPosition(anchorY, minimumY, maximumY);
    return { centerY, topY: centerY, bottomY: centerY };
  }
  const safeTop = minimumY * canvasHeight;
  const safeBottom = maximumY * canvasHeight;
  const desiredTop = anchorY * canvasHeight - stackHeight / 2;
  // When a caption is taller than its safe area, preserving its reading order
  // takes precedence and its top remains reachable instead of overlapping.
  const top = Math.min(Math.max(desiredTop, safeTop), Math.max(safeTop, safeBottom - stackHeight));
  const bottom = top + stackHeight;
  return { centerY: (top + stackHeight / 2) / canvasHeight, topY: top / canvasHeight, bottomY: bottom / canvasHeight };
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
  return { ...DEFAULT_CAPTION_POSITIONING_BY_FORMAT[format.preset] };
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
  /** Immutable full parent-ayah source remains in `translation`. */
  translationSegment?: TranslationSegment;
  transliteration: string | null;
  wordStart: number;
  wordEnd: number;
  wordCount: number;
  /**
   * Canonical FastConformer words represented by this display piece. Source
   * offsets are half-open and local to `arabic`; they let display-only waqf
   * tokens stay attached without changing Quran text or acoustic ownership.
   */
  wordTimings?: CaptionWordTiming[];
  timingEvidence: {
    start: { timestampMs: number; source: CaptionTimingSource };
    end: { timestampMs: number; source: CaptionTimingSource };
    derived: boolean;
  };
};

export type TranslationSegment = {
  text: string;
  /** The derived fragment always owns exactly this Arabic display range. */
  wordStart: number;
  wordEnd: number;
  source: "full-ayah" | "saheeh-phrase-map" | "manual" | "fallback";
  reviewStatus: "precomputed" | "manual" | "needs-review";
};

export type CaptionWordTiming = {
  canonicalWordIndex: number;
  sourceWordStart: number;
  sourceWordEnd: number;
  startMs: number;
  endMs: number;
};

export type WordHighlightMode = Typography["wordHighlightMode"];

export type ArabicPresentationWord = {
  text: string;
  highlighted: boolean;
  /** The generated ayah ornament is deliberately never a Quran word. */
  kind: "quran-word" | "verse-number";
};

/** Quran content is either canonically owned by ayat or an acoustic prelude. */
export type CaptionSegment = CaptionSegmentBase & {
  contentKind: "ayah" | "basmalah-prelude";
  /** Empty only for Quran preludes, which deliberately have no ayah owner. */
  verseKeys: string[];
  /** False on an intermediate split piece; legacy segments default to true. */
  showVerseNumberAtEnd?: boolean;
  /** Presentation-only, property-level layer overrides. */
  styleOverrides?: CaptionStyleOverrides;
};

export type OptionalPreludeTiming = {
  available: boolean;
  selected: "present" | "absent";
  startMs: number | null;
  endMs: number | null;
};

export type CaptionTimingPatch = { startMs?: number; endMs?: number };

/** Single presentation accessor shared by editor preview and canvas export. */
export function translationDisplayText(segment: Pick<CaptionSegment, "translation" | "translationSegment">): string | null {
  return segment.translationSegment?.text ?? segment.translation;
}

function sameAyahOwner(left: CaptionSegment, right: CaptionSegment): boolean {
  return left.contentKind === "ayah"
    && right.contentKind === "ayah"
    && left.verseKeys.length === 1
    && left.verseKeys[0] === right.verseKeys[0];
}

function sourceRangeEndingAt(source: string, marker: string, after: number): number | null {
  const index = source.indexOf(marker, after);
  return index < 0 ? null : index + marker.length;
}

function automaticTranslationSegments(group: readonly CaptionSegment[]): CaptionSegment[] {
  const source = group[0]?.translation;
  if (!source || group.length === 1) {
    return group.map((segment) => ({
      ...segment,
      ...(source ? { translationSegment: { text: source, wordStart: segment.wordStart, wordEnd: segment.wordEnd, source: "full-ayah" as const, reviewStatus: "precomputed" as const } } : {}),
    }));
  }
  const verseKey = group[0]?.verseKeys[0];
  const boundaries = verseKey ? SAHEEH_PHRASE_BOUNDARIES[verseKey] : undefined;
  let sourceCursor = 0;
  const fragments = boundaries ? group.map((segment) => {
    const boundary = boundaries.find((candidate) => candidate.wordEnd === segment.wordEnd);
    const sourceEnd = boundary ? sourceRangeEndingAt(source, boundary.endsWith, sourceCursor) : null;
    if (sourceEnd === null) return null;
    const text = source.slice(sourceCursor, sourceEnd).trim();
    sourceCursor = sourceEnd;
    return text || null;
  }) : [];
  const complete = fragments.length === group.length && fragments.every(Boolean) && source.slice(sourceCursor).trim() === "";
  if (complete) return group.map((segment, index) => ({
    ...segment,
    translationSegment: { text: fragments[index]!, wordStart: segment.wordStart, wordEnd: segment.wordEnd, source: "saheeh-phrase-map", reviewStatus: "precomputed" },
  }));
  // A failed source-version check is deliberately safe: use the original full
  // source, disclose uncertainty, and never guess from characters or timing.
  return group.map((segment) => ({
    ...segment,
    translationSegment: { text: source, wordStart: segment.wordStart, wordEnd: segment.wordEnd, source: "fallback", reviewStatus: "needs-review" },
  }));
}

/** Recomputes presentation fragments from contiguous Arabic ownership only. */
export function resolveCaptionTranslationSegments(segments: readonly CaptionSegment[]): CaptionSegment[] {
  const result: CaptionSegment[] = [];
  for (let start = 0; start < segments.length;) {
    let end = start + 1;
    while (end < segments.length && sameAyahOwner(segments[start]!, segments[end]!)) end += 1;
    const group = segments.slice(start, end);
    const automatic = automaticTranslationSegments(group);
    result.push(...automatic.map((segment) => {
      const existing = group.find((candidate) => candidate.id === segment.id)?.translationSegment;
      return existing?.source === "manual"
        && existing.wordStart === segment.wordStart
        && existing.wordEnd === segment.wordEnd
        ? { ...segment, translationSegment: existing }
        : segment;
    }));
    start = end;
  }
  return result;
}

export function updateCaptionTranslationSegment(segments: readonly CaptionSegment[], id: string, text: string): CaptionSegment[] {
  return segments.map((segment) => segment.id === id ? {
    ...segment,
    translationSegment: { text: text.trim(), wordStart: segment.wordStart, wordEnd: segment.wordEnd, source: "manual", reviewStatus: "manual" },
  } : segment);
}

export function resetCaptionTranslationSegment(segments: readonly CaptionSegment[], id: string): CaptionSegment[] {
  return resolveCaptionTranslationSegments(segments.map((segment) => segment.id === id
    ? { ...segment, translationSegment: undefined }
    : segment));
}

/** The smallest valid display interval for a manually resized caption. */
export const MINIMUM_CAPTION_DURATION_MS = 100;

/**
 * Moves one TEXT-track edge. Contiguous ayah segments share an edge so their
 * display intervals stay gap-free and non-overlapping; a basmalah prelude
 * deliberately remains independently timed.
 */
export function resizeCaptionBoundary(
  segments: readonly CaptionSegment[],
  id: string,
  edge: "start" | "end",
  boundaryMs: number,
  durationMs: number,
): CaptionSegment[] {
  const index = segments.findIndex((segment) => segment.id === id);
  if (index < 0) return [...segments];
  const current = segments[index]!;
  const maximumTime = Math.max(1, Number.isFinite(durationMs) ? Math.round(durationMs) : 1);
  const requested = Number.isFinite(boundaryMs) ? Math.round(boundaryMs) : edge === "start" ? current.startMs : current.endMs;
  const previous = segments[index - 1];
  const next = segments[index + 1];
  const sharedPrevious = edge === "start" && current.contentKind === "ayah" && previous?.contentKind === "ayah" && previous.endMs === current.startMs;
  const sharedNext = edge === "end" && current.contentKind === "ayah" && next?.contentKind === "ayah" && next.startMs === current.endMs;
  const minimum = MINIMUM_CAPTION_DURATION_MS;
  const lower = edge === "start"
    ? sharedPrevious ? previous.startMs + minimum : 0
    : current.startMs + minimum;
  const upper = edge === "start"
    ? current.endMs - minimum
    : sharedNext ? next.endMs - minimum : maximumTime;
  const boundary = Math.max(lower, Math.min(upper, requested));

  return segments.map((segment, segmentIndex) => {
    if (segmentIndex === index) return edge === "start" ? { ...segment, startMs: boundary } : { ...segment, endMs: boundary };
    if (sharedPrevious && segmentIndex === index - 1) return { ...segment, endMs: boundary };
    if (sharedNext && segmentIndex === index + 1) return { ...segment, startMs: boundary };
    return segment;
  });
}

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

type FastConformerDisplayWord = {
  verseKey: string;
  canonicalWordIndex: number;
  canonicalArabic: string;
  startMs: number;
  endMs: number;
};

/**
 * FastConformer deliberately has no acoustic target for standalone Quranic
 * annotations such as Tanzil's spaced waqf marks. They still belong in the
 * displayed corpus text. Fold only those zero-visible tokens into the prior
 * aligned word, retaining their original source-token range for slicing.
 */
function displayWordsFromFastConformer(
  sourceWords: readonly string[],
  alignedWords: readonly FastConformerDisplayWord[],
): CanonicalDisplayWord[] | null {
  const displayInput: Array<FastConformerDisplayWord & { sourceWordStart: number; sourceWordEnd: number }> = [];
  let sourceIndex = 0;
  const appendStandaloneAnnotation = () => {
    const previous = displayInput.at(-1);
    const annotation = sourceWords[sourceIndex];
    if (!previous || !annotation || visibleArabicCharacterCount(annotation) !== 0) return false;
    previous.canonicalArabic = `${previous.canonicalArabic} ${annotation}`;
    previous.sourceWordEnd = sourceIndex + 1;
    sourceIndex += 1;
    return true;
  };

  for (const word of alignedWords) {
    while (sourceWords[sourceIndex] !== word.canonicalArabic) {
      if (!appendStandaloneAnnotation()) return null;
    }
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs > word.endMs) return null;
    displayInput.push({ ...word, sourceWordStart: sourceIndex, sourceWordEnd: sourceIndex + 1 });
    sourceIndex += 1;
  }
  while (sourceIndex < sourceWords.length) {
    if (!appendStandaloneAnnotation()) return null;
  }
  return canonicalDisplayWords(displayInput);
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
  return resolveCaptionTranslationSegments(continuousDisplayTiming(generated));
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
  fastConformerWords?: readonly FastConformerDisplayWord[],
): CaptionSegment[] {
  const ayahSegments = boundaries.flatMap((boundary) => {
    const verse = content[boundary.verseKey];
    const arabic = verse ? quranDisplayText(verse) : "";
    const canonicalWords = words(arabic);
    if (!canonicalWords.length) return [];
    const aligned = fastConformerWords?.filter((word) => word.verseKey === boundary.verseKey) ?? [];
    const ordered = aligned.slice().sort((left, right) => left.canonicalWordIndex - right.canonicalWordIndex);
    const hasOrderedFastConformerWords = ordered.every((word, index) => word.canonicalWordIndex === index + 1);
    const displayWords = (hasOrderedFastConformerWords
      ? displayWordsFromFastConformer(canonicalWords, ordered)
      : null) ?? [];
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
        canonicalWordCount: canonicalWords.length,
        rawCanonicalArabic: arabic,
        totalVisibleChars: plan.totalVisibleChars,
        maxVisibleChars: plan.maxVisibleChars,
        requiredSplit: plan.requiredSplit,
        candidateCuts: plan.candidateCuts,
        selectedCuts: plan.selectedCuts,
        pieces: pieces.map((piece, index) => ({
          ...piece,
          sourceWordStart: displayWords[piece.canonicalStartWordIndex - 1]!.sourceWordStart,
          sourceWordEnd: displayWords[piece.canonicalEndWordIndex - 1]!.sourceWordEnd,
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
      const sourceStart = displayWords?.[wordStart]?.sourceWordStart ?? wordStart;
      const sourceEnd = displayWords?.[piece.canonicalEndWordIndex - 1]?.sourceWordEnd ?? piece.canonicalEndWordIndex;
      const wordTimings = displayWords.slice(piece.canonicalStartWordIndex - 1, piece.canonicalEndWordIndex).map((word) => ({
        canonicalWordIndex: word.wordIndex,
        sourceWordStart: (word.sourceWordStart ?? 0) - sourceStart,
        sourceWordEnd: (word.sourceWordEnd ?? 0) - sourceStart,
        startMs: word.alignmentStartMs,
        endMs: word.alignmentEndMs,
      }));
      return {
        id: `${boundary.verseKey}#${index + 1}`,
        contentKind: "ayah",
        verseKeys: [boundary.verseKey],
        startMs,
        endMs,
        arabic: canonicalWords.slice(sourceStart, sourceEnd).join(" "),
        // Translation/transliteration remain whole-parent-ayah text until a
        // semantic word-range mapping is introduced in a later milestone.
        translation: verse?.translation ?? null,
        transliteration: verse?.transliteration ?? null,
        wordStart: sourceStart,
        wordEnd: sourceEnd,
        wordCount: sourceEnd - sourceStart,
        ...(wordTimings.length ? { wordTimings } : {}),
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
  return resolveCaptionTranslationSegments(prelude ? [prelude, ...ayahSegments] : ayahSegments);
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
    ...(segment.wordTimings ? {
      wordTimings: segment.wordTimings.flatMap((timing) => timing.sourceWordStart >= start && timing.sourceWordEnd <= end
        ? [{ ...timing, sourceWordStart: timing.sourceWordStart - start, sourceWordEnd: timing.sourceWordEnd - start }]
        : []),
    } : {}),
    showVerseNumberAtEnd: end === verseWords.length ? segment.showVerseNumberAtEnd : false,
    timingEvidence: {
      start: { timestampMs: startMs, source: start === 0 ? segment.timingEvidence.start.source : "derived" },
      end: { timestampMs: endMs, source: end === verseWords.length ? segment.timingEvidence.end.source : "derived" },
      derived: true,
    },
  });
  return resolveCaptionTranslationSegments([make(0, boundary, "a", segment.startMs, splitMs), make(boundary, verseWords.length, "b", splitMs, segment.endMs)]);
}

function mergeSegments(left: CaptionSegment, right: CaptionSegment): CaptionSegment {
  if (left.contentKind !== "ayah" || right.contentKind !== "ayah") throw new Error("Only ayah caption segments can be merged.");
  return resolveCaptionTranslationSegments([{
    ...left,
    id: `${left.id}+${right.id}`,
    verseKeys: unique([...left.verseKeys, ...right.verseKeys]),
    endMs: right.endMs,
    arabic: `${left.arabic} ${right.arabic}`.trim(),
    translation: left.translation ?? right.translation,
    transliteration: null,
    wordEnd: right.wordEnd,
    wordCount: left.wordCount + right.wordCount,
    ...(left.wordTimings || right.wordTimings ? {
      wordTimings: [
        ...(left.wordTimings ?? []).map((timing) => ({ ...timing })),
        ...(right.wordTimings ?? []).map((timing) => ({
          ...timing,
          sourceWordStart: timing.sourceWordStart + words(left.arabic).length,
          sourceWordEnd: timing.sourceWordEnd + words(left.arabic).length,
        })),
      ],
    } : {}),
    showVerseNumberAtEnd: right.showVerseNumberAtEnd,
    timingEvidence: {
      start: left.timingEvidence.start,
      end: right.timingEvidence.end,
      derived: left.timingEvidence.derived || right.timingEvidence.derived,
    },
  }])[0]!;
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

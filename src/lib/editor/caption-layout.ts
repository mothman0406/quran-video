import { linkedCaptionStackLayout, type ArabicPresentationWord, type CaptionPositioning, type Typography } from "./captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";

/** Presentation values are authored against this width in logical CSS pixels. */
export const CAPTION_LOGICAL_WIDTH = 360;
export const TRANSLATION_LINE_HEIGHT_RATIO = 1.25;
export const TRANSLITERATION_GAP_PX = 8;

export type CaptionMeasureContext = Pick<CanvasRenderingContext2D, "font" | "measureText">;

export type CaptionTextLine = {
  text: string;
  width: number;
};

export type ArabicCaptionLine = {
  words: readonly ArabicPresentationWord[];
  width: number;
};

export type CaptionTypographyMetrics = {
  scale: number;
  maxWidth: number;
  translationMaxWidth: number;
  arabicFontSize: number;
  arabicLineHeight: number;
  translationFontSize: number;
  translationLineHeight: number;
  transliterationFontSize: number;
  transliterationLineHeight: number;
  translationGap: number;
  transliterationGap: number;
};

export function captionScaleForWidth(width: number): number {
  return width / CAPTION_LOGICAL_WIDTH;
}

export function captionLogicalFormat(format: ProjectFormat): ProjectFormat {
  return {
    ...format,
    width: CAPTION_LOGICAL_WIDTH,
    height: CAPTION_LOGICAL_WIDTH * format.height / format.width,
  };
}

export function captionTypographyMetrics(
  format: Pick<ProjectFormat, "width">,
  typography: Typography,
  positioning: CaptionPositioning,
): CaptionTypographyMetrics {
  const scale = captionScaleForWidth(format.width);
  const arabicFontSize = typography.arabicFontSize * scale;
  const translationFontSize = typography.translationFontSize * scale;
  const transliterationFontSize = typography.transliterationFontSize * scale;
  return {
    scale,
    maxWidth: format.width * positioning.maxWidthPercent,
    translationMaxWidth: format.width * (positioning.translationMaxWidthPercent ?? positioning.maxWidthPercent),
    arabicFontSize,
    arabicLineHeight: arabicFontSize * typography.arabicLineSpacing,
    translationFontSize,
    translationLineHeight: translationFontSize * TRANSLATION_LINE_HEIGHT_RATIO,
    transliterationFontSize,
    transliterationLineHeight: transliterationFontSize * TRANSLATION_LINE_HEIGHT_RATIO,
    translationGap: typography.translationSpacingBelowArabic * scale,
    transliterationGap: TRANSLITERATION_GAP_PX * scale,
  };
}

export function wrapCaptionText(
  value: string,
  maxWidth: number,
  measureText: (text: string) => number,
): CaptionTextLine[] {
  const words = value.trim().split(/[ \t\r\n]+/u).filter(Boolean);
  const lines: CaptionTextLine[] = [];
  let text = "";
  let width = 0;
  for (const word of words) {
    const next = text ? `${text} ${word}` : word;
    const nextWidth = measureText(next);
    if (text && nextWidth > maxWidth) {
      lines.push({ text, width });
      text = word;
      width = measureText(word);
    } else {
      text = next;
      width = nextWidth;
    }
  }
  if (text) lines.push({ text, width });
  return lines;
}

export function wrapArabicCaptionWords(
  words: readonly ArabicPresentationWord[],
  maxWidth: number,
  measureText: (text: string) => number,
): ArabicCaptionLine[] {
  const lines: ArabicCaptionLine[] = [];
  let line: ArabicPresentationWord[] = [];
  let width = 0;
  for (const word of words) {
    const gap = line.length ? measureText(word.kind === "verse-number" ? "\u00a0" : " ") : 0;
    const wordWidth = measureText(word.text);
    const nextWidth = width + gap + wordWidth;
    if (line.length && nextWidth > maxWidth) {
      lines.push({ words: line, width });
      line = [word];
      width = wordWidth;
    } else {
      line.push(word);
      width = nextWidth;
    }
  }
  if (line.length) lines.push({ words: line, width });
  return lines;
}

export type CaptionMeasuredLayout = {
  metrics: CaptionTypographyMetrics;
  arabicLines: ArabicCaptionLine[];
  translationLines: CaptionTextLine[];
  transliterationLines: CaptionTextLine[];
  arabicHeight: number;
  translationHeight: number;
  transliterationHeight: number;
  totalHeight: number;
  top: number;
  bottom: number;
};

export function measureCaptionLayout(options: {
  context: CaptionMeasureContext;
  format: ProjectFormat;
  typography: Typography;
  positioning: CaptionPositioning;
  arabicFontFamily: string;
  arabicWords: readonly ArabicPresentationWord[];
  translation: string | null;
  translationTypography: Typography;
  translationPositioning: CaptionPositioning;
  transliteration: string | null;
}): CaptionMeasuredLayout {
  const {
    context,
    format,
    typography,
    positioning,
    arabicFontFamily,
    arabicWords,
    translation,
    translationTypography,
    translationPositioning,
    transliteration,
  } = options;
  const metrics = captionTypographyMetrics(format, typography, positioning);
  const translationMetrics = captionTypographyMetrics(format, translationTypography, translationPositioning);
  context.font = `${metrics.arabicFontSize}px "${arabicFontFamily}", serif`;
  const arabicLines = wrapArabicCaptionWords(arabicWords, metrics.maxWidth, (text) => context.measureText(text).width);
  context.font = `${translationTypography.translationItalic ? "italic " : ""}${translationTypography.translationFontWeight} ${translationMetrics.translationFontSize}px ${translationTypography.translationFontFamily}`;
  const translationWidth = positioning.translationPositionLinked ? metrics.maxWidth : translationMetrics.translationMaxWidth;
  const translationLines = translation ? wrapCaptionText(translation, translationWidth, (text) => context.measureText(text).width) : [];
  context.font = `${metrics.transliterationFontSize}px ${typography.transliterationFontFamily}`;
  const transliterationLines = transliteration ? wrapCaptionText(transliteration, metrics.maxWidth, (text) => context.measureText(text).width) : [];
  const arabicHeight = arabicLines.length * metrics.arabicLineHeight;
  const translationHeight = translationLines.length * translationMetrics.translationLineHeight;
  const transliterationHeight = transliterationLines.length * metrics.transliterationLineHeight;
  const totalHeight = arabicHeight
    + (translationLines.length ? metrics.translationGap + translationHeight : 0)
    + (transliterationLines.length ? metrics.transliterationGap + transliterationHeight : 0);
  const stack = linkedCaptionStackLayout(format, positioning.y, format.height, totalHeight);
  const top = positioning.translationPositionLinked ? stack.topY * format.height : positioning.y * format.height - totalHeight / 2;
  return {
    metrics: {
      ...metrics,
      translationMaxWidth: translationMetrics.translationMaxWidth,
      translationFontSize: translationMetrics.translationFontSize,
      translationLineHeight: translationMetrics.translationLineHeight,
    },
    arabicLines,
    translationLines,
    transliterationLines,
    arabicHeight,
    translationHeight,
    transliterationHeight,
    totalHeight,
    top,
    bottom: top + totalHeight,
  };
}

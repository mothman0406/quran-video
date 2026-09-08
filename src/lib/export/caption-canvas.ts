import { arabicCaptionPresentationWords, composeArabicCaptionText, captionVisualStatesAtTime, linkedCaptionStackLayout, type ArabicPresentationWord } from "../editor/captions.ts";
import type { LocalExportRequest } from "./types.ts";
import { captionStyleFromState, resolveCaptionLayerStyle } from "../editor/styles.ts";

function alphaColor(color: string, opacity: number) { return color.startsWith("#") ? `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0")}` : color; }
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.roundRect(x, y, width, height, r); context.fill(); }
function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] { const words = value.trim().split(/[ \t\r\n]+/u); const lines: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines; }
function drawText(context: CanvasRenderingContext2D, lines: readonly string[], x: number, y: number, lineHeight: number, align: CanvasTextAlign, direction: CanvasDirection, fill: string, outline: boolean, outlineWidth: number, outlineColor: string, shadow: boolean, shadowBlur: number, shadowStrength: number) { context.save(); context.textAlign = align; context.direction = direction; context.fillStyle = fill; context.strokeStyle = outlineColor; context.lineWidth = outlineWidth; context.shadowColor = shadow ? `rgba(0,0,0,${shadowStrength})` : "transparent"; context.shadowBlur = shadow ? shadowBlur : 0; context.shadowOffsetY = shadow ? 2 : 0; lines.forEach((line, index) => { const baseline = y + index * lineHeight; if (outline) context.strokeText(line, x, baseline); context.fillText(line, x, baseline); }); context.restore(); }
type ArabicWordLine = { words: readonly ArabicPresentationWord[]; width: number };
function wrapArabicWords(context: CanvasRenderingContext2D, words: readonly ArabicPresentationWord[], maxWidth: number): ArabicWordLine[] {
  const lines: ArabicWordLine[] = [];
  let line: ArabicPresentationWord[] = [];
  let width = 0;
  for (const word of words) {
    const gap = line.length ? context.measureText(word.kind === "verse-number" ? "\u00a0" : " ").width : 0;
    const nextWidth = width + gap + context.measureText(word.text).width;
    if (line.length && nextWidth > maxWidth) { lines.push({ words: line, width }); line = [word]; width = context.measureText(word.text).width; }
    else { line.push(word); width = nextWidth; }
  }
  if (line.length) lines.push({ words: line, width });
  return lines;
}
function drawArabicWords(context: CanvasRenderingContext2D, lines: readonly ArabicWordLine[], x: number, y: number, lineHeight: number, fill: string, highlightFill: string, outline: boolean, outlineWidth: number, outlineColor: string, shadow: boolean, shadowBlur: number, shadowStrength: number) {
  context.save(); context.textAlign = "right"; context.direction = "rtl"; context.strokeStyle = outlineColor; context.lineWidth = outlineWidth; context.shadowColor = shadow ? `rgba(0,0,0,${shadowStrength})` : "transparent"; context.shadowBlur = shadow ? shadowBlur : 0; context.shadowOffsetY = shadow ? 2 : 0;
  lines.forEach((line, lineIndex) => {
    let cursor = x + line.width / 2;
    for (const [index, word] of line.words.entries()) {
      if (index > 0) cursor -= context.measureText(word.kind === "verse-number" ? "\u00a0" : " ").width;
      context.fillStyle = word.highlighted ? highlightFill : fill;
      if (outline) context.strokeText(word.text, cursor, y + lineIndex * lineHeight);
      context.fillText(word.text, cursor, y + lineIndex * lineHeight);
      cursor -= context.measureText(word.text).width;
    }
  });
  context.restore();
}

/** Shared preview/export caption painter. Transition state always comes from captionVisualStatesAtTime. */
export function drawExportCaptions(context: CanvasRenderingContext2D, request: LocalExportRequest, timeMs: number, arabicFont: string) {
  const { typography, positioning, captionBackground, showVerseNumber } = request; const globalStyle = captionStyleFromState(typography, positioning, captionBackground, request.transitionSettings); const scale = request.format.width / 360;
  for (const state of captionVisualStatesAtTime(request.segments, timeMs, request.transitionSettings)) {
    const { segment, opacity, blurPx } = state; const arabicStyle = resolveCaptionLayerStyle(globalStyle, segment.styleOverrides, "arabic"); const translationStyle = resolveCaptionLayerStyle(globalStyle, segment.styleOverrides, "translation"); const resolvedTypography = arabicStyle.typography; const resolvedPositioning = arabicStyle.positioning; const resolvedBackground = arabicStyle.captionBackground; const translationTypography = translationStyle.typography; const translationPositioning = translationStyle.positioning; const maxWidth = request.format.width * resolvedPositioning.maxWidthPercent; const arabicSize = resolvedTypography.arabicFontSize * scale; const translationSize = translationTypography.translationFontSize * scale; const transliterationSize = resolvedTypography.transliterationFontSize * scale;
    context.save(); context.filter = blurPx ? `blur(${blurPx * scale}px)` : "none"; context.globalAlpha = opacity;
    const arabicDisplayText = composeArabicCaptionText(segment, showVerseNumber);
    const arabicWords = arabicCaptionPresentationWords(segment, showVerseNumber, timeMs, resolvedTypography.wordHighlightMode);
    const useWordRenderer = resolvedTypography.wordHighlightMode !== "off" && arabicWords.length > 0;
    context.font = `${arabicSize}px "${arabicFont}", serif`; const arabicWordLines = useWordRenderer ? wrapArabicWords(context, arabicWords, maxWidth) : null; const arabicLines = useWordRenderer ? null : wrap(context, arabicDisplayText, maxWidth); const arabicHeight = (arabicWordLines?.length ?? arabicLines?.length ?? 0) * arabicSize * resolvedTypography.arabicLineSpacing;
    const translation = translationTypography.translationVisible ? segment.translation : null; const transliteration = resolvedTypography.transliterationVisible ? segment.transliteration : null;
    const translationMaxWidth = request.format.width * (translationPositioning.translationMaxWidthPercent ?? translationPositioning.maxWidthPercent);
    context.font = `${translationSize}px ${translationTypography.translationFontFamily}`; const translationLines = translation ? wrap(context, translation, resolvedPositioning.translationPositionLinked ? maxWidth : translationMaxWidth) : []; const translationHeight = translationLines.length * translationSize * 1.25;
    context.font = `${transliterationSize}px ${resolvedTypography.transliterationFontFamily}`; const transliterationLines = transliteration ? wrap(context, transliteration, maxWidth) : []; const transliterationHeight = transliterationLines.length * transliterationSize * 1.25;
    const totalHeight = arabicHeight + (translationLines.length ? resolvedTypography.translationSpacingBelowArabic * scale + translationHeight : 0) + (transliterationLines.length ? 8 * scale + transliterationHeight : 0);
    const linkedBackgroundPadding = resolvedBackground.enabled && resolvedPositioning.translationPositionLinked ? resolvedBackground.verticalPadding * scale : 0;
    const linkedLayout = linkedCaptionStackLayout(request.format, resolvedPositioning.y, request.format.height, totalHeight + linkedBackgroundPadding * 2);
    const x = resolvedPositioning.x * request.format.width;
    const y = resolvedPositioning.translationPositionLinked
      ? linkedLayout.topY * request.format.height + linkedBackgroundPadding
      : resolvedPositioning.y * request.format.height - totalHeight / 2;
    if (resolvedBackground.enabled && resolvedPositioning.translationPositionLinked) { context.fillStyle = alphaColor(resolvedBackground.color, resolvedBackground.opacity); roundedRect(context, x - maxWidth / 2 - resolvedBackground.horizontalPadding * scale, linkedLayout.topY * request.format.height, maxWidth + resolvedBackground.horizontalPadding * scale * 2, totalHeight + linkedBackgroundPadding * 2, resolvedBackground.cornerRadius * scale); }
    let cursor = y;
    context.font = `${arabicSize}px "${arabicFont}", serif`; if (arabicWordLines) drawArabicWords(context, arabicWordLines, x, cursor + arabicSize, arabicSize * resolvedTypography.arabicLineSpacing, alphaColor(resolvedTypography.textColor, resolvedTypography.arabicOpacity), alphaColor(resolvedTypography.wordHighlightColor, resolvedTypography.arabicOpacity), resolvedTypography.arabicOutlineEnabled, resolvedTypography.arabicOutlineWidth * scale, resolvedTypography.arabicOutlineColor, resolvedTypography.arabicShadowEnabled, resolvedTypography.arabicShadowBlur * scale, resolvedTypography.arabicShadowStrength); else drawText(context, arabicLines ?? [], x, cursor + arabicSize, arabicSize * resolvedTypography.arabicLineSpacing, resolvedTypography.textAlign, "rtl", alphaColor(resolvedTypography.textColor, resolvedTypography.arabicOpacity), resolvedTypography.arabicOutlineEnabled, resolvedTypography.arabicOutlineWidth * scale, resolvedTypography.arabicOutlineColor, resolvedTypography.arabicShadowEnabled, resolvedTypography.arabicShadowBlur * scale, resolvedTypography.arabicShadowStrength); cursor += arabicHeight;
    if (translationLines.length && resolvedPositioning.translationPositionLinked) { cursor += resolvedTypography.translationSpacingBelowArabic * scale; context.font = `${translationSize}px ${translationTypography.translationFontFamily}`; drawText(context, translationLines, x, cursor + translationSize, translationSize * 1.25, translationTypography.translationTextAlign, "ltr", alphaColor(translationTypography.translationTextColor, translationTypography.translationOpacity), translationTypography.translationOutlineEnabled, translationTypography.translationOutlineWidth * scale, translationTypography.translationOutlineColor, translationTypography.translationShadowEnabled, translationTypography.translationShadowBlur * scale, translationTypography.translationShadowStrength); cursor += translationHeight; }
    if (transliterationLines.length) { cursor += 8 * scale; context.font = `${transliterationSize}px ${resolvedTypography.transliterationFontFamily}`; drawText(context, transliterationLines, x, cursor + transliterationSize, transliterationSize * 1.25, "center", "ltr", alphaColor(resolvedTypography.translationTextColor, resolvedTypography.translationOpacity), false, 0, "transparent", false, 0, 0); }
    if (translationLines.length && !resolvedPositioning.translationPositionLinked) { const tx = translationPositioning.translationX * request.format.width; const ty = translationPositioning.translationY * request.format.height; context.font = `${translationSize}px ${translationTypography.translationFontFamily}`; const h = translationHeight; if (translationStyle.captionBackground.enabled) { context.fillStyle = alphaColor(translationStyle.captionBackground.color, translationStyle.captionBackground.opacity); roundedRect(context, tx - translationMaxWidth / 2 - translationStyle.captionBackground.horizontalPadding * scale, ty - h / 2 - translationStyle.captionBackground.verticalPadding * scale, translationMaxWidth + translationStyle.captionBackground.horizontalPadding * scale * 2, h + translationStyle.captionBackground.verticalPadding * scale * 2, translationStyle.captionBackground.cornerRadius * scale); } drawText(context, translationLines, tx, ty - h / 2 + translationSize, translationSize * 1.25, translationTypography.translationTextAlign, "ltr", alphaColor(translationTypography.translationTextColor, translationTypography.translationOpacity), translationTypography.translationOutlineEnabled, translationTypography.translationOutlineWidth * scale, translationTypography.translationOutlineColor, translationTypography.translationShadowEnabled, translationTypography.translationShadowBlur * scale, translationTypography.translationShadowStrength); }
    context.restore();
  }
  if (request.watermarkRequired) {
    context.save();
    context.font = `${Math.max(12, request.format.width * 0.018)}px Arial, sans-serif`;
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillStyle = "rgba(255,255,255,0.72)";
    context.shadowColor = "rgba(0,0,0,0.35)";
    context.shadowBlur = 3;
    context.fillText("Quran Video", request.format.width - request.format.width * 0.035, request.format.height - request.format.height * 0.025);
    context.restore();
  }
}

import { captionVerseNumberLabel, captionVisualStatesAtTime } from "../editor/captions.ts";
import type { LocalExportRequest } from "./types.ts";

function alphaColor(color: string, opacity: number) { return color.startsWith("#") ? `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0")}` : color; }
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.roundRect(x, y, width, height, r); context.fill(); }
function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] { const words = value.trim().split(/\s+/u); const lines: string[] = []; let line = ""; for (const word of words) { const next = line ? `${line} ${word}` : word; if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next; } if (line) lines.push(line); return lines; }
function drawText(context: CanvasRenderingContext2D, lines: readonly string[], x: number, y: number, lineHeight: number, align: CanvasTextAlign, direction: CanvasDirection, fill: string, outline: boolean, outlineWidth: number, outlineColor: string, shadow: boolean, shadowBlur: number, shadowStrength: number) { context.save(); context.textAlign = align; context.direction = direction; context.fillStyle = fill; context.strokeStyle = outlineColor; context.lineWidth = outlineWidth; context.shadowColor = shadow ? `rgba(0,0,0,${shadowStrength})` : "transparent"; context.shadowBlur = shadow ? shadowBlur : 0; context.shadowOffsetY = shadow ? 2 : 0; lines.forEach((line, index) => { const baseline = y + index * lineHeight; if (outline) context.strokeText(line, x, baseline); context.fillText(line, x, baseline); }); context.restore(); }

/** Shared preview/export caption painter. Transition state always comes from captionVisualStatesAtTime. */
export function drawExportCaptions(context: CanvasRenderingContext2D, request: LocalExportRequest, timeMs: number, arabicFont: string) {
  const { typography, positioning, captionBackground, showVerseNumber } = request; const scale = request.format.width / 360; const maxWidth = request.format.width * positioning.maxWidthPercent;
  for (const state of captionVisualStatesAtTime(request.segments, timeMs, request.transitionSettings)) {
    const { segment, opacity, blurPx } = state; const arabicSize = typography.arabicFontSize * scale; const translationSize = typography.translationFontSize * scale; const transliterationSize = typography.transliterationFontSize * scale;
    context.save(); context.filter = blurPx ? `blur(${blurPx * scale}px)` : "none"; context.globalAlpha = opacity;
    context.font = `${arabicSize}px "${arabicFont}", serif`; const arabicLines = wrap(context, segment.arabic, maxWidth); const arabicHeight = arabicLines.length * arabicSize * typography.arabicLineSpacing;
    const translation = typography.translationVisible ? segment.translation : null; const transliteration = typography.transliterationVisible ? segment.transliteration : null;
    const translationMaxWidth = request.format.width * (positioning.translationMaxWidthPercent ?? positioning.maxWidthPercent);
    context.font = `${translationSize}px ${typography.translationFontFamily}`; const translationLines = translation ? wrap(context, translation, positioning.translationPositionLinked ? maxWidth : translationMaxWidth) : []; const translationHeight = translationLines.length * translationSize * 1.25;
    context.font = `${transliterationSize}px ${typography.transliterationFontFamily}`; const transliterationLines = transliteration ? wrap(context, transliteration, maxWidth) : []; const transliterationHeight = transliterationLines.length * transliterationSize * 1.25;
    const showAyahNumber = showVerseNumber && segment.contentKind === "ayah"; const labelHeight = showAyahNumber ? 16 * scale : 0; const totalHeight = labelHeight + arabicHeight + (translationLines.length ? typography.translationSpacingBelowArabic * scale + translationHeight : 0) + (transliterationLines.length ? 8 * scale + transliterationHeight : 0);
    const x = positioning.x * request.format.width; const y = positioning.y * request.format.height - totalHeight / 2;
    if (captionBackground.enabled && positioning.translationPositionLinked) { context.fillStyle = alphaColor(captionBackground.color, captionBackground.opacity); roundedRect(context, x - maxWidth / 2 - captionBackground.horizontalPadding * scale, y - captionBackground.verticalPadding * scale, maxWidth + captionBackground.horizontalPadding * scale * 2, totalHeight + captionBackground.verticalPadding * scale * 2, captionBackground.cornerRadius * scale); }
    let cursor = y;
    if (showAyahNumber) { context.font = `600 ${10 * scale}px Arial, sans-serif`; drawText(context, [captionVerseNumberLabel(segment)], x, cursor + 10 * scale, 12 * scale, "center", "ltr", "#f7d88b", false, 0, "transparent", false, 0, 0); cursor += labelHeight; }
    context.font = `${arabicSize}px "${arabicFont}", serif`; drawText(context, arabicLines, x, cursor + arabicSize, arabicSize * typography.arabicLineSpacing, typography.textAlign, "rtl", alphaColor(typography.textColor, typography.arabicOpacity), typography.arabicOutlineEnabled, typography.arabicOutlineWidth * scale, typography.arabicOutlineColor, typography.arabicShadowEnabled, typography.arabicShadowBlur * scale, typography.arabicShadowStrength); cursor += arabicHeight;
    if (translationLines.length && positioning.translationPositionLinked) { cursor += typography.translationSpacingBelowArabic * scale; context.font = `${translationSize}px ${typography.translationFontFamily}`; drawText(context, translationLines, x, cursor + translationSize, translationSize * 1.25, typography.translationTextAlign, "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), typography.translationOutlineEnabled, typography.translationOutlineWidth * scale, typography.translationOutlineColor, typography.translationShadowEnabled, typography.translationShadowBlur * scale, typography.translationShadowStrength); cursor += translationHeight; }
    if (transliterationLines.length) { cursor += 8 * scale; context.font = `${transliterationSize}px ${typography.transliterationFontFamily}`; drawText(context, transliterationLines, x, cursor + transliterationSize, transliterationSize * 1.25, "center", "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), false, 0, "transparent", false, 0, 0); }
    if (translationLines.length && !positioning.translationPositionLinked) { const tx = positioning.translationX * request.format.width; const ty = positioning.translationY * request.format.height; context.font = `${translationSize}px ${typography.translationFontFamily}`; const h = translationHeight; if (captionBackground.enabled) { context.fillStyle = alphaColor(captionBackground.color, captionBackground.opacity); roundedRect(context, tx - translationMaxWidth / 2 - captionBackground.horizontalPadding * scale, ty - h / 2 - captionBackground.verticalPadding * scale, translationMaxWidth + captionBackground.horizontalPadding * scale * 2, h + captionBackground.verticalPadding * scale * 2, captionBackground.cornerRadius * scale); } drawText(context, translationLines, tx, ty - h / 2 + translationSize, translationSize * 1.25, typography.translationTextAlign, "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), typography.translationOutlineEnabled, typography.translationOutlineWidth * scale, typography.translationOutlineColor, typography.translationShadowEnabled, typography.translationShadowBlur * scale, typography.translationShadowStrength); }
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

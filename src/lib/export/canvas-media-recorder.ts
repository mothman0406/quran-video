import { captionVerseNumberLabel, captionVisualStatesAtTime } from "../editor/captions.ts";
import { quranFontDefinitions } from "../quran/content.ts";
import type { LocalExportRequest, LocalExportResult, LocalVideoRenderer } from "./types.ts";
import { canvasMediaRecorderSupport } from "./support.ts";

const FRAME_RATE = 30;
export { canvasMediaRecorderSupport } from "./support.ts";

function abortError() { return new DOMException("Export cancelled.", "AbortError"); }
function alphaColor(color: string, opacity: number) { return color.startsWith("#") ? `${color}${Math.round(Math.max(0, Math.min(1, opacity)) * 255).toString(16).padStart(2, "0")}` : color; }
function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) { const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.roundRect(x, y, width, height, r); context.fill(); }

function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/u); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (line && context.measureText(next).width > maxWidth) { lines.push(line); line = word; } else line = next; }
  if (line) lines.push(line); return lines;
}

async function loadArabicFont(request: LocalExportRequest) {
  const font = quranFontDefinitions[request.typography.quranStyle];
  if (font.source.includes("{page}")) throw new Error("The selected Madinah/QCF font is page-specific and cannot be safely drawn into this export. Choose Uthmani, IndoPak, or KFGQPC style.");
  const face = new FontFace(font.family, `url(${font.source}) format('woff2')`);
  const loaded = await face.load(); document.fonts.add(loaded);
  await document.fonts.load(`${request.typography.arabicFontSize}px "${font.family}"`);
  return font.family;
}

function drawText(context: CanvasRenderingContext2D, lines: readonly string[], x: number, y: number, lineHeight: number, align: CanvasTextAlign, direction: CanvasDirection, fill: string, outline: boolean, outlineWidth: number, outlineColor: string, shadow: boolean, shadowBlur: number, shadowStrength: number) {
  context.save(); context.textAlign = align; context.direction = direction; context.fillStyle = fill; context.strokeStyle = outlineColor; context.lineWidth = outlineWidth; context.shadowColor = shadow ? `rgba(0,0,0,${shadowStrength})` : "transparent"; context.shadowBlur = shadow ? shadowBlur : 0; context.shadowOffsetY = shadow ? 2 : 0;
  lines.forEach((line, index) => { const baseline = y + index * lineHeight; if (outline) context.strokeText(line, x, baseline); context.fillText(line, x, baseline); }); context.restore();
}

function drawCaptions(context: CanvasRenderingContext2D, request: LocalExportRequest, timeMs: number, arabicFont: string) {
  const { typography, positioning, captionBackground, showVerseNumber } = request; const scale = request.format.width / 360; const maxWidth = request.format.width * positioning.maxWidthPercent;
  for (const state of captionVisualStatesAtTime(request.segments, timeMs, request.transitionSettings)) {
    const { segment, opacity, blurPx } = state; const arabicSize = typography.arabicFontSize * scale; const translationSize = typography.translationFontSize * scale; const transliterationSize = typography.transliterationFontSize * scale;
    context.save(); context.filter = blurPx ? `blur(${blurPx * scale}px)` : "none"; context.globalAlpha = opacity;
    context.font = `${arabicSize}px "${arabicFont}", serif`; const arabicLines = wrap(context, segment.arabic, maxWidth); const arabicHeight = arabicLines.length * arabicSize * typography.arabicLineSpacing;
    const translation = typography.translationVisible ? segment.translation : null; const transliteration = typography.transliterationVisible ? segment.transliteration : null;
    context.font = `${translationSize}px ${typography.translationFontFamily}`; const translationLines = translation ? wrap(context, translation, maxWidth) : []; const translationHeight = translationLines.length * translationSize * 1.25;
    context.font = `${transliterationSize}px ${typography.transliterationFontFamily}`; const transliterationLines = transliteration ? wrap(context, transliteration, maxWidth) : []; const transliterationHeight = transliterationLines.length * transliterationSize * 1.25;
    const labelHeight = showVerseNumber ? 16 * scale : 0; const totalHeight = labelHeight + arabicHeight + (translationLines.length ? typography.translationSpacingBelowArabic * scale + translationHeight : 0) + (transliterationLines.length ? 8 * scale + transliterationHeight : 0);
    const x = positioning.x * request.format.width; const y = positioning.y * request.format.height - totalHeight / 2;
    if (captionBackground.enabled && positioning.translationPositionLinked) { context.fillStyle = alphaColor(captionBackground.color, captionBackground.opacity); roundedRect(context, x - maxWidth / 2 - captionBackground.horizontalPadding * scale, y - captionBackground.verticalPadding * scale, maxWidth + captionBackground.horizontalPadding * scale * 2, totalHeight + captionBackground.verticalPadding * scale * 2, captionBackground.cornerRadius * scale); }
    let cursor = y;
    if (showVerseNumber) { context.font = `600 ${10 * scale}px Arial, sans-serif`; drawText(context, [captionVerseNumberLabel(segment)], x, cursor + 10 * scale, 12 * scale, "center", "ltr", "#f7d88b", false, 0, "transparent", false, 0, 0); cursor += labelHeight; }
    context.font = `${arabicSize}px "${arabicFont}", serif`; drawText(context, arabicLines, x, cursor + arabicSize, arabicSize * typography.arabicLineSpacing, typography.textAlign, "rtl", alphaColor(typography.textColor, typography.arabicOpacity), typography.arabicOutlineEnabled, typography.arabicOutlineWidth * scale, typography.arabicOutlineColor, typography.arabicShadowEnabled, typography.arabicShadowBlur * scale, typography.arabicShadowStrength); cursor += arabicHeight;
    if (translationLines.length && positioning.translationPositionLinked) { cursor += typography.translationSpacingBelowArabic * scale; context.font = `${translationSize}px ${typography.translationFontFamily}`; drawText(context, translationLines, x, cursor + translationSize, translationSize * 1.25, typography.translationTextAlign, "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), typography.translationOutlineEnabled, typography.translationOutlineWidth * scale, typography.translationOutlineColor, typography.translationShadowEnabled, typography.translationShadowBlur * scale, typography.translationShadowStrength); cursor += translationHeight; }
    if (transliterationLines.length) { cursor += 8 * scale; context.font = `${transliterationSize}px ${typography.transliterationFontFamily}`; drawText(context, transliterationLines, x, cursor + transliterationSize, transliterationSize * 1.25, "center", "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), false, 0, "transparent", false, 0, 0); }
    if (translationLines.length && !positioning.translationPositionLinked) { const tx = positioning.translationX * request.format.width; const ty = positioning.translationY * request.format.height; context.font = `${translationSize}px ${typography.translationFontFamily}`; const h = translationHeight; if (captionBackground.enabled) { context.fillStyle = alphaColor(captionBackground.color, captionBackground.opacity); roundedRect(context, tx - maxWidth / 2 - captionBackground.horizontalPadding * scale, ty - h / 2 - captionBackground.verticalPadding * scale, maxWidth + captionBackground.horizontalPadding * scale * 2, h + captionBackground.verticalPadding * scale * 2, captionBackground.cornerRadius * scale); } drawText(context, translationLines, tx, ty - h / 2 + translationSize, translationSize * 1.25, typography.translationTextAlign, "ltr", alphaColor(typography.translationTextColor, typography.translationOpacity), typography.translationOutlineEnabled, typography.translationOutlineWidth * scale, typography.translationOutlineColor, typography.translationShadowEnabled, typography.translationShadowBlur * scale, typography.translationShadowStrength); }
    context.restore();
  }
}

export const canvasMediaRecorderRenderer: LocalVideoRenderer = {
  id: "canvas-media-recorder",
  support: canvasMediaRecorderSupport,
  async render(request): Promise<LocalExportResult> {
    const support = canvasMediaRecorderSupport(); if (!support.supported || !support.mimeType) throw new Error(support.reason); if (request.format.preset !== "vertical" || request.format.width !== 1080 || request.format.height !== 1920) throw new Error("This spike currently exports 9:16 vertical projects at 1080×1920 only."); if (request.signal?.aborted) throw abortError();
    request.onProgress?.({ phase: "preparing", fraction: 0 }); const arabicFont = await loadArabicFont(request); if (request.signal?.aborted) throw abortError();
    const canvas = document.createElement("canvas"); canvas.width = request.format.width; canvas.height = request.format.height; const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas 2D compositing is unavailable.");
    const video = document.createElement("video"); const sourceUrl = URL.createObjectURL(request.source); video.src = sourceUrl; video.preload = "auto"; video.playsInline = true; video.muted = true;
    const audioContext = new AudioContext(); const audioDestination = audioContext.createMediaStreamDestination(); const sourceNode = audioContext.createMediaElementSource(video); sourceNode.connect(audioDestination);
    const canvasStream = canvas.captureStream(FRAME_RATE); const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]); const chunks: BlobPart[] = []; const recorder = new MediaRecorder(stream, { mimeType: support.mimeType, videoBitsPerSecond: 8_000_000 });
    let frameCallback = 0; let stopped = false;
    const cleanup = () => { if (frameCallback && "cancelVideoFrameCallback" in video) (video as HTMLVideoElement & { cancelVideoFrameCallback(id: number): void }).cancelVideoFrameCallback(frameCallback); stream.getTracks().forEach((track) => track.stop()); canvasStream.getTracks().forEach((track) => track.stop()); sourceNode.disconnect(); void audioContext.close(); URL.revokeObjectURL(sourceUrl); video.removeAttribute("src"); video.load(); };
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The source video could not be decoded locally for export.")); });
      const stop = () => { if (!stopped) { stopped = true; recorder.stop(); } };
      const abort = () => { stop(); };
      request.signal?.addEventListener("abort", abort, { once: true });
      const result = await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => reject(new Error("The browser recorder failed while finalizing the local export."));
        recorder.onstop = () => request.signal?.aborted ? reject(abortError()) : resolve(new Blob(chunks, { type: support.mimeType }));
        const renderFrame = () => { if (request.signal?.aborted) { stop(); return; } context.clearRect(0, 0, canvas.width, canvas.height); const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight); const width = video.videoWidth * scale; const height = video.videoHeight * scale; context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); drawCaptions(context, request, video.currentTime * 1000, arabicFont); request.onProgress?.({ phase: "rendering", fraction: Math.min(1, video.currentTime / Math.max(video.duration, 0.001)) }); };
        const schedule = () => { if ("requestVideoFrameCallback" in video) frameCallback = (video as HTMLVideoElement & { requestVideoFrameCallback(callback: () => void): number }).requestVideoFrameCallback(() => { renderFrame(); schedule(); }); };
        video.onended = () => { renderFrame(); request.onProgress?.({ phase: "finalizing", fraction: 1 }); stop(); };
        recorder.start(1_000); renderFrame(); schedule(); void audioContext.resume().then(() => video.play()).catch(() => reject(new Error("The browser prevented local export playback. Start export from a direct click.")));
      });
      request.signal?.removeEventListener("abort", abort); return { blob: result, fileName: `${request.source.name.replace(/\.[^.]+$/u, "")}-captions.webm`, mimeType: support.mimeType };
    } finally { cleanup(); }
  },
};

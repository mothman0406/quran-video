"use client";

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { arabicCaptionPresentationWords, captionBackgroundStyle, captionVisualStatesAtTime, effectiveTranslationColor, linkedCaptionStackLayout, resolveWordHighlightPresentation, translationDisplayText, type ArabicPresentationWord, type CaptionBackground, type CaptionPositioning, type CaptionSegment, type TransitionSettings, type Typography } from "@/lib/editor/captions";
import type { QuranContentResponse } from "@/lib/quran/content";
import { quranFontDefinitions } from "@/lib/quran/content";
import type { ProjectFormat } from "@/lib/schemas/project";
import { captionStyleFromState, resolveCaptionLayerStyle } from "@/lib/editor/styles";
import type { CaptionCanvasBounds } from "@/lib/editor/social-platform-guides";
import type { MediaPlaybackClock } from "@/lib/editor/playback-clock";
import CaptionLogicalStage from "@/components/caption-logical-stage";
import { captionLogicalFormat, measureCaptionLayout } from "@/lib/editor/caption-layout";
import { ensurePresentationFontsLoaded } from "@/lib/quran/font-loading";
import type { CaptionResizeEdge } from "@/lib/editor/caption-manipulation";

export type CaptionObject = "arabic" | "translation" | "transliteration";
export type { CaptionResizeEdge } from "@/lib/editor/caption-manipulation";

type CaptionPreviewProps = {
  currentTimeMs: number;
  playbackClock: MediaPlaybackClock | null;
  segments: readonly CaptionSegment[];
  content: Readonly<Record<string, QuranContentResponse>>;
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  format: ProjectFormat;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  selectedSegmentId: string | null;
  selectedObject: CaptionObject | null;
  onSelectObject: (segment: CaptionSegment, kind: CaptionObject | null) => void;
  onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, segment: CaptionSegment, kind: CaptionObject) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onCaptionBoundsChange?: (bounds: CaptionCanvasBounds[]) => void;
};

function CaptionPreview({
  currentTimeMs,
  playbackClock,
  segments,
  content,
  typography,
  captionBackground,
  positioning,
  format,
  transitionSettings,
  showVerseNumber,
  selectedSegmentId,
  selectedObject,
  onSelectObject,
  onObjectPointerDown,
  onResizePointerDown,
  onPointerMove,
  onPointerUp,
  onCaptionBoundsChange,
}: CaptionPreviewProps) {
  const layerRefs = useRef(new Map<string, HTMLDivElement>());
  const [loadedQuranFont, setLoadedQuranFont] = useState<{ key: string; family: string } | null>(null);
  // The rest of the editor can follow ordinary media events. This focused
  // state is the only subtree that consumes every authoritative animation
  // frame, which keeps short word intervals visible without a synthetic clock.
  const [presentationTimeMs, setPresentationTimeMs] = useState(currentTimeMs);
  const registerLayer = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) layerRefs.current.set(id, node);
    else layerRefs.current.delete(id);
  }, []);
  const measurementContext = useMemo(() => typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d"), []);
  const logicalFormat = captionLogicalFormat(format);
  const fontLoadKey = [typography.quranStyle, typography.arabicFontSize, typography.translationFontFamily, typography.translationFontSize, typography.transliterationFontFamily, typography.transliterationFontSize].join(":");

  useEffect(() => {
    let active = true;
    void ensurePresentationFontsLoaded({
      quranStyle: typography.quranStyle,
      arabicFontSize: typography.arabicFontSize,
      translationFont: typography.translationFontFamily,
      translationFontSize: typography.translationFontSize,
      transliterationFont: typography.transliterationFontFamily,
      transliterationFontSize: typography.transliterationFontSize,
    }).then((family) => { if (active) setLoadedQuranFont({ key: fontLoadKey, family }); }).catch(() => undefined);
    return () => { active = false; };
  }, [fontLoadKey, typography.arabicFontSize, typography.quranStyle, typography.translationFontFamily, typography.translationFontSize, typography.transliterationFontFamily, typography.transliterationFontSize]);

  useEffect(() => {
    if (!playbackClock) return;
    return playbackClock.subscribe((timeMs) => {
      setPresentationTimeMs((current) => current === timeMs ? current : timeMs);
    });
  }, [playbackClock]);
  const effectivePresentationTimeMs = playbackClock ? presentationTimeMs : currentTimeMs;

  useEffect(() => {
    const applyVisualState = () => {
      // This exact selector is the shared preview/timeline/test authority.
      const states = captionVisualStatesAtTime(segments, effectivePresentationTimeMs, transitionSettings);
      const stateById = new Map(states.map((state) => [state.segment.id, state]));
      layerRefs.current.forEach((layer, id) => {
        const state = stateById.get(id);
        const opacity = state?.opacity ?? 0;
        layer.style.opacity = String(opacity);
        layer.style.filter = state && state.blurPx > 0 ? `blur(${state.blurPx}px)` : "none";
        // Presence in the state map is the same half-open CaptionSegment time
        // interval used by the editor timeline. A fade may begin at opacity 0,
        // but it never changes the caption's authoritative start/end boundary.
        layer.style.visibility = state ? "visible" : "hidden";
        layer.dataset.captionOpacity = opacity.toFixed(3);
      });
    };
    applyVisualState();
  }, [effectivePresentationTimeMs, segments, transitionSettings]);

  useLayoutEffect(() => {
    if (!onCaptionBoundsChange) return;
    const measure = () => {
      const canvas = layerRefs.current.values().next().value?.parentElement as HTMLDivElement | undefined;
      if (!canvas) return onCaptionBoundsChange([]);
      const canvasRect = canvas.getBoundingClientRect();
      if (!canvasRect.width || !canvasRect.height) return onCaptionBoundsChange([]);
      const activeIds = new Set(captionVisualStatesAtTime(segments, currentTimeMs, transitionSettings).map((state) => state.segment.id));
      if (selectedSegmentId) activeIds.add(selectedSegmentId);
      const next: CaptionCanvasBounds[] = [];
      layerRefs.current.forEach((layer, segmentId) => {
        if (!activeIds.has(segmentId)) return;
        layer.querySelectorAll<HTMLDivElement>("[data-caption-object]").forEach((object) => {
          const kind = object.dataset.captionObject;
          if (kind !== "arabic" && kind !== "translation" && kind !== "transliteration") return;
          const rect = object.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          next.push({
            segmentId,
            kind,
            linked: object.classList.contains("caption-object-linked"),
            x: Math.max(0, (rect.left - canvasRect.left) / canvasRect.width),
            y: Math.max(0, (rect.top - canvasRect.top) / canvasRect.height),
            width: Math.min(1, rect.width / canvasRect.width),
            height: Math.min(1, rect.height / canvasRect.height),
          });
        });
      });
      onCaptionBoundsChange(next);
    };
    const frame = requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const canvas = layerRefs.current.values().next().value?.parentElement;
    if (canvas) observer?.observe(canvas);
    layerRefs.current.forEach((layer) => observer?.observe(layer));
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [captionBackground, currentTimeMs, onCaptionBoundsChange, positioning, segments, transitionSettings, typography]);

  const globalStyle = captionStyleFromState(typography, positioning, captionBackground, transitionSettings);
  const styleText = (kind: CaptionObject, layerTypography: Typography) => {
    const outline = kind === "arabic" ? layerTypography.arabicOutlineEnabled : layerTypography.translationOutlineEnabled;
    const width = kind === "arabic" ? layerTypography.arabicOutlineWidth : layerTypography.translationOutlineWidth;
    const color = kind === "arabic" ? layerTypography.arabicOutlineColor : layerTypography.translationOutlineColor;
    const shadow = kind === "arabic" ? layerTypography.arabicShadowEnabled : layerTypography.translationShadowEnabled;
    const blur = kind === "arabic" ? layerTypography.arabicShadowBlur : layerTypography.translationShadowBlur;
    const strength = kind === "arabic" ? layerTypography.arabicShadowStrength : layerTypography.translationShadowStrength;
    return {
      WebkitTextStroke: outline ? `${width}px ${color}` : "0 transparent",
      textShadow: shadow ? `0 2px ${blur}px rgba(0,0,0,${strength})` : "none",
      textAlign: kind === "arabic" ? layerTypography.textAlign : layerTypography.translationTextAlign,
    } as const;
  };

  return <CaptionLogicalStage format={format}>
    {segments.map((segment) => {
      const arabicStyle = resolveCaptionLayerStyle(globalStyle, segment.styleOverrides, "arabic");
      const translationStyleState = resolveCaptionLayerStyle(globalStyle, segment.styleOverrides, "translation");
      const segmentTypography = arabicStyle.typography;
      const segmentPositioning = arabicStyle.positioning;
      const segmentBackground = arabicStyle.captionBackground;
      const item = content[segment.verseKeys[0]];
      if (segment.contentKind === "ayah" && item?.status !== "ready") return null;
      const translation = translationDisplayText(segment) ?? (item?.status === "ready" ? item.verse.translation : null);
      const hasTranslation = translationStyleState.typography.translationVisible && Boolean(translation);
      const hasTransliteration = segmentTypography.transliterationVisible && Boolean(segment.transliteration);
      const arabicWords = arabicCaptionPresentationWords(segment, showVerseNumber, effectivePresentationTimeMs, segmentTypography.wordHighlightMode);
      const background = captionBackgroundStyle(segmentBackground);
      const arabicWidth = `${segmentPositioning.maxWidthPercent * 100}%`;
      const translationWidth = `${(translationStyleState.positioning.translationMaxWidthPercent ?? translationStyleState.positioning.maxWidthPercent) * 100}%`;
      const translationStyle = { ...styleText("translation", translationStyleState.typography), color: effectiveTranslationColor(translationStyleState.typography), fontFamily: translationStyleState.typography.translationFontFamily, fontSize: translationStyleState.typography.translationFontSize, fontWeight: translationStyleState.typography.translationFontWeight, fontStyle: translationStyleState.typography.translationItalic ? "italic" : "normal", opacity: translationStyleState.typography.translationOpacity, margin: 0 };
      const layout = loadedQuranFont?.key === fontLoadKey && measurementContext ? measureCaptionLayout({
        context: measurementContext,
        format: logicalFormat,
        typography: segmentTypography,
        positioning: segmentPositioning,
        arabicFontFamily: loadedQuranFont.family,
        arabicWords,
        translation: hasTranslation ? translation : null,
        translationTypography: translationStyleState.typography,
        translationPositioning: translationStyleState.positioning,
        transliteration: hasTransliteration ? segment.transliteration ?? null : null,
      }) : null;
      const isLinked = segmentPositioning.translationPositionLinked;
      const isSelected = selectedSegmentId === segment.id && selectedObject === "arabic";
      const objectClass = (kind: CaptionObject) => `caption-object ${!isLinked && selectedSegmentId === segment.id && selectedObject === kind ? "caption-object-selected" : ""}`;
      const handles = (kind: CaptionObject, selected: boolean) => selected ? <>
        {(["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"] as const).map((edge) => <button key={edge} aria-label={`Resize ${kind} text box from ${edge}`} className={`caption-handle caption-handle-${edge}`} type="button" onPointerDown={(event) => onResizePointerDown(event, kind, edge)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onLostPointerCapture={onPointerUp} />)}
      </> : null;
      const arabicObject = (linked: boolean) => <div
        className={`${objectClass("arabic")}${linked ? " caption-object-linked" : ""}`}
        data-caption-object="arabic"
        style={linked ? { width: "100%" } : { ...background, left: `${segmentPositioning.x * 100}%`, top: `${segmentPositioning.y * 100}%`, width: arabicWidth }}
        onPointerDown={linked ? undefined : (event) => onObjectPointerDown(event, segment, "arabic")}
        onPointerMove={linked ? undefined : onPointerMove}
        onPointerUp={linked ? undefined : onPointerUp}
        onPointerCancel={linked ? undefined : onPointerUp}
        onLostPointerCapture={linked ? undefined : onPointerUp}
        onClick={linked ? undefined : (event) => { event.stopPropagation(); onSelectObject(segment, "arabic"); }}
      >
        <p className="pointer-events-none" dir="rtl" lang="ar" style={{ ...styleText("arabic", segmentTypography), color: segmentTypography.textColor, fontFamily: quranFontDefinitions[segmentTypography.quranStyle].family, fontSize: segmentTypography.arabicFontSize, lineHeight: `${layout?.metrics.arabicLineHeight ?? segmentTypography.arabicFontSize * segmentTypography.arabicLineSpacing}px`, opacity: segmentTypography.arabicOpacity, visibility: layout ? "visible" : "hidden" }}><span data-caption-arabic-text>{layout?.arabicLines.map((line, lineIndex) => <span className="caption-text-line" data-caption-line={lineIndex} key={`${segment.id}-arabic-line-${lineIndex}`}>{line.words.map((word: ArabicPresentationWord, index: number) => <Fragment key={`${segment.id}-${word.kind}-${lineIndex}-${index}`}>
          {index > 0 && (word.kind === "verse-number" ? "\u00a0" : " ")}
          {(() => {
            const presentation = resolveWordHighlightPresentation({ baseTextColor: segmentTypography.textColor, highlightColor: segmentTypography.wordHighlightColor, intensity: segmentTypography.wordHighlightIntensity, isHighlighted: word.highlighted, state: word.state });
            return <span data-caption-quran-word={word.kind === "quran-word" ? "true" : undefined} data-caption-word-highlighted={word.highlighted ? "true" : "false"} data-caption-word-state={word.state} style={{ color: presentation.color, opacity: presentation.opacity, textShadow: presentation.glowBlurPx ? `0 0 ${presentation.glowBlurPx}px ${presentation.glowColor}` : undefined }}>{word.text}</span>;
          })()}
        </Fragment>)}</span>)}</span></p>
        {handles("arabic", !linked && selectedSegmentId === segment.id && selectedObject === "arabic")}
      </div>;
      const translationObject = (linked: boolean) => hasTranslation && <div
        className={`${objectClass("translation")}${linked ? " caption-object-linked" : ""}`}
        data-caption-object="translation"
        style={linked ? { width: "100%" } : { ...background, left: `${translationStyleState.positioning.translationX * 100}%`, top: `${translationStyleState.positioning.translationY * 100}%`, width: translationWidth }}
        onPointerDown={linked ? undefined : (event) => onObjectPointerDown(event, segment, "translation")}
        onPointerMove={linked ? undefined : onPointerMove}
        onPointerUp={linked ? undefined : onPointerUp}
        onPointerCancel={linked ? undefined : onPointerUp}
        onLostPointerCapture={linked ? undefined : onPointerUp}
        onClick={linked ? undefined : (event) => { event.stopPropagation(); onSelectObject(segment, "translation"); }}
      >
        <p className="pointer-events-none" style={{ ...translationStyle, lineHeight: `${layout?.metrics.translationLineHeight ?? translationStyleState.typography.translationFontSize * 1.25}px`, visibility: layout ? "visible" : "hidden" }}>{layout?.translationLines.map((line, index) => <span className="caption-text-line" data-caption-line={index} key={`${segment.id}-translation-line-${index}`}>{line.text}</span>)}</p>
        {handles("translation", !linked && selectedSegmentId === segment.id && selectedObject === "translation")}
      </div>;
      const transliterationObject = (linked: boolean) => hasTransliteration && <div
        className={`caption-object caption-object-transliteration${linked ? " caption-object-linked" : ""}`}
        data-caption-object="transliteration"
        style={linked ? { width: "100%" } : { left: `${segmentPositioning.x * 100}%`, top: `${Math.min(0.94, segmentPositioning.y + 0.12) * 100}%`, width: arabicWidth }}
      >
        <p className="pointer-events-none" style={{ color: segmentTypography.translationTextColor, fontFamily: segmentTypography.transliterationFontFamily, fontSize: segmentTypography.transliterationFontSize, lineHeight: `${layout?.metrics.transliterationLineHeight ?? segmentTypography.transliterationFontSize * 1.25}px`, opacity: segmentTypography.translationOpacity, margin: 0, visibility: layout ? "visible" : "hidden" }}>{layout?.transliterationLines.map((line, index) => <span className="caption-text-line" data-caption-line={index} key={`${segment.id}-transliteration-line-${index}`}>{line.text}</span>)}</p>
      </div>;
      return <div key={segment.id} ref={registerLayer(segment.id)} className="absolute inset-0 pointer-events-none" data-caption-segment={segment.id} data-caption-opacity="0" style={{ opacity: 0, visibility: "hidden", willChange: "opacity, filter" }}>
        {segmentPositioning.translationPositionLinked ? <div
          className={`caption-linked-stack${isSelected ? " caption-linked-stack-selected" : ""}`}
        style={{ ...background, left: `${segmentPositioning.x * 100}%`, top: `${layout ? linkedCaptionStackLayout(logicalFormat, segmentPositioning.y, logicalFormat.height, layout.totalHeight + (segmentBackground.enabled ? segmentBackground.verticalPadding * 2 : 0)).centerY * 100 : segmentPositioning.y * 100}%`, width: arabicWidth, gap: `${segmentTypography.translationSpacingBelowArabic}px` }}
        onPointerDown={(event) => onObjectPointerDown(event, segment, "arabic")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onClick={(event) => { event.stopPropagation(); onSelectObject(segment, "arabic"); }}
        >
          {arabicObject(true)}
          {translationObject(true)}
          {transliterationObject(true)}
          {isSelected && <div className="caption-selection-box" aria-label="Selected linked caption block">{handles("arabic", true)}</div>}
        </div> : <>
          {arabicObject(false)}
          {translationObject(false)}
          {transliterationObject(false)}
        </>}
      </div>;
    })}
  </CaptionLogicalStage>;
}

export default memo(CaptionPreview);

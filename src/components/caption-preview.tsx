"use client";

import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { arabicCaptionPresentationWords, captionBackgroundStyle, captionVisualStatesAtTime, getActiveCaptionSegment, linkedCaptionStackLayout, translationDisplayText, type CaptionBackground, type CaptionPositioning, type CaptionSegment, type TransitionSettings, type Typography } from "@/lib/editor/captions";
import type { QuranContentResponse } from "@/lib/quran/content";
import { quranFontDefinitions } from "@/lib/quran/content";
import type { ProjectFormat } from "@/lib/schemas/project";
import { captionStyleFromState, resolveCaptionLayerStyle } from "@/lib/editor/styles";

export type CaptionObject = "arabic" | "translation" | "transliteration";
export type CaptionResizeEdge = "left" | "right";

type CaptionPreviewProps = {
  currentTimeMs: number;
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
};

function CaptionPreview({
  currentTimeMs,
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
}: CaptionPreviewProps) {
  const layerRefs = useRef(new Map<string, HTMLDivElement>());
  const linkedStackRefs = useRef(new Map<string, HTMLDivElement>());
  const [linkedStackCenters, setLinkedStackCenters] = useState<Record<string, number>>({});
  const registerLayer = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) layerRefs.current.set(id, node);
    else layerRefs.current.delete(id);
  }, []);
  const registerLinkedStack = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) linkedStackRefs.current.set(id, node);
    else linkedStackRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    if (!positioning.translationPositionLinked) return;
    const measure = () => {
      const next: Record<string, number> = {};
      linkedStackRefs.current.forEach((stack, id) => {
        const canvasHeight = stack.parentElement?.clientHeight ?? 0;
        next[id] = linkedCaptionStackLayout(format, positioning.y, canvasHeight, stack.offsetHeight).centerY;
      });
      setLinkedStackCenters((current) => {
        const unchanged = Object.keys(current).length === Object.keys(next).length
          && Object.entries(next).every(([id, centerY]) => current[id] === centerY);
        return unchanged ? current : next;
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    linkedStackRefs.current.forEach((stack) => {
      observer?.observe(stack);
      if (stack.parentElement) observer?.observe(stack.parentElement);
    });
    return () => observer?.disconnect();
  }, [captionBackground, format, positioning.translationPositionLinked, positioning.y, segments, typography]);

  useEffect(() => {
    const applyVisualState = () => {
      // This exact selector is the shared preview/timeline/test authority.
      const active = getActiveCaptionSegment(segments, currentTimeMs);
      const states = active ? captionVisualStatesAtTime(segments, currentTimeMs, transitionSettings) : [];
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
  }, [currentTimeMs, segments, transitionSettings]);

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

  return <>
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
      const arabicWords = arabicCaptionPresentationWords(segment, showVerseNumber, currentTimeMs, segmentTypography.wordHighlightMode);
      const background = captionBackgroundStyle(segmentBackground);
      const arabicWidth = `${segmentPositioning.maxWidthPercent * 100}%`;
      const translationWidth = `${(translationStyleState.positioning.translationMaxWidthPercent ?? translationStyleState.positioning.maxWidthPercent) * 100}%`;
      const translationStyle = { ...styleText("translation", translationStyleState.typography), color: translationStyleState.typography.translationTextColor, fontFamily: translationStyleState.typography.translationFontFamily, fontSize: translationStyleState.typography.translationFontSize, opacity: translationStyleState.typography.translationOpacity, margin: 0 };
      const objectClass = (kind: CaptionObject) => `caption-object ${selectedSegmentId === segment.id && selectedObject === kind ? "caption-object-selected" : ""}`;
      const handles = (kind: CaptionObject) => selectedSegmentId === segment.id && selectedObject === kind ? <>
        <button aria-label={`Resize ${kind} text box from left`} className="caption-handle caption-handle-left" type="button" onPointerDown={(event) => onResizePointerDown(event, kind, "left")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <button aria-label={`Resize ${kind} text box from right`} className="caption-handle caption-handle-right" type="button" onPointerDown={(event) => onResizePointerDown(event, kind, "right")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <span className="caption-handle caption-handle-top-left" aria-hidden="true" />
        <span className="caption-handle caption-handle-top-right" aria-hidden="true" />
        <span className="caption-handle caption-handle-bottom-left" aria-hidden="true" />
        <span className="caption-handle caption-handle-bottom-right" aria-hidden="true" />
      </> : null;
      const arabicObject = (linked: boolean) => <div
        className={`${objectClass("arabic")}${linked ? " caption-object-linked" : ""}`}
        data-caption-object="arabic"
        style={linked ? { width: "100%" } : { ...background, left: `${segmentPositioning.x * 100}%`, top: `${segmentPositioning.y * 100}%`, width: arabicWidth }}
        onPointerDown={(event) => onObjectPointerDown(event, segment, "arabic")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(event) => { event.stopPropagation(); onSelectObject(segment, "arabic"); }}
      >
        <p className="pointer-events-none" dir="rtl" lang="ar" style={{ ...styleText("arabic", segmentTypography), color: segmentTypography.textColor, fontFamily: quranFontDefinitions[segmentTypography.quranStyle].family, fontSize: segmentTypography.arabicFontSize, lineHeight: segmentTypography.arabicLineSpacing, opacity: segmentTypography.arabicOpacity }}><span data-caption-arabic-text>{arabicWords.map((word, index) => <Fragment key={`${segment.id}-${word.kind}-${index}`}>
          {index > 0 && (word.kind === "verse-number" ? "\u00a0" : " ")}
          <span data-caption-quran-word={word.kind === "quran-word" ? "true" : undefined} data-caption-word-highlighted={word.highlighted ? "true" : "false"} style={word.highlighted ? { color: segmentTypography.wordHighlightColor } : undefined}>{word.text}</span>
        </Fragment>)}</span></p>
        {handles("arabic")}
      </div>;
      const translationObject = (linked: boolean) => hasTranslation && <div
        className={`${objectClass("translation")}${linked ? " caption-object-linked" : ""}`}
        data-caption-object="translation"
        style={linked ? { width: "100%" } : { ...background, left: `${translationStyleState.positioning.translationX * 100}%`, top: `${translationStyleState.positioning.translationY * 100}%`, width: translationWidth }}
        onPointerDown={(event) => onObjectPointerDown(event, segment, "translation")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={(event) => { event.stopPropagation(); onSelectObject(segment, "translation"); }}
      >
        <p className="pointer-events-none" style={translationStyle}>{translation}</p>
        {handles("translation")}
      </div>;
      return <div key={segment.id} ref={registerLayer(segment.id)} className="absolute inset-0 pointer-events-none" data-caption-segment={segment.id} data-caption-opacity="0" style={{ opacity: 0, visibility: "hidden", willChange: "opacity, filter" }}>
        {positioning.translationPositionLinked ? <div
          ref={registerLinkedStack(segment.id)}
          className="caption-linked-stack"
        style={{ ...background, left: `${segmentPositioning.x * 100}%`, top: `${(linkedStackCenters[segment.id] ?? segmentPositioning.y) * 100}%`, width: arabicWidth, gap: `${segmentTypography.translationSpacingBelowArabic}px` }}
        >
          {arabicObject(true)}
          {translationObject(true)}
        </div> : <>
          {arabicObject(false)}
          {translationObject(false)}
        </>}
      </div>;
    })}
  </>;
}

export default memo(CaptionPreview);

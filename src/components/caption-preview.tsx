"use client";

import { memo, useCallback, useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { arabicCaptionDisplay, captionBackgroundStyle, captionVisualStatesAtTime, getActiveCaptionSegment, type CaptionBackground, type CaptionPositioning, type CaptionSegment, type TransitionSettings, type Typography } from "@/lib/editor/captions";
import type { QuranContentResponse } from "@/lib/quran/content";
import { quranFontDefinitions } from "@/lib/quran/content";

export type CaptionObject = "arabic" | "translation";
export type CaptionResizeEdge = "left" | "right";

type CaptionPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  segments: readonly CaptionSegment[];
  content: Readonly<Record<string, QuranContentResponse>>;
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  selectedObject: CaptionObject | null;
  onSelectObject: (kind: CaptionObject | null) => void;
  onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, kind: CaptionObject) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
};

function CaptionPreview({
  videoRef,
  segments,
  content,
  typography,
  captionBackground,
  positioning,
  transitionSettings,
  showVerseNumber,
  selectedObject,
  onSelectObject,
  onObjectPointerDown,
  onResizePointerDown,
  onPointerMove,
  onPointerUp,
}: CaptionPreviewProps) {
  const layerRefs = useRef(new Map<string, HTMLDivElement>());
  const registerLayer = useCallback((id: string) => (node: HTMLDivElement | null) => {
    if (node) layerRefs.current.set(id, node);
    else layerRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    let frame: number | null = null;
    const applyVisualState = () => {
      const currentTimeMs = (video?.currentTime ?? 0) * 1000;
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
    const stopFrame = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
    const scheduleFrame = () => {
      if (frame !== null || !video || video.paused || video.ended) return;
      frame = requestAnimationFrame(() => { frame = null; applyVisualState(); scheduleFrame(); });
    };
    const applyAndSchedule = () => { applyVisualState(); scheduleFrame(); };
    const applyAndStop = () => { stopFrame(); applyVisualState(); };
    applyAndSchedule();
    video?.addEventListener("play", applyAndSchedule);
    video?.addEventListener("pause", applyAndStop);
    video?.addEventListener("seeking", applyVisualState);
    video?.addEventListener("seeked", applyVisualState);
    video?.addEventListener("timeupdate", applyVisualState);
    video?.addEventListener("ended", applyAndStop);
    return () => {
      stopFrame();
      video?.removeEventListener("play", applyAndSchedule);
      video?.removeEventListener("pause", applyAndStop);
      video?.removeEventListener("seeking", applyVisualState);
      video?.removeEventListener("seeked", applyVisualState);
      video?.removeEventListener("timeupdate", applyVisualState);
      video?.removeEventListener("ended", applyAndStop);
    };
  }, [segments, transitionSettings, videoRef]);

  const styleText = (kind: CaptionObject) => {
    const outline = kind === "arabic" ? typography.arabicOutlineEnabled : typography.translationOutlineEnabled;
    const width = kind === "arabic" ? typography.arabicOutlineWidth : typography.translationOutlineWidth;
    const color = kind === "arabic" ? typography.arabicOutlineColor : typography.translationOutlineColor;
    const shadow = kind === "arabic" ? typography.arabicShadowEnabled : typography.translationShadowEnabled;
    const blur = kind === "arabic" ? typography.arabicShadowBlur : typography.translationShadowBlur;
    const strength = kind === "arabic" ? typography.arabicShadowStrength : typography.translationShadowStrength;
    return {
      WebkitTextStroke: outline ? `${width}px ${color}` : "0 transparent",
      textShadow: shadow ? `0 2px ${blur}px rgba(0,0,0,${strength})` : "none",
      textAlign: kind === "arabic" ? typography.textAlign : typography.translationTextAlign,
    } as const;
  };

  return <>
    {segments.map((segment) => {
      const item = content[segment.verseKeys[0]];
      if (segment.contentKind === "ayah" && item?.status !== "ready") return null;
      const translation = segment.translation ?? (item?.status === "ready" ? item.verse.translation : null);
      const hasTranslation = typography.translationVisible && Boolean(translation);
      const arabicDisplay = arabicCaptionDisplay(segment, showVerseNumber);
      const background = captionBackgroundStyle(captionBackground);
      const arabicWidth = `${positioning.maxWidthPercent * 100}%`;
      const translationWidth = `${(positioning.translationMaxWidthPercent ?? positioning.maxWidthPercent) * 100}%`;
      const translationStyle = { ...styleText("translation"), color: typography.translationTextColor, fontFamily: typography.translationFontFamily, fontSize: typography.translationFontSize, opacity: typography.translationOpacity, margin: 0 };
      const objectClass = (kind: CaptionObject) => `caption-object ${selectedObject === kind ? "caption-object-selected" : ""}`;
      const handles = (kind: CaptionObject) => selectedObject === kind ? <>
        <button aria-label={`Resize ${kind} text box from left`} className="caption-handle caption-handle-left" type="button" onPointerDown={(event) => onResizePointerDown(event, kind, "left")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <button aria-label={`Resize ${kind} text box from right`} className="caption-handle caption-handle-right" type="button" onPointerDown={(event) => onResizePointerDown(event, kind, "right")} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
        <span className="caption-handle caption-handle-top-left" aria-hidden="true" />
        <span className="caption-handle caption-handle-top-right" aria-hidden="true" />
        <span className="caption-handle caption-handle-bottom-left" aria-hidden="true" />
        <span className="caption-handle caption-handle-bottom-right" aria-hidden="true" />
      </> : null;
      return <div key={segment.id} ref={registerLayer(segment.id)} className="absolute inset-0 pointer-events-none" data-caption-segment={segment.id} data-caption-opacity="0" style={{ opacity: 0, visibility: "hidden", willChange: "opacity, filter" }}>
        <div
          className={objectClass("arabic")}
          data-caption-object="arabic"
          style={{ ...background, left: `${positioning.x * 100}%`, top: `${positioning.y * 100}%`, width: arabicWidth }}
          onPointerDown={(event) => onObjectPointerDown(event, "arabic")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(event) => { event.stopPropagation(); onSelectObject("arabic"); }}
        >
          <p className="pointer-events-none" dir="rtl" lang="ar" style={{ ...styleText("arabic"), color: typography.textColor, fontFamily: quranFontDefinitions[typography.quranStyle].family, fontSize: typography.arabicFontSize, lineHeight: typography.arabicLineSpacing, opacity: typography.arabicOpacity }}><span data-caption-arabic-text>{arabicDisplay.text}</span></p>
          {handles("arabic")}
        </div>
        {hasTranslation && <div
          className={objectClass("translation")}
          data-caption-object="translation"
          style={{ ...background, left: `${positioning.translationX * 100}%`, top: `${positioning.translationY * 100}%`, width: translationWidth }}
          onPointerDown={(event) => onObjectPointerDown(event, "translation")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(event) => { event.stopPropagation(); onSelectObject("translation"); }}
        >
          <p className="pointer-events-none" style={translationStyle}>{translation}</p>
          {handles("translation")}
        </div>}
      </div>;
    })}
  </>;
}

export default memo(CaptionPreview);

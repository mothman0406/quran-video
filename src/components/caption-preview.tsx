"use client";

import { memo, useCallback, useEffect, useRef, type PointerEvent, type RefObject } from "react";
import { captionBackgroundStyle, captionVisualStatesAtTime, captionVerseNumberLabel, type CaptionBackground, type CaptionPositioning, type CaptionSegment, type TransitionSettings, type Typography } from "@/lib/editor/captions";
import type { QuranContentResponse } from "@/lib/quran/content";
import { quranFontDefinitions } from "@/lib/quran/content";

type CaptionPreviewProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  segments: readonly CaptionSegment[];
  content: Readonly<Record<string, QuranContentResponse>>;
  typography: Typography;
  captionBackground: CaptionBackground;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  onPositionPointerDown: (event: PointerEvent<HTMLElement>, kind: "arabic" | "translation") => void;
  onPositionPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPositionPointerUp: () => void;
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
  onPositionPointerDown,
  onPositionPointerMove,
  onPositionPointerUp,
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
      const states = captionVisualStatesAtTime(segments, (video?.currentTime ?? 0) * 1000, transitionSettings);
      const stateById = new Map(states.map((state) => [state.segment.id, state]));
      layerRefs.current.forEach((layer, id) => {
        const state = stateById.get(id);
        const opacity = state?.opacity ?? 0;
        layer.style.opacity = String(opacity);
        layer.style.filter = state && state.blurPx > 0 ? `blur(${state.blurPx}px)` : "none";
        layer.style.visibility = opacity > 0 ? "visible" : "hidden";
        layer.dataset.captionOpacity = opacity.toFixed(3);
      });
    };

    const stopFrame = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const scheduleFrame = () => {
      if (frame !== null || !video || video.paused || video.ended) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        applyVisualState();
        scheduleFrame();
      });
    };
    const applyAndSchedule = () => {
      applyVisualState();
      scheduleFrame();
    };
    const applyAndStop = () => {
      stopFrame();
      applyVisualState();
    };

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

  const styleText = (kind: "arabic" | "translation") => {
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
    };
  };

  return <>
    {segments.map((segment) => {
      const item = content[segment.verseKeys[0]];
      if (item?.status !== "ready") return null;
      const hasTranslation = typography.translationVisible && Boolean(segment.translation && item.verse.translation);
      const background = captionBackgroundStyle(captionBackground);
      const translationStyle = { ...styleText("translation"), color: typography.translationTextColor, fontFamily: typography.translationFontFamily, fontSize: typography.translationFontSize, opacity: typography.translationOpacity, marginTop: typography.translationSpacingBelowArabic };
      return <div
        key={segment.id}
        ref={registerLayer(segment.id)}
        className="absolute -translate-x-1/2 -translate-y-1/2 text-white shadow-lg"
        data-caption-segment={segment.id}
        data-caption-opacity="0"
        data-caption-container={captionBackground.enabled ? "background-enabled" : "background-disabled"}
        style={{ ...background, left: `${positioning.x * 100}%`, top: `${positioning.y * 100}%`, maxWidth: `${positioning.maxWidthPercent * 100}%`, opacity: 0, visibility: "hidden", willChange: "opacity, filter" }}
        translate="no"
        onPointerDown={(event) => onPositionPointerDown(event, "arabic")}
        onPointerMove={onPositionPointerMove}
        onPointerUp={onPositionPointerUp}
      >
        {showVerseNumber && <p className="pointer-events-none mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f7d88b]" data-caption-verse-number>{captionVerseNumberLabel(segment)}</p>}
        <p className="pointer-events-none text-3xl sm:text-4xl" dir="rtl" lang="ar" style={{ ...styleText("arabic"), color: typography.textColor, fontFamily: quranFontDefinitions[typography.quranStyle].family, fontSize: typography.arabicFontSize, lineHeight: typography.arabicLineSpacing, opacity: typography.arabicOpacity }}>{segment.arabic}</p>
        {hasTranslation && positioning.translationPositionLinked && <p className="pointer-events-none" style={translationStyle}>{item.verse.translation}</p>}
        {hasTranslation && !positioning.translationPositionLinked && <div className="absolute -translate-x-1/2 -translate-y-1/2 text-white shadow-lg" style={{ ...captionBackgroundStyle(captionBackground), left: `${positioning.translationX * 100 - positioning.x * 100}%`, top: `${positioning.translationY * 100 - positioning.y * 100}%` }} onPointerDown={(event) => onPositionPointerDown(event, "translation")} onPointerMove={onPositionPointerMove} onPointerUp={onPositionPointerUp}><p style={translationStyle}>{item.verse.translation}</p></div>}
      </div>;
    })}
  </>;
}

export default memo(CaptionPreview);

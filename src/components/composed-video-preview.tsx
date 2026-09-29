"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import CaptionPreview from "@/components/caption-preview";
import type { CaptionSegment } from "@/lib/editor/captions";
import { MediaPlaybackClock, type PlaybackUpdateSource } from "@/lib/editor/playback-clock";
import { getVerses } from "@/lib/quran/local";
import type { SavedProject } from "@/lib/schemas/project";
import { videoDimOpacity } from "@/lib/editor/presentation-settings";

export default function ComposedVideoPreview({ project, sourceUrl, className = "" }: { project: SavedProject; sourceUrl: string; className?: string }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playbackClock] = useState(() => new MediaPlaybackClock({
    // CaptionPreview subscribes to animation-frame samples directly. Keep
    // the composed player itself on sparse media events to avoid rerendering
    // the entire Watch surface on every frame.
    onSample: (timeMs, source) => {
      if (source !== "animation-frame") setCurrentTimeMs(timeMs);
    },
  }));
  const clockRef = useRef(playbackClock);
  const content = useMemo(() => {
    const keys = [...new Set(project.captionSegments.flatMap((segment) => segment.verseKeys))];
    if (!keys.length) return {};
    return Object.fromEntries(getVerses(keys[0]!, keys.at(-1)!).map((verse) => [verse.verseKey, { status: "ready" as const, verse }]));
  }, [project.captionSegments]);

  useEffect(() => {
    return () => {
      playbackClock.dispose();
    };
  }, [playbackClock]);

  const sync = (event: SyntheticEvent<HTMLMediaElement>, source: Extract<PlaybackUpdateSource, "seek" | "timeupdate">) => {
    const clock = clockRef.current;
    if (!clock) return setCurrentTimeMs(event.currentTarget.currentTime * 1_000);
    clock.setMedia(event.currentTarget);
    clock.sync(source);
  };
  const play = (event: SyntheticEvent<HTMLMediaElement>) => clockRef.current?.start(event.currentTarget);
  const pause = () => clockRef.current?.stop("pause");
  const ended = () => clockRef.current?.stop("ended");

  const mediaEvents = {
    onPlay: play,
    onPause: pause,
    onEnded: ended,
    onTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => sync(event, "timeupdate"),
    onSeeked: (event: SyntheticEvent<HTMLMediaElement>) => sync(event, "seek"),
  };

  return <div className={`composed-video ${className}`} data-project-format={project.format.preset}>
    {project.sourceMedia?.hasVideo
      ? <video src={sourceUrl} controls playsInline preload="metadata" {...mediaEvents} />
      : <div className="composed-audio"><span aria-hidden="true">۝</span><strong>{project.title}</strong><audio src={sourceUrl} controls preload="metadata" {...mediaEvents} /></div>}
    <div className="composed-video-dim" aria-hidden="true" style={{ backgroundColor: `rgba(0, 0, 0, ${videoDimOpacity(project.captionEffects)})` }} />
    <div className="composed-caption-layer" aria-hidden="true">
      <CaptionPreview
        currentTimeMs={currentTimeMs}
        playbackClock={playbackClock}
        segments={project.captionSegments as CaptionSegment[]}
        content={content}
        typography={project.typography}
        captionBackground={project.captionBackground}
        positioning={project.positioning}
        format={project.format}
        transitionSettings={project.transitionSettings}
        showVerseNumber={project.showVerseNumber}
        selectedSegmentId={null}
        selectedObject={null}
        onSelectObject={() => undefined}
        onObjectPointerDown={() => undefined}
        onResizePointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
      />
    </div>
  </div>;
}

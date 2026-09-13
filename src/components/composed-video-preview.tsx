"use client";

import { useMemo, useState } from "react";
import CaptionPreview from "@/components/caption-preview";
import type { CaptionSegment } from "@/lib/editor/captions";
import { getVerses } from "@/lib/quran/local";
import type { SavedProject } from "@/lib/schemas/project";

export default function ComposedVideoPreview({ project, sourceUrl, className = "" }: { project: SavedProject; sourceUrl: string; className?: string }) {
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const content = useMemo(() => {
    const keys = [...new Set(project.captionSegments.flatMap((segment) => segment.verseKeys))];
    if (!keys.length) return {};
    return Object.fromEntries(getVerses(keys[0]!, keys.at(-1)!).map((verse) => [verse.verseKey, { status: "ready" as const, verse }]));
  }, [project.captionSegments]);

  return <div className={`composed-video ${className}`} data-project-format={project.format.preset}>
    {project.sourceMedia?.hasVideo
      ? <video src={sourceUrl} controls playsInline preload="metadata" onTimeUpdate={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1_000)} onSeeked={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1_000)} />
      : <div className="composed-audio"><span aria-hidden="true">۝</span><strong>{project.title}</strong><audio src={sourceUrl} controls preload="metadata" onTimeUpdate={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1_000)} onSeeked={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1_000)} /></div>}
    <div className="composed-caption-layer" aria-hidden="true">
      <CaptionPreview
        currentTimeMs={currentTimeMs}
        playbackClock={null}
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

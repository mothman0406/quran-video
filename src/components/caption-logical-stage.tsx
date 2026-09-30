"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CAPTION_LOGICAL_WIDTH, captionLogicalFormat } from "@/lib/editor/caption-layout";
import type { ProjectFormat } from "@/lib/schemas/project";

export default function CaptionLogicalStage({ format, children, className = "" }: { format: ProjectFormat; children: ReactNode; className?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const logicalFormat = captionLogicalFormat(format);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const host = stage?.parentElement;
    if (!stage || !host) return;
    const measure = () => setScale(host.clientWidth / CAPTION_LOGICAL_WIDTH);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, [format.height, format.width]);

  return <div
    ref={stageRef}
    className={`caption-logical-stage ${className}`}
    data-caption-logical-width={CAPTION_LOGICAL_WIDTH}
    style={{
      width: `${logicalFormat.width}px`,
      height: `${logicalFormat.height}px`,
      opacity: scale > 0 ? 1 : 0,
      transform: `scale(${scale || 1})`,
    }}
  >{children}</div>;
}

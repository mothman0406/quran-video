"use client";

import { useEffect } from "react";
import { videoJobManager } from "@/lib/video-jobs";

export default function VideoJobRuntime() {
  useEffect(() => {
    void videoJobManager.initialize();
    const abandon = (event: PageTransitionEvent) => {
      if (!event.persisted) videoJobManager.abandon();
    };
    window.addEventListener("pagehide", abandon);
    return () => window.removeEventListener("pagehide", abandon);
  }, []);
  return null;
}

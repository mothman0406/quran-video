"use client";

import { useEffect } from "react";
import { videoJobManager } from "@/lib/video-jobs";

export default function VideoJobRuntime() {
  useEffect(() => {
    void videoJobManager.initialize();
  }, []);
  return null;
}

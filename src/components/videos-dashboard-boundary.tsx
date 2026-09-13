"use client";

import dynamic from "next/dynamic";

const VideosDashboard = dynamic(() => import("@/components/videos-dashboard"), {
  ssr: false,
});

export default function VideosDashboardBoundary() {
  return <VideosDashboard />;
}

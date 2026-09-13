"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const VideoJobRuntime = dynamic(() => import("@/components/video-job-runtime"), {
  ssr: false,
});

export default function VideoJobProvider() {
  const pathname = usePathname();
  return ["/create", "/videos", "/editor"].includes(pathname) ? <VideoJobRuntime /> : null;
}

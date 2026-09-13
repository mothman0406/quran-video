import type { Metadata } from "next";
import VideosDashboardBoundary from "@/components/videos-dashboard-boundary";

export const metadata: Metadata = { title: "Your videos | Quran AutoCaption" };

export default function VideosPage() {
  return <VideosDashboardBoundary />;
}

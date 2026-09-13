import type { Metadata } from "next";
import VideoJobProvider from "@/components/video-job-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quran AutoCaption",
  description: "A Quran-first video caption editor",
  other: {
    google: "notranslate",
    "quran-translation-attribution": "Saheeh International via QuranEnc.com; source version shown when available",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col"><VideoJobProvider />{children}</body>
    </html>
  );
}

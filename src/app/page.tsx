import type { Metadata } from "next";
import LandingPage from "@/components/landing-page";
import { getMarketingQuranDemo } from "@/lib/landing/marketing-demo";

export const metadata: Metadata = {
  title: "Quran Video Editor | Automatic Quran Captions",
  description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
  openGraph: {
    title: "Quran Video Editor | Automatic Quran Captions",
    description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Quran Video Editor | Automatic Quran Captions",
    description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
  },
};

export default function HomePage() {
  return <LandingPage demos={getMarketingQuranDemo()} />;
}

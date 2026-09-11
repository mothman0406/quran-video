import type { Metadata } from "next";
import { cookies } from "next/headers";
import LandingPage from "@/components/landing-page";
import { getMarketingQuranDemo } from "@/lib/landing/marketing-demo";
import { getLandingShowcaseAssets } from "@/lib/landing/showcase-assets";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Quran AutoCaption | Automatic Quran Captions",
  description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
  openGraph: {
    title: "Quran AutoCaption | Automatic Quran Captions",
    description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Quran AutoCaption | Automatic Quran Captions",
    description: "Create polished Quran recitation videos with canonical Quran captions, word-level synchronization, translation, and local-first editing.",
  },
};

async function landingAuthenticated(): Promise<boolean> {
  if (!supabaseServerConfigured()) return false;

  try {
    const cookieStore = await cookies();
    const supabase = createSupabaseServerClient({
      getAll: () => cookieStore.getAll(),
      setAll: () => undefined,
    });
    const { data, error } = await supabase.auth.getUser();
    return Boolean(data.user) && !error;
  } catch {
    return false;
  }
}

export default async function HomePage() {
  const authenticated = await landingAuthenticated();
  return <LandingPage demos={getMarketingQuranDemo()} showcaseAssets={getLandingShowcaseAssets()} authenticated={authenticated} />;
}

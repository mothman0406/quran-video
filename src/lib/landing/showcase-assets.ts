import { existsSync } from "node:fs";
import { join } from "node:path";

export const LANDING_SHOWCASE = [
  { id: "minimal", title: "Minimal", description: "Arabic-first with a clean, distraction-free layout.", chip: "Arabic only" },
  { id: "translation", title: "Translation", description: "Arabic and English composed together in one frame.", chip: "Arabic + English" },
  { id: "highlight", title: "Word Highlight", description: "Follow the recitation word by word with read-so-far color.", chip: "Read so far" },
  { id: "cinematic", title: "Cinematic", description: "Polished Arabic focus for social-first Quran videos.", chip: "Arabic focus" },
] as const;

export type LandingShowcaseAsset = (typeof LANDING_SHOWCASE)[number] & { src: string };

const imageExtensions = ["webp", "png", "jpg", "jpeg", "avif"] as const;

/** Finds optional first-party finished-video captures without loading any editor code. */
export function getLandingShowcaseAssets(): LandingShowcaseAsset[] {
  return LANDING_SHOWCASE.flatMap((example) => {
    const extension = imageExtensions.find((candidate) => existsSync(join(process.cwd(), "public", "landing", "showcase", `${example.id}.${candidate}`)));
    return extension ? [{ ...example, src: `/landing/showcase/${example.id}.${extension}` }] : [];
  });
}

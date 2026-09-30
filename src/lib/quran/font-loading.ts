import { quranFontDefinitions, type QuranScript } from "./content.ts";

const pendingFonts = new Map<string, Promise<string>>();
const QURAN_FONT_PROBE = "اَلْحَمْدُ لِلَّهِ";

/** Loads and verifies the exact Quran font before any browser or export measurement. */
export function ensureQuranFontLoaded(style: QuranScript, fontSize: number): Promise<string> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.reject(new Error("Quran fonts can only be loaded in a browser."));
  }
  const font = quranFontDefinitions[style];
  if (font.source.includes("{page}")) {
    return Promise.reject(new Error("The selected Madinah/QCF font is page-specific and cannot be measured as one Unicode font."));
  }
  const key = `${font.family}:${font.source}`;
  const existing = pendingFonts.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const spec = `${fontSize}px "${font.family}"`;
    if (!document.fonts.check(spec, QURAN_FONT_PROBE)) {
      const face = new FontFace(font.family, `url(${font.source}) format("woff2")`, { display: "block" });
      document.fonts.add(await face.load());
    }
    await document.fonts.load(spec, QURAN_FONT_PROBE);
    if (!document.fonts.check(spec, QURAN_FONT_PROBE)) {
      throw new Error(`The selected Quran font (${font.family}) did not finish loading.`);
    }
    return font.family;
  })().catch((error) => {
    pendingFonts.delete(key);
    throw error;
  });
  pendingFonts.set(key, promise);
  return promise;
}

export async function ensurePresentationFontsLoaded(options: {
  quranStyle: QuranScript;
  arabicFontSize: number;
  translationFont: string;
  translationFontSize: number;
  transliterationFont: string;
  transliterationFontSize: number;
}): Promise<string> {
  const family = await ensureQuranFontLoaded(options.quranStyle, options.arabicFontSize);
  await Promise.all([
    document.fonts.load(`${options.translationFontSize}px ${options.translationFont}`),
    document.fonts.load(`${options.transliterationFontSize}px ${options.transliterationFont}`),
  ]);
  return family;
}

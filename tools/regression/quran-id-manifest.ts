import type { PassageIdExpectation } from "./passage-id-metrics.ts";

/** Logical fixture registry only. Audio is ignored locally or externally licensed;
 * no copyrighted recitation is checked into this repository. */
export const QURAN_ID_FIXTURES: readonly PassageIdExpectation[] = [
  { id: "al-maarij-opening", category: "repeated phrase", expected: { surah: 70, startAyah: 1, endAyah: 1 } },
  { id: "noisy-surah-74", category: "basmalah present / noisy audio", expected: { surah: 74, startAyah: 1, endAyah: 9 } },
  { id: "duha-no-basmalah", category: "no basmalah / starts mid-ayah", expected: { surah: 93, startAyah: 1, endAyah: 5 } },
  { id: "an-am-continuous", category: "multi-ayah / long silence", expected: { surah: 6, startAyah: 74, endAyah: 77 } },
  { id: "haqqah-long", category: "slow mujawwad", expected: { surah: 69, startAyah: 19, endAyah: 32 } },
  { id: "imran-boundary", category: "ends mid-ayah / similar ayahs", expected: { surah: 3, startAyah: 33, endAyah: 35 } },
  { id: "short-one-ayah", category: "short 1-ayah clip", expected: { surah: 18, startAyah: 57, endAyah: 57 } },
  { id: "fast-tartil", category: "faster tartil", expected: { surah: 112, startAyah: 1, endAyah: 4 } },
] as const;

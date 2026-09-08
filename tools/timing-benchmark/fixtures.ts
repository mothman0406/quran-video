import manualFixtures from "./fixtures/manual-boundaries.json" with { type: "json" };
import { canonicalCtcWords } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import type { BenchmarkWordTiming, TimingFixture } from "./types.ts";

export const MANUAL_TIMING_FIXTURES = manualFixtures as readonly TimingFixture[];

export function canonicalWordsForFixture(fixture: TimingFixture): BenchmarkWordTiming[] {
  const verses = hafsVerses.filter((verse) => {
    const [surah, ayah] = verse.verseKey.split(":").map(Number);
    return surah === fixture.surah && ayah >= fixture.ayahRange.start && ayah <= fixture.ayahRange.end;
  });
  if (verses.length !== fixture.ayahRange.end - fixture.ayahRange.start + 1) throw new Error(`Fixture ${fixture.fixtureId} does not resolve to its complete canonical ayah range.`);
  return canonicalCtcWords(verses).map((word) => ({ ...word, startMs: 0 }));
}

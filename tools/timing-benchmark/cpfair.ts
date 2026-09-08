import type { ReferenceWordTiming, TimingFixture } from "./types.ts";

/** Exact published `cpfair/quran-align` release shape; segment indexes are 0-based and end-exclusive. */
export type CpFairAyahTiming = {
  surah: number;
  ayah: number;
  segments: readonly [number, number, number, number][];
};

/**
 * Converts release segments to benchmark references. One timing segment can
 * cover several words, so only its first start and last end are asserted.
 * This source is machine-generated external reference data, never human truth.
 */
export function importCpFairReference(
  fixture: TimingFixture,
  timing: readonly CpFairAyahTiming[],
  source: string,
): ReferenceWordTiming[] {
  const refs: ReferenceWordTiming[] = [];
  for (const item of timing) {
    if (item.surah !== fixture.surah || item.ayah < fixture.ayahRange.start || item.ayah > fixture.ayahRange.end) continue;
    const verseKey = `${item.surah}:${item.ayah}`;
    for (const [startIndex, endIndex, startMs, endMs] of item.segments) {
      if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex) || endIndex <= startIndex || startMs < 0 || endMs <= startMs) {
        throw new Error(`Invalid cpfair timing segment for ${verseKey}.`);
      }
      refs.push({ verseKey, canonicalWordIndex: startIndex + 1, expectedStartMs: startMs, provenance: "external-reference-dataset", source });
      refs.push({ verseKey, canonicalWordIndex: endIndex, expectedStartMs: endMs, expectedEndMs: endMs, provenance: "external-reference-dataset", source });
    }
  }
  const byKey = new Map<string, ReferenceWordTiming>();
  for (const reference of refs) {
    const key = `${reference.verseKey}#${reference.canonicalWordIndex}`;
    const existing = byKey.get(key);
    if (existing && (existing.expectedStartMs !== reference.expectedStartMs || existing.expectedEndMs !== reference.expectedEndMs)) {
      throw new Error(`Conflicting cpfair boundary reference for ${key}.`);
    }
    byKey.set(key, { ...existing, ...reference });
  }
  return [...byKey.values()].sort((left, right) => left.verseKey.localeCompare(right.verseKey) || left.canonicalWordIndex - right.canonicalWordIndex);
}

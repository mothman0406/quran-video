export type PassageIdExpectation = {
  id: string;
  category: string;
  expected: { surah: number; startAyah: number; endAyah: number };
};

export type PassageIdObservation = {
  id: string;
  topCandidates: readonly { surah: number; startAyah: number; endAyah: number }[];
  accepted: boolean;
};

export function passageIdentificationMetrics(
  fixtures: readonly PassageIdExpectation[],
  observations: readonly PassageIdObservation[],
) {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  let exactSurah = 0;
  let exactStart = 0;
  let exactEnd = 0;
  let top3 = 0;
  let top5 = 0;
  let falseConfidentAcceptance = 0;
  let abstentions = 0;
  let observed = 0;
  for (const fixture of fixtures) {
    const observation = byId.get(fixture.id);
    if (!observation) continue;
    observed += 1;
    const first = observation.topCandidates[0];
    const correct = (candidate: typeof first | undefined) => Boolean(candidate
      && candidate.surah === fixture.expected.surah
      && candidate.startAyah === fixture.expected.startAyah
      && candidate.endAyah === fixture.expected.endAyah);
    if (first?.surah === fixture.expected.surah) exactSurah += 1;
    if (first?.startAyah === fixture.expected.startAyah) exactStart += 1;
    if (first?.endAyah === fixture.expected.endAyah) exactEnd += 1;
    if (observation.topCandidates.slice(0, 3).some(correct)) top3 += 1;
    if (observation.topCandidates.slice(0, 5).some(correct)) top5 += 1;
    if (observation.accepted && !correct(first)) falseConfidentAcceptance += 1;
    if (!observation.accepted) abstentions += 1;
  }
  const rate = (value: number) => observed ? Number((value / observed).toFixed(4)) : null;
  return {
    fixtures: fixtures.length,
    observed,
    exactSurahAccuracy: rate(exactSurah),
    exactStartingAyahAccuracy: rate(exactStart),
    exactEndingAyahAccuracy: rate(exactEnd),
    top3RetrievalRecall: rate(top3),
    top5RetrievalRecall: rate(top5),
    falseConfidentAcceptanceRate: rate(falseConfidentAcceptance),
    abstentionRate: rate(abstentions),
  };
}

/**
 * Development-only registry for real-recording evaluation metadata.
 *
 * This is deliberately separate from recognition and timing logic: values in
 * this registry may be displayed in debug exports and used by the local
 * evaluator, but cannot influence passage identity or caption timing.
 */
export type RealEvaluationFixture = {
  recordingId: string;
  passage: readonly string[];
  truth: "UNKNOWN" | "approximate" | "verified";
  manualStartsMs: Readonly<Record<string, number>>;
};

export const REAL_FASTCONFORMER_EVALUATION_FIXTURES: readonly RealEvaluationFixture[] = [
  {
    recordingId: "surah-6-74-77",
    passage: ["6:74", "6:75", "6:76", "6:77"],
    truth: "approximate",
    manualStartsMs: { "6:74": 9_500, "6:75": 21_000, "6:76": 32_000, "6:77": 44_832 },
  },
  { recordingId: "surah-69-19-32", passage: ["69:19", "69:20", "69:21", "69:22", "69:23", "69:24", "69:25", "69:26", "69:27", "69:28", "69:29", "69:30", "69:31", "69:32"], truth: "UNKNOWN", manualStartsMs: {} },
  { recordingId: "surah-93-1-5", passage: ["93:1", "93:2", "93:3", "93:4", "93:5"], truth: "UNKNOWN", manualStartsMs: {} },
  { recordingId: "surah-3-33-35", passage: ["3:33", "3:34", "3:35"], truth: "UNKNOWN", manualStartsMs: {} },
];

export function findRealEvaluationFixture(verseKeys: readonly string[]) {
  return REAL_FASTCONFORMER_EVALUATION_FIXTURES.find((fixture) => fixture.passage.length === verseKeys.length
    && fixture.passage.every((verseKey, index) => verseKey === verseKeys[index]));
}

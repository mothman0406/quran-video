/**
 * Development-only Quran regression evidence registry.
 *
 * `reviewedBoundaries` are supplied human review only. `machineDiagnostics`
 * are external/model evidence and are intentionally never presented as human
 * ground truth. Media paths are logical locations so private/copyrighted
 * recordings never enter Git or generated reports.
 */
export type RealRegressionFixture = {
  id: string;
  description: string;
  mediaLocation?: "ignored-local-real-recording" | "ignored-quran-align-everyayah-cache";
  provenance: string;
  expectedPassage?: { surah: number; startAyah: number; endAyah: number; forbiddenPassages?: readonly string[] };
  reviewedBoundaries?: readonly { verseKey: string; startMs: number; provenance: "user-reviewed" }[];
  machineDiagnostics?: string;
  expectedFeatures: readonly string[];
  manualValidationRequired: boolean;
};

export const REAL_VIDEO_REGRESSION_FIXTURES: readonly RealRegressionFixture[] = [
  {
    id: "al-maarij-opening",
    description: "User-validated Al-Ma'arij opening previously misidentified as 32:5.",
    provenance: "User-reviewed historical report; original clip is not in this workspace.",
    expectedPassage: { surah: 70, startAyah: 1, endAyah: 1, forbiddenPassages: ["32:5"] },
    expectedFeatures: ["accepted Surah 70 identity", "never select 32:5", "canonical text", "captions"],
    manualValidationRequired: true,
  },
  {
    id: "noisy-surah-74",
    description: "Noisy Al-Muddaththir recording recovered by FastConformer with basmalah evidence.",
    provenance: "Historical FastConformer diagnostic; original recording is not in this workspace.",
    expectedPassage: { surah: 74, startAyah: 1, endAyah: 9 },
    expectedFeatures: ["no prior-surah leakage", "optional basmalah prelude", "canonical captions"],
    manualValidationRequired: true,
  },
  {
    id: "surah-6-74-77",
    description: "Continuous reviewed timing case; 6:77 must stay near 44.8 seconds.",
    provenance: "User-reviewed boundaries retained in tools/timing-benchmark/fixtures/manual-boundaries.json.",
    expectedPassage: { surah: 6, startAyah: 74, endAyah: 77 },
    reviewedBoundaries: [
      { verseKey: "6:74", startMs: 9660, provenance: "user-reviewed" },
      { verseKey: "6:75", startMs: 21696, provenance: "user-reviewed" },
      { verseKey: "6:76", startMs: 32064, provenance: "user-reviewed" },
      { verseKey: "6:77", startMs: 44832, provenance: "user-reviewed" },
    ],
    expectedFeatures: ["6:77 near 44.8s", "never legacy ~50.6s"],
    manualValidationRequired: true,
  },
  {
    id: "surah-69-19-32",
    description: "Long historical FastConformer timing case.",
    provenance: "Historical reviewed timing record; original continuous recording is not in this workspace.",
    expectedPassage: { surah: 69, startAyah: 19, endAyah: 32 },
    reviewedBoundaries: [
      { verseKey: "69:19", startMs: 1950, provenance: "user-reviewed" }, { verseKey: "69:20", startMs: 9281, provenance: "user-reviewed" },
      { verseKey: "69:21", startMs: 13951, provenance: "user-reviewed" }, { verseKey: "69:22", startMs: 16828, provenance: "user-reviewed" },
      { verseKey: "69:23", startMs: 19392, provenance: "user-reviewed" }, { verseKey: "69:24", startMs: 21789, provenance: "user-reviewed" },
      { verseKey: "69:25", startMs: 28429, provenance: "user-reviewed" }, { verseKey: "69:26", startMs: 37457, provenance: "user-reviewed" },
      { verseKey: "69:27", startMs: 40416, provenance: "user-reviewed" }, { verseKey: "69:28", startMs: 44329, provenance: "user-reviewed" },
      { verseKey: "69:29", startMs: 47981, provenance: "user-reviewed" }, { verseKey: "69:30", startMs: 52637, provenance: "user-reviewed" },
      { verseKey: "69:31", startMs: 55142, provenance: "user-reviewed" }, { verseKey: "69:32", startMs: 58498, provenance: "user-reviewed" },
    ],
    machineDiagnostics: "Historical FastConformer summary: median absolute boundary error 189ms, p90 462ms; not human truth for a rerun.",
    expectedFeatures: ["complete 69:19-32 span", "preserve historical record"],
    manualValidationRequired: true,
  },
  {
    id: "surah-93-1-5",
    description: "Basmalah and first-word timing case.",
    provenance: "User-reviewed boundaries retained in tools/timing-benchmark/fixtures/manual-boundaries.json.",
    expectedPassage: { surah: 93, startAyah: 1, endAyah: 5 },
    reviewedBoundaries: [
      { verseKey: "93:1", startMs: 1640, provenance: "user-reviewed" }, { verseKey: "93:2", startMs: 2800, provenance: "user-reviewed" },
      { verseKey: "93:3", startMs: 5460, provenance: "user-reviewed" }, { verseKey: "93:4", startMs: 9400, provenance: "user-reviewed" }, { verseKey: "93:5", startMs: 14680, provenance: "user-reviewed" },
    ],
    expectedFeatures: ["unspoken basmalah does not shift 93:1", "no placeholder prelude"],
    manualValidationRequired: true,
  },
  {
    id: "surah-3-33-35",
    description: "Historical boundary-completion case.",
    provenance: "User-reviewed boundaries retained in tools/timing-benchmark/fixtures/manual-boundaries.json.",
    expectedPassage: { surah: 3, startAyah: 33, endAyah: 35 },
    reviewedBoundaries: [
      { verseKey: "3:33", startMs: 2550, provenance: "user-reviewed" }, { verseKey: "3:34", startMs: 9060, provenance: "user-reviewed" }, { verseKey: "3:35", startMs: 14080, provenance: "user-reviewed" },
    ],
    expectedFeatures: ["complete 3:33-35 span", "not incomplete prefix"],
    manualValidationRequired: true,
  },
  {
    id: "long-ayah-18-57",
    description: "Real long-ayah display segmentation regression.",
    provenance: "Canonical bundled Quran plus automated display fixtures; retained source recording unavailable.",
    expectedPassage: { surah: 18, startAyah: 57, endAyah: 57 },
    expectedFeatures: ["complete canonical words", "multiple contiguous CaptionSegments", "piece translation", "final ornament only", "per-piece highlighting"],
    manualValidationRequired: true,
  },
  {
    id: "portrait-phone-video",
    description: "Portrait source framing regression.",
    provenance: "No retained real portrait source in this workspace.",
    expectedFeatures: ["portrait project default", "contain framing", "preview/export match"],
    manualValidationRequired: true,
  },
  {
    id: "audio-only",
    description: "Audio-only Quran project regression.",
    provenance: "Ignored EveryAyah cache is available for timing only; no browser audio-only project fixture is retained.",
    mediaLocation: "ignored-quran-align-everyayah-cache",
    expectedFeatures: ["recognition", "neutral canvas", "waveform", "playback", "export"],
    manualValidationRequired: true,
  },
];

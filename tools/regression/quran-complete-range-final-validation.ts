import { FROZEN_CANONICAL_RECONSTRUCTION_RULE } from "./canonical-passage-reconstruction.ts";
import { FROZEN_CORE_BOUNDARY_RULE } from "./quran-core-boundary-localizer.ts";
import { FROZEN_BOUNDED_EDGE_RULE } from "./quran-edge-completion.ts";
import { FROZEN_PROVISIONAL_LOCAL_CORE_RULE } from "./quran-local-core.ts";
import { FROZEN_WHOLE_RECORDING_INTEGRITY_RULE } from "./quran-whole-recording-integrity.ts";

export const COMPLETE_RANGE_FINAL_VALIDATION_STARTING_REVISION = "10a598313dd1371341beda254cb5fe10aa077513";
export const COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT = "2026-09-24T05:37:21Z";
export const COMPLETE_RANGE_FINAL_VALIDATION_PROVENANCE = "complete-range-final-external-validation" as const;

/**
 * The complete candidate is imported by identity from the previously frozen
 * modules. Validation fixtures cannot provide or override any rule value.
 */
export const FROZEN_COMPLETE_RANGE_CANDIDATE = Object.freeze({
  canonicalReconstruction: FROZEN_CANONICAL_RECONSTRUCTION_RULE,
  provisionalLocalCore: FROZEN_PROVISIONAL_LOCAL_CORE_RULE,
  wholeRecordingIntegrity: FROZEN_WHOLE_RECORDING_INTEGRITY_RULE,
  coreBoundaryLocalization: FROZEN_CORE_BOUNDARY_RULE,
  boundedEdgeVerification: FROZEN_BOUNDED_EDGE_RULE,
  canonicalCompleteness: Object.freeze({
    inclusive: true,
    ordered: true,
    unique: true,
  }),
});

export type CompleteRangeValidationDesignation = {
  id: string;
  role: "genuine-start-edge" | "genuine-exact-stop" | "negative-reset" | "negative-out-of-order";
  readerGroup: "reader-n" | "reader-o" | "reader-p" | "reader-q";
  publicReader: string;
  publicSource: "EveryAyah";
  sourceDirectory: string;
  sourceRange: { surah: number; startAyah: number; endAyah: number };
  expectedRange: { surah: number; startAyah: number; endAyah: number } | null;
  orderedAyahSegments: readonly { startAyah: number; endAyah: number }[];
  construction: string;
  purpose: string;
  appearedInFinalCandidateDesign: false;
};

/**
 * All four cases were fixed before source acquisition or recognition. Public
 * per-ayah keys are evaluation-only ground truth and are never passed to the
 * recognition decision.
 */
export const COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS: readonly CompleteRangeValidationDesignation[] = Object.freeze([
  Object.freeze({
    id: "complete-range-final-genuine-minshawy-81-8-22",
    role: "genuine-start-edge",
    readerGroup: "reader-n",
    publicReader: "Muhammad Siddiq al-Minshawi (Murattal)",
    publicSource: "EveryAyah",
    sourceDirectory: "Minshawy_Murattal_128kbps",
    sourceRange: Object.freeze({ surah: 81, startAyah: 8, endAyah: 22 }),
    expectedRange: Object.freeze({ surah: 81, startAyah: 8, endAyah: 22 }),
    orderedAyahSegments: Object.freeze([Object.freeze({ startAyah: 8, endAyah: 22 })]),
    construction: "81:8-22",
    purpose: "A short opening ayah at a non-surah edge challenges exact start recovery without permitting 81:7.",
    appearedInFinalCandidateDesign: false,
  }),
  Object.freeze({
    id: "complete-range-final-genuine-jibreel-86-1-12",
    role: "genuine-exact-stop",
    readerGroup: "reader-o",
    publicReader: "Muhammad Jibreel",
    publicSource: "EveryAyah",
    sourceDirectory: "Muhammad_Jibreel_128kbps",
    sourceRange: Object.freeze({ surah: 86, startAyah: 1, endAyah: 12 }),
    expectedRange: Object.freeze({ surah: 86, startAyah: 1, endAyah: 12 }),
    orderedAyahSegments: Object.freeze([Object.freeze({ startAyah: 1, endAyah: 12 })]),
    construction: "86:1-12",
    purpose: "A distinct reader and exact non-terminal stop test that absent 86:13 is not invented.",
    appearedInFinalCandidateDesign: false,
  }),
  Object.freeze({
    id: "complete-range-final-negative-hudhaify-82-reset",
    role: "negative-reset",
    readerGroup: "reader-p",
    publicReader: "Ali al-Hudhaify",
    publicSource: "EveryAyah",
    sourceDirectory: "Hudhaify_32kbps",
    sourceRange: Object.freeze({ surah: 82, startAyah: 1, endAyah: 19 }),
    expectedRange: null,
    orderedAyahSegments: Object.freeze([
      Object.freeze({ startAyah: 1, endAyah: 19 }),
      Object.freeze({ startAyah: 1, endAyah: 6 }),
    ]),
    construction: "82:1-19, 82:1-6",
    purpose: "A complete same-surah passage followed by a substantive reset/repetition must not be one passage.",
    appearedInFinalCandidateDesign: false,
  }),
  Object.freeze({
    id: "complete-range-final-negative-ghamadi-84-out-of-order",
    role: "negative-out-of-order",
    readerGroup: "reader-q",
    publicReader: "Saad al-Ghamdi",
    publicSource: "EveryAyah",
    sourceDirectory: "Ghamadi_40kbps",
    sourceRange: Object.freeze({ surah: 84, startAyah: 1, endAyah: 25 }),
    expectedRange: null,
    orderedAyahSegments: Object.freeze([
      Object.freeze({ startAyah: 16, endAyah: 25 }),
      Object.freeze({ startAyah: 1, endAyah: 8 }),
      Object.freeze({ startAyah: 9, endAyah: 15 }),
    ]),
    construction: "84:16-25, 84:1-8, 84:9-15",
    purpose: "Later ayat followed by a substantial backward jump and partial forward progress must expose ordering contradiction.",
    appearedInFinalCandidateDesign: false,
  }),
]);

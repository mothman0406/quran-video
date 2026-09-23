import { FROZEN_CANONICAL_RECONSTRUCTION_RULE } from "./canonical-passage-reconstruction.ts";

export const CANONICAL_RECONSTRUCTION_VALIDATION_STARTING_REVISION = "40e27ef8d0d3462dc6155fd6ba41b818a39d68f5";
export const CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATED_AT = "2026-09-23T21:47:04Z";
export const CANONICAL_RECONSTRUCTION_HISTORICAL_FIXTURE_DIGEST = "f1fe29ee3bca705c858ee1d767a163fba1b7c64bb10fe5b9766e22c291585b6d";
export const CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE = "canonical-reconstruction-external-validation" as const;

/**
 * The validation imports the already-frozen candidate by identity. Validation
 * fixtures cannot supply, derive, or override any reconstruction parameter.
 */
export const FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE = FROZEN_CANONICAL_RECONSTRUCTION_RULE;

export type CanonicalReconstructionValidationDesignation = {
  id: string;
  role: "positive-a" | "positive-b" | "negative-a" | "negative-b";
  readerGroup: "reader-l" | "reader-m";
  publicReader: string;
  sourceDirectory: string;
  sourceRange: { surah: number; startAyah: number; endAyah: number };
  construction: string;
  orderedAyahSegments: readonly { startAyah: number; endAyah: number }[];
  challenge: string;
  negativeType: string | null;
};

/**
 * Exactly four cases, designated before any source was fetched or recognized.
 * Ground truth is the public per-ayah filename key, never recognition output.
 */
export const CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS: readonly CanonicalReconstructionValidationDesignation[] = Object.freeze([
  Object.freeze({
    id: "canonical-validation-positive-reader-l-100-1-11",
    role: "positive-a",
    readerGroup: "reader-l",
    publicReader: "Abdullah Basfar",
    sourceDirectory: "Abdullah_Basfar_192kbps",
    sourceRange: Object.freeze({ surah: 100, startAyah: 1, endAyah: 11 }),
    construction: "100:1-11",
    orderedAyahSegments: Object.freeze([Object.freeze({ startAyah: 1, endAyah: 11 })]),
    challenge: "Weak start acquisition across the short opening oath sequence.",
    negativeType: null,
  }),
  Object.freeze({
    id: "canonical-validation-positive-reader-m-101-1-11",
    role: "positive-b",
    readerGroup: "reader-m",
    publicReader: "Maher Al-Muaiqly",
    sourceDirectory: "MaherAlMuaiqly128kbps",
    sourceRange: Object.freeze({ surah: 101, startAyah: 1, endAyah: 11 }),
    construction: "101:1-11",
    orderedAyahSegments: Object.freeze([Object.freeze({ startAyah: 1, endAyah: 11 })]),
    challenge: "Repeated opening wording and exact terminal edge without over-extension.",
    negativeType: null,
  }),
  Object.freeze({
    id: "canonical-validation-negative-reader-l-100-reset",
    role: "negative-a",
    readerGroup: "reader-l",
    publicReader: "Abdullah Basfar",
    sourceDirectory: "Abdullah_Basfar_192kbps",
    sourceRange: Object.freeze({ surah: 100, startAyah: 1, endAyah: 11 }),
    construction: "100:1-11, 100:1-5",
    orderedAyahSegments: Object.freeze([
      Object.freeze({ startAyah: 1, endAyah: 11 }),
      Object.freeze({ startAyah: 1, endAyah: 5 }),
    ]),
    challenge: "Same-surah complete progress followed by a short reset and repeat.",
    negativeType: "repeat-after-complete-reset",
  }),
  Object.freeze({
    id: "canonical-validation-negative-reader-m-101-out-of-order",
    role: "negative-b",
    readerGroup: "reader-m",
    publicReader: "Maher Al-Muaiqly",
    sourceDirectory: "MaherAlMuaiqly128kbps",
    sourceRange: Object.freeze({ surah: 101, startAyah: 1, endAyah: 11 }),
    construction: "101:6-11, 101:1-5, 101:6-8",
    orderedAyahSegments: Object.freeze([
      Object.freeze({ startAyah: 6, endAyah: 11 }),
      Object.freeze({ startAyah: 1, endAyah: 5 }),
      Object.freeze({ startAyah: 6, endAyah: 8 }),
    ]),
    challenge: "Same-surah out-of-order reset followed by a partial revisit after progress.",
    negativeType: "out-of-order-partial-revisit",
  }),
]);

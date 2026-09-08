/** Development-only Quran word-timing benchmark contracts. */
export type TimingProvenance =
  | "human-reviewed"
  | "external-reference-dataset"
  | "machine-generated"
  | "unknown";

export type CanonicalWordKey = {
  verseKey: string;
  canonicalWordIndex: number;
};

export type ReferenceWordTiming = CanonicalWordKey & {
  expectedStartMs: number;
  expectedEndMs?: number;
  provenance: TimingProvenance;
  source?: string;
};

/** A reliable ayah onset is useful evidence, but is deliberately not a word-level label. */
export type ReferenceBoundary = {
  verseKey: string;
  expectedStartMs: number;
  provenance: TimingProvenance;
  source?: string;
};

export type TimingFixture = {
  fixtureId: string;
  source: string;
  surah: number;
  ayahRange: { start: number; end: number };
  /** Word-level labels only. Empty means that this fixture cannot score word timing yet. */
  words: readonly ReferenceWordTiming[];
  /** Separate by design: these must never be silently promoted to individual word labels. */
  boundaries: readonly ReferenceBoundary[];
  notes?: string;
  historical?: Record<string, unknown>;
};

export type BenchmarkWordTiming = CanonicalWordKey & {
  canonicalArabic: string;
  startMs: number;
  endMs?: number;
  confidence?: number;
  alignmentScore?: number;
  diagnostics?: Record<string, unknown>;
};

export type WordTimingResult = {
  fixtureId: string;
  engineId: string;
  words: readonly BenchmarkWordTiming[];
  runtime?: {
    totalMs?: number;
    inferencePasses?: number;
    memoryBytes?: number;
    modelBytes?: number;
  };
  diagnostics?: Record<string, unknown>;
};

export type WordTimingEngine = {
  id: string;
  align(input: { fixture: TimingFixture; canonicalWords: readonly BenchmarkWordTiming[] }): Promise<WordTimingResult>;
};

export type CtcTokenDiagnostic = {
  tokenId: number;
  token: string;
  firstAlignedFrame: number;
  lastAlignedFrame: number;
  meanPosterior: number;
};

export type CtcWordDiagnostic = CanonicalWordKey & {
  canonicalArabic: string;
  lexicalRepresentation: string;
  ctcTokens: readonly CtcTokenDiagnostic[];
  firstAlignedFrame: number;
  lastAlignedFrame: number;
  frameToMs: { startMs: number; endMs: number; frameDurationMs: number };
  neighboringBlankPosterior: { before: number | null; after: number | null };
  previousWordEndMs: number | null;
  nextWordStartMs: number | null;
};

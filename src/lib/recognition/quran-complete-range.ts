import { canonicalCtcWords } from "./ctc-forced-alignment.ts";
import { canonicalSpanFromFastConformerIdentification, hafsVerses, type CanonicalSpan, type QuranCorpusVerse } from "./core.ts";
import type { FastConformerIdentificationResult, QuranPassageCandidate } from "./fastconformer-identification.ts";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  type CanonicalPassageWindowEvidence,
  type CanonicalRange,
  type ReconstructedPassage,
} from "./canonical-passage-reconstruction.ts";
import { exposeProvisionalLocalCore, type ProvisionalLocalCore } from "./quran-local-core.ts";
import { validateWholeRecordingIntegrity, type WholeRecordingIntegrityDecision } from "./quran-whole-recording-integrity.ts";
import type { CoreBoundaryLocation } from "./quran-core-boundary-localizer.ts";
import type { EdgeDecision } from "./quran-edge-completion.ts";

export type QuranCorePassage = ReconstructedPassage | ProvisionalLocalCore;
export type QuranIntegrityResult = WholeRecordingIntegrityDecision;
export type QuranBoundaryLocalization = {
  start: CoreBoundaryLocation;
  end: CoreBoundaryLocation;
  coreStartMs: number | null;
  coreEndMs: number | null;
  wholeCoreComplete: boolean;
};
export type QuranEdgeVerification = { start: EdgeDecision; end: EdgeDecision };
export type QuranExactRange = CanonicalRange;

export type QuranCoreDecision = {
  core: QuranCorePassage | null;
  source: "canonical" | "provisional" | null;
  integrity: QuranIntegrityResult | null;
  accepted: boolean;
  whisperFallbackEligible: boolean;
  reason: string | null;
  evidence: readonly CanonicalPassageWindowEvidence[];
};

function candidateEvidence(candidate: QuranPassageCandidate | null, origin: number | null, coherentSurah: number | null) {
  if (!candidate) return null;
  const comparable = origin !== null && coherentSurah !== null
    && candidate.start.surah === coherentSurah && candidate.end.surah === coherentSurah;
  return {
    surah: candidate.start.surah,
    startAyah: candidate.start.ayah,
    endAyah: candidate.end.ayah,
    relativeStartWord: comparable ? candidate.start.globalWordIndex - origin : null,
    relativeEndWord: comparable ? candidate.end.globalWordIndex - origin : null,
    ctc: candidate.normalizedCtcScore,
    coverage: candidate.targetCoverage,
    origin: "independent-window-winner",
  };
}

/** Converts the existing production window results into the frozen shared evidence contract. */
export function canonicalEvidenceFromIdentification(
  identification: FastConformerIdentificationResult,
): CanonicalPassageWindowEvidence[] {
  const coherentPath = new Map((identification.globalHypotheses[0]?.path ?? [])
    .map((entry) => [entry.windowIndex, entry.candidate] as const));
  const coherentCandidates = [...coherentPath.values()].filter((candidate): candidate is QuranPassageCandidate => candidate !== null);
  const origin = coherentCandidates.length ? Math.min(...coherentCandidates.map((candidate) => candidate.start.globalWordIndex)) : null;
  const coherentSurah = coherentCandidates[0]?.start.surah ?? null;
  return identification.windowResults.map((window) => {
    const coherent = coherentPath.get(window.index) ?? null;
    const local = candidateEvidence(window.selectedCandidate, origin, coherentSurah);
    return {
      windowIndex: window.index,
      localWinner: local,
      coherentPathCandidate: coherent && origin !== null ? {
        surah: coherent.start.surah,
        startAyah: coherent.start.ayah,
        endAyah: coherent.end.ayah,
        relativeStartWord: coherent.start.globalWordIndex - origin,
        relativeEndWord: coherent.end.globalWordIndex - origin,
        ctc: coherent.normalizedCtcScore,
        coverage: coherent.targetCoverage,
        origin: "coherent-path",
        origins: [...(coherent.origins ?? [])],
      } : null,
      anchorEvent: window.continuation.event,
    };
  });
}

/** Canonical reconstruction is preferred; provisional evidence never bypasses integrity. */
export function resolveQuranCore(identification: FastConformerIdentificationResult): QuranCoreDecision {
  const evidence = canonicalEvidenceFromIdentification(identification);
  const canonicalDecision = reconstructCanonicalPassage(evidence);
  const canonical = canonicalDecision.passage;
  const provisionalDecision = canonical ? null : exposeProvisionalLocalCore(evidence);
  const provisional = provisionalDecision?.core ?? null;
  const core = canonical ?? provisional;
  if (!core) {
    const rejectionReasons = [...canonicalDecision.rejectionReasons, ...(provisionalDecision?.rejectionReasons ?? [])];
    const unsafeForFallback = rejectionReasons.some((reason) => reason === "surah-inconsistency"
      || reason === "no-dominant-continuous-run" || reason === "no-dominant-forward-run");
    return {
      core: null,
      source: null,
      integrity: null,
      accepted: false,
      whisperFallbackEligible: !unsafeForFallback,
      reason: "no-canonical-or-provisional-core",
      evidence,
    };
  }
  const integrity = validateWholeRecordingIntegrity(core, evidence);
  return {
    core,
    source: canonical ? "canonical" : "provisional",
    integrity,
    accepted: integrity.valid,
    whisperFallbackEligible: false,
    reason: integrity.valid ? null : `whole-recording-integrity:${integrity.vetoes.join(",")}`,
    evidence,
  };
}

export function versesForExactRange(range: QuranExactRange, corpus: readonly QuranCorpusVerse[] = hafsVerses) {
  const expectedKeys = expandCanonicalAyahRange(range).map((ayah) => `${ayah.surah}:${ayah.startAyah}`);
  const byKey = new Map(corpus.map((verse) => [verse.verseKey, verse]));
  const verses = expectedKeys.flatMap((key) => {
    const verse = byKey.get(key);
    return verse ? [verse] : [];
  });
  return verses.length === expectedKeys.length ? verses : [];
}

/** Builds the downstream span from every canonical ayah in the inclusive range. */
export function canonicalSpanFromExactRange(range: QuranExactRange, corpus: readonly QuranCorpusVerse[] = hafsVerses): CanonicalSpan | null {
  const verses = versesForExactRange(range, corpus);
  if (!verses.length) return null;
  const words = canonicalCtcWords(verses);
  const lastVerseKey = verses.at(-1)!.verseKey;
  const lastWordIndex = words.filter((word) => word.verseKey === lastVerseKey).length;
  return canonicalSpanFromFastConformerIdentification({
    start: { surah: range.surah, ayah: range.startAyah, canonicalWordIndex: 1 },
    end: { surah: range.surah, ayah: range.endAyah, canonicalWordIndex: lastWordIndex },
  }, corpus);
}

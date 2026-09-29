import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FROZEN_CANONICAL_RECONSTRUCTION_RULE } from "../src/lib/recognition/canonical-passage-reconstruction.ts";
import {
  FASTCONFORMER_CONTINUATION_ANCHOR_DEFAULTS,
  FASTCONFORMER_IDENTIFICATION_DEFAULTS,
} from "../src/lib/recognition/fastconformer-identification.ts";
import { FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS } from "../src/lib/recognition/passage-decision.ts";
import { FROZEN_BOUNDARY_EVIDENCE_RULE } from "../src/lib/recognition/quran-boundary-acoustics.ts";
import { FROZEN_CORE_BOUNDARY_RULE } from "../src/lib/recognition/quran-core-boundary-localizer.ts";
import { FROZEN_BOUNDED_EDGE_RULE } from "../src/lib/recognition/quran-edge-completion.ts";
import { FROZEN_PROVISIONAL_LOCAL_CORE_RULE } from "../src/lib/recognition/quran-local-core.ts";
import { FROZEN_WHOLE_RECORDING_INTEGRITY_RULE } from "../src/lib/recognition/quran-whole-recording-integrity.ts";

test("the protected production recognition configuration is unchanged from the starting revision", () => {
  assert.deepEqual(FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS, {
    multiWindowMinimumNormalizedCtcScore: -0.6,
    singleWindowMinimumNormalizedCtcScore: -0.35,
    multiWindowMinimumMargin: 0.05,
    singleWindowMinimumMargin: 0.12,
    multiWindowMinimumVoicedExplained: 0.5,
    singleWindowMinimumVoicedExplained: 0.8,
    minimumLexicalUniqueness: 0.08,
  });
  assert.deepEqual(FASTCONFORMER_IDENTIFICATION_DEFAULTS, {
    windowMs: 12_000, hopMs: 6_000, minimumVoicedMs: 1_200,
    coarseCandidateLimit: 48, rerankCandidateLimit: 24,
    globalRerankCandidateLimitWithAnchor: 16, localContinuationCandidateLimit: 24,
    localRerankReservation: 8, minimumCandidateWords: 2,
  });
  assert.deepEqual(FASTCONFORMER_CONTINUATION_ANCHOR_DEFAULTS, {
    minimumNormalizedCtcScore: -0.6, minimumLexicalUniqueness: 0.08,
    minimumTargetCoverage: 0.42, minimumCandidateConfidence: 0.25,
    materiallyStrongerGlobalMargin: 0.05, contradictoryWindowsToReanchor: 2,
  });
  assert.deepEqual(FROZEN_CANONICAL_RECONSTRUCTION_RULE, {
    minimumSupportingWindows: 3, minimumDominantSurahFraction: 0.75,
    minimumRunWindowFraction: 0.75, backwardWordTolerance: 2,
    maximumSkippedCanonicalWords: 6, maximumNoProgressRun: 1,
  });
  assert.deepEqual(FROZEN_PROVISIONAL_LOCAL_CORE_RULE, {
    minimumSupportingWindows: 3, minimumDominantSurahNumerator: 3,
    minimumDominantSurahDenominator: 4, minimumRunWindowNumerator: 3,
    minimumRunWindowDenominator: 4, maximumSkippedAyat: 1, maximumNoProgressWindows: 1,
  });
  assert.deepEqual(FROZEN_WHOLE_RECORDING_INTEGRITY_RULE, { minimumContradictoryRunWindows: 2, resetWordTolerance: 2 });
  assert.deepEqual(FROZEN_CORE_BOUNDARY_RULE, {
    searchSpanMs: 6_000, evaluationWindowMs: 12_000, coarseStepMs: 200, fineStepMs: 40,
    boundaryTokenToleranceMs: 200, boundaryTargetAyahCount: 3, minimumTargetTokenCount: 2,
    requireCompleteBoundaryTarget: true, requireCompleteWholeCore: true,
  });
  assert.deepEqual(FROZEN_BOUNDARY_EVIDENCE_RULE, {
    maximumBoundaryDurationMs: 12_000, minimumVoicedDurationMs: 320,
    requireStrictCandidateWin: true, requireCompleteTargetCoverage: true, maximumExpansionPerEdge: 1,
  });
  assert.deepEqual(FROZEN_BOUNDED_EDGE_RULE, {
    maximumAyahExpansionPerEdge: 1, minimumVoicedDurationMs: 320,
    requireCompleteTargetCoverage: true, requireDirectNoExtensionWin: true,
  });

  const vad = readFileSync(new URL("../src/lib/recognition/vad.ts", import.meta.url), "utf8");
  assert.match(vad, /const FRAME_MS = 96;/u);
  assert.match(vad, /const POSITIVE_SPEECH_THRESHOLD = 0\.45;/u);
  assert.match(vad, /const NEGATIVE_SPEECH_THRESHOLD = 0\.3;/u);
  assert.match(vad, /const MIN_SPEECH_MS = 320;/u);
  assert.match(vad, /preSpeechPadMs: 0,/u);
  assert.match(vad, /redemptionMs: 480,/u);

  const alignment = readFileSync(new URL("../src/lib/recognition/ctc-forced-alignment.ts", import.meta.url), "utf8");
  assert.match(alignment, /confidence < 0\.08/u);
  assert.match(alignment, /after\.startMs - before\.endMs < 80/u);

  const captions = readFileSync(new URL("../src/lib/editor/captions.ts", import.meta.url), "utf8");
  assert.match(captions, /horizontalPadding: 20,/u);
  assert.match(captions, /verticalPadding: 16,/u);
  assert.match(captions, /fadeInMs: 225,/u);
  assert.match(captions, /fadeOutMs: 225,/u);
});

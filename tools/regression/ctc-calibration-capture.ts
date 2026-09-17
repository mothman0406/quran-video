export type CalibrationOutcome = "positive" | "negative" | "observational";

export type CalibrationExpectation = {
  outcome: CalibrationOutcome;
  intent: string;
  surah: number | null;
  startAyah: number | null;
  endAyah: number | null;
};

export type CtcCalibrationCapture = {
  schemaVersion: 1;
  id: string;
  expected: CalibrationExpectation;
  totalGeneratedWindows: number;
  usableWindows: number;
  windows: Array<{
    index: number;
    voicedMs: number;
    coherentPathCtc: number | null;
    targetCoverage: number | null;
    targetTokenCount: number | null;
    anchorActive: boolean;
    anchorEvent: string;
    candidateOrigins: string[];
  }>;
  agreeingWindowCount: number;
  coherentRatio: number;
  coverage: number;
  longestUnsupportedRun: number;
  margin: number | null;
  lexicalUniqueness: number | null;
  structuralValidity: boolean;
  surahConsistency: boolean;
  bestWindowCtc: number | null;
  coherentPathMeanCtc: number | null;
  fastConformerProposedRange: { surah: number; startAyah: number; endAyah: number } | null;
  fastConformerOutcome: "accepted" | "abstained";
  finalProposedRange: { surah: number; startAyah: number; endAyah: number } | null;
  finalOutcome: "accepted" | "abstained" | null;
  finalAuthority: string | null;
  failedAcceptanceRules: string[];
};

type DebugEvent = { event: string; facts: Record<string, unknown> };

const DEBUG_PREFIX = "[Quran AutoCaption debug]";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`Missing or invalid ${label}.`);
  return value as number;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function proposedRange(value: Record<string, unknown> | null) {
  const surah = numberOrNull(value?.proposedSurah);
  const startAyah = numberOrNull(value?.startAyah);
  const endAyah = numberOrNull(value?.endAyah);
  return surah === null || startAyah === null || endAyah === null ? null : { surah, startAyah, endAyah };
}

export function parseMediaDebugEvents(input: string): DebugEvent[] {
  const events: DebugEvent[] = [];
  for (const line of input.split(/\r?\n/u)) {
    const prefix = line.indexOf(DEBUG_PREFIX);
    if (prefix < 0) continue;
    const payload = line.slice(prefix + DEBUG_PREFIX.length).trim();
    const separator = payload.indexOf(" ");
    if (separator < 1) continue;
    const event = payload.slice(0, separator);
    const json = payload.slice(separator + 1).trim();
    try {
      const facts = object(JSON.parse(json));
      if (facts) events.push({ event, facts });
    } catch {
      // Copied DevTools output can include unrelated or truncated console rows.
    }
  }
  return events;
}

function lastEvent(events: readonly DebugEvent[], name: string) {
  return events.findLast((entry) => entry.event === name)?.facts ?? null;
}

export function createCtcCalibrationCapture(
  input: string,
  metadata: { id: string; expected: CalibrationExpectation },
): CtcCalibrationCapture {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/u.test(metadata.id)) throw new Error("Calibration id must be a lowercase, hyphenated identifier.");
  if (!metadata.expected.intent.trim()) throw new Error("Calibration intent is required.");
  const events = parseMediaDebugEvents(input);
  const vad = lastEvent(events, "vad-window-summary");
  const final = lastEvent(events, "final-passage-decision");
  if (!vad || !final) throw new Error("The log must contain vad-window-summary and final-passage-decision debug events.");

  const gateInputs = events.filter((entry) => entry.event === "ctc-gate-input").map((entry) => entry.facts);
  const windowResults = new Map(events.filter((entry) => entry.event === "fastconformer-window-result").map((entry) => [numberOrNull(entry.facts.index), entry.facts]));
  const vadWindows = new Map((Array.isArray(vad.windows) ? vad.windows : []).flatMap((entry) => {
    const facts = object(entry);
    const index = numberOrNull(facts?.index);
    return facts && index !== null ? [[index, facts] as const] : [];
  }));
  const windows = gateInputs.map((gate) => {
    const index = integer(gate.windowIndex, "window index");
    const candidate = object(gate.coherentPathCandidate);
    const continuation = object(windowResults.get(index)?.continuation);
    return {
      index,
      voicedMs: integer(gate.voicedMs ?? vadWindows.get(index)?.voicedMs, `voicedMs for window ${index}`),
      coherentPathCtc: numberOrNull(candidate?.normalizedCtcScore),
      targetCoverage: numberOrNull(candidate?.targetCoverage),
      targetTokenCount: numberOrNull(candidate?.targetTokenCount),
      anchorActive: continuation?.anchorActive === true,
      anchorEvent: typeof continuation?.event === "string" ? continuation.event : "unknown",
      candidateOrigins: stringArray(candidate?.origins),
    };
  }).sort((left, right) => left.index - right.index);
  if (!windows.length) throw new Error("The log does not contain any ctc-gate-input events.");

  const finalIdentity = lastEvent(events, "final-identity-decision");
  const finalDecision = final.decision === "accepted" ? "accepted" : "abstained";
  const finalOutcome = finalIdentity?.decision === "accepted" ? "accepted" : finalIdentity?.decision === "abstained" ? "abstained" : null;
  return {
    schemaVersion: 1,
    id: metadata.id,
    expected: { ...metadata.expected, intent: metadata.expected.intent.trim() },
    totalGeneratedWindows: integer(vad.totalGeneratedIdentificationWindows, "total generated window count"),
    usableWindows: integer(final.usableWindowCount, "usable window count"),
    windows,
    agreeingWindowCount: integer(final.agreeingWindowCount, "agreeing window count"),
    coherentRatio: numberOrNull(final.coherentRatio) ?? 0,
    coverage: numberOrNull(final.coverage) ?? 0,
    longestUnsupportedRun: integer(final.longestUnsupportedRun, "longest unsupported run"),
    margin: numberOrNull(final.margin),
    lexicalUniqueness: numberOrNull(final.lexicalUniqueness),
    structuralValidity: final.structuralValidity === true,
    surahConsistency: final.surahConsistency === true,
    bestWindowCtc: numberOrNull(final.bestWindowCtc),
    coherentPathMeanCtc: numberOrNull(final.coherentPathMeanCtc),
    fastConformerProposedRange: proposedRange(final),
    fastConformerOutcome: finalDecision,
    finalProposedRange: proposedRange(finalIdentity),
    finalOutcome,
    finalAuthority: typeof finalIdentity?.authority === "string" ? finalIdentity.authority : null,
    failedAcceptanceRules: stringArray(final.failedAcceptanceRules),
  };
}

export function summarizeCtcCalibrationCapture(capture: CtcCalibrationCapture) {
  const coherent = capture.windows.filter((window) => window.coherentPathCtc !== null);
  const strongest = coherent.reduce<typeof coherent[number] | null>((best, window) => best === null || window.coherentPathCtc! > best.coherentPathCtc! ? window : best, null);
  return {
    id: capture.id,
    expectedOutcome: capture.expected.outcome,
    windows: `${coherent.length}/${capture.totalGeneratedWindows} coherent`,
    strongestWindow: strongest ? { index: strongest.index, ctc: strongest.coherentPathCtc } : null,
    anchorEvents: capture.windows.filter((window) => window.anchorEvent !== "none").map((window) => ({ index: window.index, event: window.anchorEvent })),
    fastConformerOutcome: capture.fastConformerOutcome,
    finalOutcome: capture.finalOutcome,
    failedAcceptanceRules: capture.failedAcceptanceRules,
  };
}

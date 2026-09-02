export type VadSpeechRegion = {
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Mean Silero speech probability across the positively-classified frames. */
  confidence: number;
};

const MIN_SPEECH_MS = 320;
const INTERRUPTION_BRIDGE_MS = 320;

function clampMs(value: number, durationMs: number) {
  return Math.max(0, Math.min(durationMs, Math.round(value)));
}

/** Exported separately so the important smoothing rules stay deterministic. */
export function smoothVadSpeechRegions(
  input: readonly VadSpeechRegion[],
  durationMs: number,
  interruptionBridgeMs = INTERRUPTION_BRIDGE_MS,
): VadSpeechRegion[] {
  const regions: VadSpeechRegion[] = [];
  for (const candidate of [...input].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)) {
    const startMs = clampMs(candidate.startMs, durationMs);
    const endMs = clampMs(candidate.endMs, durationMs);
    if (endMs - startMs < MIN_SPEECH_MS) continue;
    const previous = regions.at(-1);
    // Preserve phrase boundaries, but do not split ordinary tajweed pauses or
    // breaths into separate recovery jobs.
    if (previous && startMs - previous.endMs <= interruptionBridgeMs) {
      const previousDuration = previous.durationMs;
      const candidateDuration = endMs - startMs;
      previous.endMs = Math.max(previous.endMs, endMs);
      previous.durationMs = previous.endMs - previous.startMs;
      previous.confidence = Number(((previous.confidence * previousDuration + candidate.confidence * candidateDuration)
        / Math.max(1, previousDuration + candidateDuration)).toFixed(4));
    } else {
      regions.push({
        startMs,
        endMs,
        durationMs: endMs - startMs,
        confidence: Number(candidate.confidence.toFixed(4)),
      });
    }
  }
  return regions;
}

export function speechRegionContaining(
  regions: readonly VadSpeechRegion[] | undefined,
  startMs: number,
  endMs = startMs,
): VadSpeechRegion | null {
  if (!regions?.length) return null;
  return regions.find((region) => startMs < region.endMs && endMs >= region.startMs) ?? null;
}

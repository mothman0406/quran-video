/**
 * Small, serialisable representation of decoded local audio.  The PCM itself
 * stays in memory for the recognition job; alignment only needs this 10 ms
 * energy envelope, which is linear to build and inexpensive to inspect.
 */
export type AudioAnalysis = {
  sampleRate: number;
  durationMs: number;
  windowMs: number;
  rms: number[];
};

export function analyzeMonoPcm(audio: Float32Array, sampleRate: number, windowMs = 10): AudioAnalysis {
  const samplesPerWindow = Math.max(1, Math.round(sampleRate * windowMs / 1_000));
  const rms: number[] = [];
  for (let start = 0; start < audio.length; start += samplesPerWindow) {
    const end = Math.min(audio.length, start + samplesPerWindow);
    let total = 0;
    for (let index = start; index < end; index += 1) total += audio[index] * audio[index];
    rms.push(Math.sqrt(total / Math.max(1, end - start)));
  }
  return { sampleRate, durationMs: Math.round(audio.length / sampleRate * 1_000), windowMs, rms };
}

function windowAt(analysis: AudioAnalysis, ms: number) {
  return Math.max(0, Math.min(analysis.rms.length - 1, Math.floor(ms / analysis.windowMs)));
}

function adaptiveThreshold(analysis: AudioAnalysis, fromMs: number, toMs: number) {
  const from = windowAt(analysis, fromMs);
  const to = windowAt(analysis, toMs);
  const values = analysis.rms.slice(Math.min(from, to), Math.max(from, to) + 1).sort((left, right) => left - right);
  if (!values.length) return 0;
  // A local 20th percentile is resilient to steady room noise and avoids the
  // invalid "PCM zero equals silence" assumption.
  const floor = values[Math.floor((values.length - 1) * 0.2)] ?? 0;
  const peak = values.at(-1) ?? floor;
  return floor + (peak - floor) * 0.16;
}

export type LocalEnergyBoundary = {
  speechOffsetMs: number;
  speechOnsetMs: number;
  foundGap: boolean;
};

/**
 * Looks only inside the text-derived corridor.  It deliberately has no API
 * for globally segmenting silence, so a breath within an ayah cannot become a
 * verse boundary.
 */
export function refineTransitionWithEnergy(
  analysis: AudioAnalysis,
  previousWordEndMs: number,
  nextWordStartMs: number,
): LocalEnergyBoundary | null {
  if (!analysis.rms.length || nextWordStartMs <= previousWordEndMs) return null;
  const padding = 180;
  const fromMs = Math.max(0, previousWordEndMs - padding);
  const toMs = Math.min(analysis.durationMs, nextWordStartMs + padding);
  const threshold = adaptiveThreshold(analysis, fromMs, toMs);
  const start = windowAt(analysis, fromMs);
  const end = windowAt(analysis, toMs);
  let quietStart = -1;
  let best: { start: number; end: number } | null = null;
  for (let index = start; index <= end; index += 1) {
    const quiet = (analysis.rms[index] ?? Infinity) <= threshold;
    if (quiet && quietStart < 0) quietStart = index;
    if ((!quiet || index === end) && quietStart >= 0) {
      const quietEnd = quiet && index === end ? index + 1 : index;
      const corridorMidpoint = (previousWordEndMs + nextWordStartMs) / 2;
      const candidate = { start: quietStart, end: quietEnd };
      const candidateMidpoint = (candidate.start + candidate.end) * analysis.windowMs / 2;
      const previousBestMidpoint = best ? (best.start + best.end) * analysis.windowMs / 2 : Infinity;
      if (!best || Math.abs(candidateMidpoint - corridorMidpoint) < Math.abs(previousBestMidpoint - corridorMidpoint)) best = candidate;
      quietStart = -1;
    }
  }
  if (!best || (best.end - best.start) * analysis.windowMs < 30) return null;
  return {
    speechOffsetMs: Math.round(best.start * analysis.windowMs),
    speechOnsetMs: Math.round(best.end * analysis.windowMs),
    foundGap: true,
  };
}

export function refineWordEdgeWithEnergy(
  analysis: AudioAnalysis,
  wordMs: number,
  direction: "start" | "end",
): number | null {
  if (!analysis.rms.length) return null;
  const radiusMs = 240;
  const fromMs = Math.max(0, wordMs - radiusMs);
  const toMs = Math.min(analysis.durationMs, wordMs + radiusMs);
  const threshold = adaptiveThreshold(analysis, fromMs, toMs);
  const edge = windowAt(analysis, wordMs);
  const lower = windowAt(analysis, fromMs);
  const upper = windowAt(analysis, toMs);
  if (direction === "start") {
    for (let index = edge; index >= lower; index -= 1) {
      if ((analysis.rms[index] ?? 0) <= threshold) return Math.round((index + 1) * analysis.windowMs);
    }
  } else {
    for (let index = edge; index <= upper; index += 1) {
      if ((analysis.rms[index] ?? 0) <= threshold) return Math.round(index * analysis.windowMs);
    }
  }
  return null;
}

/**
 * Refines the beginning of the first detected ayah inside a text-derived
 * corridor. This deliberately cannot inspect the earlier recording: PCM can
 * make a boundary more exact, but cannot decide where Quran recitation began.
 */
export function refineFirstAyahOnsetWithEnergy(
  analysis: AudioAnalysis,
  anchorStartMs: number,
  lookbackMs: number,
  forwardToleranceMs = 180,
): number | null {
  if (!analysis.rms.length) return null;
  const fromMs = Math.max(0, anchorStartMs - Math.max(0, lookbackMs));
  const toMs = Math.min(analysis.durationMs, anchorStartMs + Math.max(0, forwardToleranceMs));
  const threshold = adaptiveThreshold(analysis, fromMs, toMs);
  const start = windowAt(analysis, fromMs);
  const end = windowAt(analysis, toMs);
  let quietStart = -1;
  let closestQuietEnd: number | null = null;
  for (let index = start; index <= end; index += 1) {
    const quiet = (analysis.rms[index] ?? Infinity) <= threshold;
    if (quiet && quietStart < 0) quietStart = index;
    if ((!quiet || index === end) && quietStart >= 0) {
      const quietEnd = quiet && index === end ? index + 1 : index;
      if ((quietEnd - quietStart) * analysis.windowMs >= 30) {
        const candidateMs = quietEnd * analysis.windowMs;
        if (candidateMs <= anchorStartMs + forwardToleranceMs
          && (closestQuietEnd === null || Math.abs(candidateMs - anchorStartMs) < Math.abs(closestQuietEnd - anchorStartMs))) {
          closestQuietEnd = candidateMs;
        }
      }
      quietStart = -1;
    }
  }
  return closestQuietEnd === null ? null : Math.round(closestQuietEnd);
}

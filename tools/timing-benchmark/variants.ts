/** Deterministic, evaluation-only PCM degradations. Never use these as real-noise replacements. */
export type AudioVariant =
  | { id: "clean" }
  | { id: "room-noise"; snrDb: number; seed: number }
  | { id: "gain-reduction"; gainDb: number }
  | { id: "mild-reverb"; decayMs: number; mix: number };

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, samples.length));
}

/** Applies deliberately named, reproducible benchmark perturbations to legally usable clean PCM. */
export function createBenchmarkAudioVariant(samples: Float32Array, sampleRate: number, variant: AudioVariant) {
  if (variant.id === "clean") return new Float32Array(samples);
  if (variant.id === "gain-reduction") {
    const scale = 10 ** (variant.gainDb / 20);
    return Float32Array.from(samples, (sample) => sample * scale);
  }
  if (variant.id === "room-noise") {
    const random = seededRandom(variant.seed);
    const noise = Float32Array.from(samples, () => random() * 2 - 1);
    const noiseRms = rms(noise);
    const targetNoiseRms = rms(samples) / (10 ** (variant.snrDb / 20));
    return Float32Array.from(samples, (sample, index) => sample + noise[index]! / Math.max(Number.EPSILON, noiseRms) * targetNoiseRms);
  }
  const delaySamples = Math.max(1, Math.round(variant.decayMs * sampleRate / 1_000));
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) output[index] = samples[index]! * (1 - variant.mix) + (index >= delaySamples ? samples[index - delaySamples]! * variant.mix : 0);
  return output;
}

/**
 * Timestamp expectation for a true playback-speed transform. Audio generation
 * is intentionally left to a high-quality decoder/resampler; linear PCM
 * interpolation would itself contaminate an accuracy benchmark.
 */
export function transformTimestampForPlaybackSpeed(timestampMs: number, speed: 0.9 | 1 | 1.1) {
  return Number((timestampMs / speed).toFixed(6));
}

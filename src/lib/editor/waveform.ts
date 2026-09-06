import type { TimelineViewport } from "./media.ts";

export const WAVEFORM_PEAK_COUNT = 8_192;

export type WaveformPeak = { min: number; max: number };
export type WaveformData = { peaks: WaveformPeak[]; durationMs: number };

/** Compact min/max envelope; PCM is discarded immediately after this pass. */
export function waveformPeaksFromPcm(channels: readonly Float32Array[], peakCount = WAVEFORM_PEAK_COUNT): WaveformPeak[] {
  const frameCount = Math.max(0, ...channels.map((channel) => channel.length));
  if (!frameCount || !channels.length) return [];
  const count = Math.max(1, Math.min(peakCount, frameCount));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * frameCount / count);
    const end = Math.max(start + 1, Math.floor((index + 1) * frameCount / count));
    let min = 0;
    let max = 0;
    for (let frame = start; frame < end; frame += 1) for (const channel of channels) {
      const sample = channel[frame] ?? 0;
      min = Math.min(min, sample);
      max = Math.max(max, sample);
    }
    return { min, max };
  });
}

/** Downsamples cached source peaks into one envelope bar per rendered column. */
export function waveformPeaksForViewport(data: WaveformData | null, viewport: TimelineViewport, targetCount: number): WaveformPeak[] {
  if (!data?.peaks.length || data.durationMs <= 0) return [];
  const start = Math.floor(viewport.visibleStartMs / data.durationMs * data.peaks.length);
  const end = Math.ceil(viewport.visibleEndMs / data.durationMs * data.peaks.length);
  const source = data.peaks.slice(Math.max(0, start), Math.min(data.peaks.length, Math.max(start + 1, end)));
  const count = Math.max(1, Math.min(Math.max(1, Math.round(targetCount)), source.length));
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor(index * source.length / count);
    const to = Math.max(from + 1, Math.floor((index + 1) * source.length / count));
    return source.slice(from, to).reduce<WaveformPeak>((peak, value) => ({ min: Math.min(peak.min, value.min), max: Math.max(peak.max, value.max) }), { min: 0, max: 0 });
  });
}

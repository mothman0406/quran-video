/**
 * Small streaming WSOLA-style tempo processor. It preserves the source sample
 * rate (and therefore perceived pitch) while changing duration. It keeps only
 * a short rolling source window, so 0.5x exports do not retain an entire PCM
 * recording in memory.
 */
const WINDOW_FRAMES = 2_048;
const OUTPUT_HOP = 512;
const SEARCH_RADIUS = 128;
const MATCH_FRAMES = 256;

function correlation(read: (frame: number) => number, left: number, right: number): number {
  let dot = 0; let leftEnergy = 0; let rightEnergy = 0;
  for (let index = 0; index < MATCH_FRAMES; index += 1) {
    const a = read(left + index); const b = read(right + index);
    dot += a * b; leftEnergy += a * a; rightEnergy += b * b;
  }
  return dot / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy));
}

export class StreamingWsola {
  private readonly analysisHop: number;
  private readonly channels: Float32Array[];
  private readonly rate: number;
  private readonly sampleRate: number;
  private readonly numberOfChannels: number;
  private bufferStart = 0;
  private bufferLength = 0;
  private previousStart: number | null = null;
  private nextStart: number | null = null;
  private pending: Float32Array[] | null = null;
  private emittedFrames = 0;

  constructor(rate: number, sampleRate: number, numberOfChannels: number) {
    this.rate = rate;
    this.sampleRate = sampleRate;
    this.numberOfChannels = numberOfChannels;
    this.analysisHop = OUTPUT_HOP * this.rate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(WINDOW_FRAMES * 8));
  }

  append(buffer: AudioBuffer, targetOutputFrames = Number.POSITIVE_INFINITY): AudioBuffer[] {
    if (buffer.sampleRate !== this.sampleRate || buffer.numberOfChannels !== this.numberOfChannels) throw new Error("Source audio format changed during export.");
    this.ensureCapacity(buffer.length);
    for (let channel = 0; channel < this.numberOfChannels; channel += 1) this.channels[channel].set(buffer.getChannelData(channel), this.bufferLength);
    this.bufferLength += buffer.length;
    return this.process(false, targetOutputFrames - this.emittedFrames);
  }

  finish(outputFrames: number): AudioBuffer[] {
    // Only a bounded tail is padded; the requested output duration determines
    // completion and prevents the slower rate from producing unbounded audio.
    this.ensureCapacity(WINDOW_FRAMES + SEARCH_RADIUS);
    this.bufferLength += WINDOW_FRAMES + SEARCH_RADIUS;
    return this.process(true, outputFrames - this.emittedFrames);
  }

  private ensureCapacity(extraFrames: number) {
    const needed = this.bufferLength + extraFrames;
    if (needed <= this.channels[0].length) return;
    const keepFrom = Math.max(this.bufferStart, (this.previousStart ?? this.bufferStart) + OUTPUT_HOP - SEARCH_RADIUS);
    const drop = Math.max(0, Math.min(this.bufferLength, keepFrom - this.bufferStart));
    if (drop) {
      for (const channel of this.channels) channel.copyWithin(0, drop, this.bufferLength);
      this.bufferStart += drop;
      this.bufferLength -= drop;
    }
    if (this.bufferLength + extraFrames <= this.channels[0].length) return;
    const capacity = Math.max(this.channels[0].length * 2, this.bufferLength + extraFrames + WINDOW_FRAMES);
    for (let index = 0; index < this.channels.length; index += 1) {
      const replacement = new Float32Array(capacity);
      replacement.set(this.channels[index].subarray(0, this.bufferLength));
      this.channels[index] = replacement;
    }
  }

  private read(channel: number, absoluteFrame: number): number {
    const index = absoluteFrame - this.bufferStart;
    return index >= 0 && index < this.bufferLength ? this.channels[channel][index] : 0;
  }

  private window(start: number): Float32Array[] {
    return Array.from({ length: this.numberOfChannels }, (_, channel) => Float32Array.from({ length: WINDOW_FRAMES }, (_, index) => this.read(channel, start + index)));
  }

  private chooseStart(target: number): number {
    const previous = this.previousStart;
    if (previous === null) return target;
    const min = Math.max(this.bufferStart, target - SEARCH_RADIUS);
    const max = Math.min(this.bufferStart + this.bufferLength - WINDOW_FRAMES, target + SEARCH_RADIUS);
    let selected = Math.max(min, Math.min(max, target));
    let best = -Infinity;
    const previousOverlap = previous + OUTPUT_HOP;
    for (let candidate = min; candidate <= max; candidate += 1) {
      const score = correlation((frame) => this.read(0, frame), previousOverlap, candidate);
      if (score > best) { best = score; selected = candidate; }
    }
    return selected;
  }

  private createOutput(frames: number): AudioBuffer {
    const output = new AudioBuffer({ length: frames, numberOfChannels: this.numberOfChannels, sampleRate: this.sampleRate });
    if (!this.pending) return output;
    for (let channel = 0; channel < this.numberOfChannels; channel += 1) output.getChannelData(channel).set(this.pending[channel].subarray(0, frames));
    return output;
  }

  private process(final: boolean, targetOutputFrames = Number.POSITIVE_INFINITY): AudioBuffer[] {
    const output: AudioBuffer[] = [];
    let emitted = 0;
    if (!this.pending && this.bufferLength >= WINDOW_FRAMES) {
      const first = this.bufferStart;
      this.pending = this.window(first);
      this.previousStart = first;
      this.nextStart = first + this.analysisHop;
    }
    while (this.pending && this.nextStart !== null && emitted < targetOutputFrames) {
      const target = Math.round(this.nextStart);
      if (!final && target + WINDOW_FRAMES + SEARCH_RADIUS > this.bufferStart + this.bufferLength) break;
      const selected = this.chooseStart(target);
      const current = this.window(selected);
      const frameCount = Math.min(OUTPUT_HOP, targetOutputFrames - emitted);
      output.push(this.createOutput(frameCount));
      emitted += frameCount;
      this.emittedFrames += frameCount;
      for (let channel = 0; channel < this.numberOfChannels; channel += 1) {
        const pending = this.pending[channel];
        pending.copyWithin(0, OUTPUT_HOP);
        pending.fill(0, WINDOW_FRAMES - OUTPUT_HOP);
        const overlap = WINDOW_FRAMES - OUTPUT_HOP;
        for (let index = 0; index < overlap; index += 1) {
          const mix = index / overlap;
          pending[index] = pending[index] * (1 - mix) + current[channel][index] * mix;
        }
        pending.set(current[channel].subarray(overlap), overlap);
      }
      this.previousStart = selected;
      this.nextStart = selected + this.analysisHop;
    }
    return output;
  }
}

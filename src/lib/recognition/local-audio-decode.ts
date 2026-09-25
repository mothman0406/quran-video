import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";

export type DecodedAudioChannels = {
  sampleRate: number;
  frameCount: number;
  /** Caller-owned PCM. The recognition client creates a disposable transfer copy. */
  channelBuffers: ArrayBuffer[];
};

export const RECOGNITION_SAMPLE_RATE = 16_000;

export type DemuxedAudioDecodeOptions = {
  trackId: number;
  durationMs: number;
  signal?: AbortSignal;
  onProgress?(processedTimeMs: number): void;
  onMetrics?(metrics: {
    metadataMilliseconds: number;
    demuxAndDecodeMilliseconds: number;
    downmixAndResampleMilliseconds: number;
    decodedSampleCount: number;
  }): void;
};

function assertUsableDecodedAudio(decoded: DecodedAudioChannels): void {
  if (!Number.isFinite(decoded.sampleRate) || decoded.sampleRate <= 0
    || !Number.isSafeInteger(decoded.frameCount) || decoded.frameCount <= 0
    || decoded.channelBuffers.length === 0) {
    throw new Error("Decoded audio metadata is unusable.");
  }
  for (const buffer of decoded.channelBuffers) {
    if (buffer.byteLength !== decoded.frameCount * Float32Array.BYTES_PER_ELEMENT) {
      throw new Error("Decoded audio channel length is unusable.");
    }
    const channel = new Float32Array(buffer);
    for (const sample of channel) {
      if (!Number.isFinite(sample)) throw new Error("Decoded audio contains a non-finite sample.");
    }
  }
}

/**
 * Completes native media preparation outside the Quran worker. The output is
 * always one 16 kHz mono caller-owned channel, matching FFmpeg's f32le
 * extraction contract.
 */
export function canonicalizeNativeRecognitionPcm(decoded: DecodedAudioChannels): DecodedAudioChannels {
  assertUsableDecodedAudio(decoded);
  const channels = decoded.channelBuffers.map((buffer) => new Float32Array(buffer));
  const frameCount = Math.ceil(decoded.frameCount * RECOGNITION_SAMPLE_RATE / decoded.sampleRate);
  const mono = new Float32Array(frameCount);
  for (let frame = 0; frame < mono.length; frame += 1) {
    const position = frame * decoded.sampleRate / RECOGNITION_SAMPLE_RATE;
    const before = Math.floor(position);
    const after = Math.min(before + 1, decoded.frameCount - 1);
    const blend = position - before;
    let sample = 0;
    for (const channel of channels) sample += (channel[before] ?? 0) * (1 - blend) + (channel[after] ?? 0) * blend;
    mono[frame] = sample / Math.max(1, channels.length);
  }
  return { sampleRate: RECOGNITION_SAMPLE_RATE, frameCount: mono.length, channelBuffers: [mono.buffer] };
}

export function writePlanarAudioToCanonicalPcm(
  output: Float32Array,
  channels: readonly Float32Array[],
  sampleRate: number,
  timestampSeconds: number,
): number {
  if (!channels.length || !channels[0]?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  const sourceFrameCount = channels[0].length;
  const startFrame = Math.max(0, Math.ceil(timestampSeconds * RECOGNITION_SAMPLE_RATE));
  const endFrame = Math.min(
    output.length,
    Math.ceil((timestampSeconds + sourceFrameCount / sampleRate) * RECOGNITION_SAMPLE_RATE),
  );
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const position = (frame / RECOGNITION_SAMPLE_RATE - timestampSeconds) * sampleRate;
    const before = Math.max(0, Math.min(sourceFrameCount - 1, Math.floor(position)));
    const after = Math.min(before + 1, sourceFrameCount - 1);
    const blend = Math.max(0, Math.min(1, position - before));
    let sample = 0;
    for (const channel of channels) sample += (channel[before] ?? 0) * (1 - blend) + (channel[after] ?? 0) * blend;
    output[frame] = sample / channels.length;
  }
  return Math.max(0, endFrame - startFrame);
}

/**
 * Mediabunny demuxes only the selected audio track and AudioSampleSink decodes
 * only its packets. The video track is never decoded or copied into an
 * ArrayBuffer. Decoded samples are immediately downmixed/resampled into the
 * sole caller-owned 16 kHz mono output and then released.
 */
export async function decodeDemuxedAudioToCanonicalPcm(
  source: File,
  options: DemuxedAudioDecodeOptions,
): Promise<DecodedAudioChannels> {
  if (options.signal?.aborted) throw new DOMException("Media preparation cancelled.", "AbortError");
  const frameCount = Math.ceil(options.durationMs * RECOGNITION_SAMPLE_RATE / 1_000);
  if (!Number.isSafeInteger(frameCount) || frameCount <= 0) throw new Error("Audio duration is unusable.");
  const mono = new Float32Array(frameCount);
  const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
  const abortInput = () => input.dispose();
  options.signal?.addEventListener("abort", abortInput, { once: true });
  let decodedFrames = 0;
  let decodedSampleCount = 0;
  let demuxAndDecodeMilliseconds = 0;
  let downmixAndResampleMilliseconds = 0;
  const metadataStartedAt = performance.now();
  try {
    if (!await input.canRead()) throw new Error("Media container is unreadable.");
    const track = (await input.getAudioTracks()).find((candidate) => candidate.id === options.trackId);
    if (!track) throw new Error("The selected audio track is unavailable.");
    if (!await track.canDecode()) throw new Error("The selected audio track cannot be decoded by this browser.");
    const metadataMilliseconds = performance.now() - metadataStartedAt;
    const sink = new AudioSampleSink(track);
    const samples = sink.samples();
    while (true) {
      const acquisitionStartedAt = performance.now();
      const next = await samples.next();
      demuxAndDecodeMilliseconds += performance.now() - acquisitionStartedAt;
      if (next.done) break;
      const sample = next.value;
      if (options.signal?.aborted) throw new DOMException("Media preparation cancelled.", "AbortError");
      try {
        const processingStartedAt = performance.now();
        const channels = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
          const channel = new Float32Array(sample.numberOfFrames);
          sample.copyTo(channel, { planeIndex, format: "f32-planar" });
          return channel;
        });
        decodedFrames += writePlanarAudioToCanonicalPcm(mono, channels, sample.sampleRate, sample.timestamp);
        decodedSampleCount += 1;
        downmixAndResampleMilliseconds += performance.now() - processingStartedAt;
        options.onProgress?.(Math.max(0, Math.round((sample.timestamp + sample.duration) * 1_000)));
      } finally {
        sample.close();
      }
    }
    if (decodedFrames <= 0) throw new Error("The selected audio track produced no decoded samples.");
    options.onMetrics?.({
      metadataMilliseconds: Math.round(metadataMilliseconds),
      demuxAndDecodeMilliseconds: Math.round(demuxAndDecodeMilliseconds),
      downmixAndResampleMilliseconds: Math.round(downmixAndResampleMilliseconds),
      decodedSampleCount,
    });
    return { sampleRate: RECOGNITION_SAMPLE_RATE, frameCount: mono.length, channelBuffers: [mono.buffer] };
  } finally {
    options.signal?.removeEventListener("abort", abortInput);
    input.dispose();
  }
}

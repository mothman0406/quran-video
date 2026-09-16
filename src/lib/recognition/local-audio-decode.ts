export type DecodedAudioChannels = {
  sampleRate: number;
  frameCount: number;
  /** Caller-owned PCM. The recognition client creates a disposable transfer copy. */
  channelBuffers: ArrayBuffer[];
};

export const RECOGNITION_SAMPLE_RATE = 16_000;

/**
 * Completes native media preparation outside the Quran worker. The output is
 * always one 16 kHz mono caller-owned channel, matching FFmpeg's f32le
 * extraction contract.
 */
export function canonicalizeNativeRecognitionPcm(decoded: DecodedAudioChannels): DecodedAudioChannels {
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

/**
 * Media decoding must use the window's AudioContext. Everything after this
 * boundary, including resampling, runs in the dedicated recognition worker.
 */
export async function decodeAudioChannels(source: File): Promise<DecodedAudioChannels> {
  if (typeof AudioContext === "undefined") {
    throw new Error("Audio decoding is unavailable in this browser.");
  }

  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await source.arrayBuffer());
    const channelBuffers = Array.from({ length: audio.numberOfChannels }, (_, index) => {
      // Do not detach AudioBuffer-owned channel storage. copyFromChannel makes
      // the transferable ownership boundary explicit and leaves decode state
      // valid until the AudioContext closes below.
      const copy = new Float32Array(audio.length);
      audio.copyFromChannel(copy, index);
      return copy.buffer;
    });
    return { sampleRate: audio.sampleRate, frameCount: audio.length, channelBuffers };
  } catch {
    throw new Error("This browser could not decode the selected video's audio. Try an MP4 or WebM it can play locally.");
  } finally {
    await context.close();
  }
}

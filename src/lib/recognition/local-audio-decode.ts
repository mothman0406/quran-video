export type DecodedAudioChannels = {
  sampleRate: number;
  frameCount: number;
  /** Independent buffers are safe to transfer to the recognition worker. */
  channelBuffers: ArrayBuffer[];
};

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

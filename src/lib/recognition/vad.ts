/**
 * Browser-local Silero VAD adapter. This intentionally has no energy-based
 * fallback: a waveform with music, room tone, or other background sound is
 * not evidence that someone is reciting.
 */
import { smoothVadSpeechRegions, type VadSpeechRegion } from "./speech-regions.ts";

export type { VadSpeechRegion } from "./speech-regions.ts";

const SILERO_MODEL_URL = "https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.30/dist/silero_vad_legacy.onnx";
const FRAME_MS = 96;
const POSITIVE_SPEECH_THRESHOLD = 0.45;
const NEGATIVE_SPEECH_THRESHOLD = 0.3;
const MIN_SPEECH_MS = 320;

type FrameProbability = { startMs: number; endMs: number; speech: number };

/**
 * Runs one stateful Silero pass over the already-decoded mono waveform. The
 * package exposes segment callbacks, and we retain its frame probabilities to
 * make the region confidence inspectable in recognition diagnostics.
 */
export async function detectLocalSpeechRegions(
  audio: Float32Array,
  sampleRate: number,
): Promise<VadSpeechRegion[]> {
  if (typeof window === "undefined") throw new Error("Local speech activity detection can only run in a browser.");
  if (!audio.length) return [];

  const [{ Message }, { NonRealTimeVAD }] = await Promise.all([
    import("@ricky0123/vad-web/dist/messages.js"),
    import("@ricky0123/vad-web/dist/non-real-time-vad.js"),
  ]);
  const vad = await NonRealTimeVAD.new({
    modelURL: SILERO_MODEL_URL,
    positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
    negativeSpeechThreshold: NEGATIVE_SPEECH_THRESHOLD,
    minSpeechMs: MIN_SPEECH_MS,
    preSpeechPadMs: 0,
    // Silero itself bridges short negative runs. We keep this below a
    // meaningful recitation pause, then apply a smaller deterministic merge.
    redemptionMs: 480,
  });
  const probabilities: FrameProbability[] = [];
  const originalProcess = vad.frameProcessor.process.bind(vad.frameProcessor);
  let frameIndex = 0;
  vad.frameProcessor.process = async (frame, handleEvent) => originalProcess(frame, (event) => {
    if (event.msg === Message.FrameProcessed) {
      probabilities.push({
        startMs: frameIndex * FRAME_MS,
        endMs: (frameIndex + 1) * FRAME_MS,
        speech: event.probs.isSpeech,
      });
      frameIndex += 1;
    }
    handleEvent(event);
  });

  const durationMs = Math.round(audio.length / sampleRate * 1_000);
  const rawRegions: VadSpeechRegion[] = [];
  for await (const segment of vad.run(audio, sampleRate)) {
    const segmentFrames = probabilities.filter((frame) => frame.startMs < segment.end && frame.endMs > segment.start);
    const positive = segmentFrames.filter((frame) => frame.speech >= POSITIVE_SPEECH_THRESHOLD);
    if (!positive.length) continue;
    const first = positive[0];
    const last = positive.at(-1)!;
    const confidence = positive.reduce((sum, frame) => sum + frame.speech, 0) / positive.length;
    rawRegions.push({
      startMs: first.startMs,
      endMs: last.endMs,
      durationMs: last.endMs - first.startMs,
      confidence,
    });
  }
  return smoothVadSpeechRegions(rawRegions, durationMs);
}

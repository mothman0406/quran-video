import { performance } from "node:perf_hooks";
import { viterbiCtcPath, type CtcFrameLogits, type CtcTargetToken } from "../src/lib/recognition/ctc-forced-alignment.ts";

const vocabularySize = 40;
const tokens: CtcTargetToken[] = Array.from({ length: 96 }, (_, index) => ({ tokenId: (index % (vocabularySize - 1)) + 1, globalWordIndex: Math.floor(index / 3) + 1 }));

for (const seconds of [20, 60, 180]) {
  const frames = seconds * 50;
  const values = new Float32Array(frames * vocabularySize).fill(-7);
  for (let frame = 0; frame < frames; frame += 1) values[frame * vocabularySize + (frame % 9 === 0 ? 0 : tokens[Math.min(tokens.length - 1, Math.floor(frame * tokens.length / frames))]!.tokenId)] = 7;
  const logits: CtcFrameLogits = { values, frames, vocabularySize };
  const startedAt = performance.now();
  const path = viterbiCtcPath(logits, tokens, 0);
  console.log(JSON.stringify({ approximateDurationSeconds: seconds, frames, targetTokens: tokens.length, viterbiMs: Number((performance.now() - startedAt).toFixed(2)), complete: Boolean(path) }));
}

import type { QuranPhoneticWord } from "./quran-phonetics.ts";

export type PhonemeFrameScores = {
  /** A frame-major log-probability matrix whose labels include `<blank>`. */
  labels: readonly string[];
  values: Float32Array | readonly number[];
  frames: number;
};

export type PhonemeDpWordTiming = QuranPhoneticWord & { startFrame: number; endFrame: number };

function score(input: PhonemeFrameScores, frame: number, label: string) {
  const labelIndex = input.labels.indexOf(label);
  return labelIndex < 0 ? Number.NEGATIVE_INFINITY : input.values[frame * input.labels.length + labelIndex] ?? Number.NEGATIVE_INFINITY;
}

/**
 * Global phoneme Viterbi alignment. Canonical word order is hard structure:
 * every target phone must be consumed in order, while a CTC blank permits
 * elongation and pauses. Equal scores deterministically prefer stay, advance,
 * then blank-skipping advance.
 */
export function forceAlignPhonemeDp(words: readonly QuranPhoneticWord[], input: PhonemeFrameScores): PhonemeDpWordTiming[] | null {
  const phones = words.flatMap((word) => word.phonemes.map((phone) => ({ phone, word })));
  if (!phones.length || input.frames < phones.length || input.values.length < input.frames * input.labels.length || !input.labels.includes("<blank>")) return null;
  const expanded = ["<blank>", ...phones.flatMap((entry) => [entry.phone, "<blank>"])];
  let previous = new Float64Array(expanded.length).fill(Number.NEGATIVE_INFINITY);
  previous[0] = score(input, 0, expanded[0]!);
  previous[1] = score(input, 0, expanded[1]!);
  const trace = Array.from({ length: input.frames }, () => new Int32Array(expanded.length).fill(-1));
  for (let frame = 1; frame < input.frames; frame += 1) {
    const current = new Float64Array(expanded.length).fill(Number.NEGATIVE_INFINITY);
    for (let state = 0; state < expanded.length; state += 1) {
      let best = previous[state]!;
      let predecessor = state;
      if (state > 0 && previous[state - 1]! > best) { best = previous[state - 1]!; predecessor = state - 1; }
      if (state > 1 && expanded[state] !== "<blank>" && expanded[state] !== expanded[state - 2] && previous[state - 2]! > best) { best = previous[state - 2]!; predecessor = state - 2; }
      if (Number.isFinite(best)) { current[state] = best + score(input, frame, expanded[state]!); trace[frame]![state] = predecessor; }
    }
    previous = current;
  }
  let state = expanded.length - 2;
  if (previous[expanded.length - 1]! > previous[state]!) state = expanded.length - 1;
  if (!Number.isFinite(previous[state]!)) return null;
  const framesByWord = new Map<QuranPhoneticWord, number[]>();
  for (let frame = input.frames - 1; frame >= 0; frame -= 1) {
    if (state % 2 === 1) {
      const word = phones[(state - 1) / 2]!.word;
      const frames = framesByWord.get(word) ?? [];
      frames.push(frame);
      framesByWord.set(word, frames);
    }
    if (frame > 0) state = trace[frame]![state]!;
  }
  return words.map((word) => {
    const frames = framesByWord.get(word);
    if (!frames?.length) throw new Error(`Phoneme DP emitted no evidence for ${word.verseKey}#${word.canonicalWordIndex}.`);
    return { ...word, startFrame: Math.min(...frames), endFrame: Math.max(...frames) + 1 };
  });
}

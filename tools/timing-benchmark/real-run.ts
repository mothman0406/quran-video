#!/usr/bin/env node
/**
 * Real-audio, development-only Quran word-timing benchmark.
 *
 * It fetches the CC BY quran-align release and exact EveryAyah-style filenames
 * into .cache. No timing data or recitation audio is imported by the app or
 * committed to Git.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { canonicalCtcWords } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import { createFastConformerRunner, type FastConformerResult } from "../../src/lib/recognition/local-fastconformer.ts";
import { refineBoundaryWithLocalEnergy } from "./ctc-boundaries.ts";
import { decideTimingPromotion, evaluateTimingBenchmark, timingBenchmarkMarkdown } from "./lib.ts";
import type { BenchmarkWordTiming, TimingFixture, WordTimingResult } from "./types.ts";

const execFileAsync = promisify(execFile);
const RELEASE = "release-2016-11-24";
const RELEASE_URL = `https://github.com/cpfair/quran-align/releases/download/${RELEASE}/quran-align-data-2016-11-24.zip`;
const CACHE = resolve("tools/timing-benchmark/.cache");
const RELEASE_DIRECTORY = resolve(CACHE, `quran-align/${RELEASE}`);
const AUDIO_DIRECTORY = resolve(CACHE, "audio");
const RESULTS_DIRECTORY = resolve("tools/timing-benchmark/results");
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

type FixtureSpec = { reciter: string; surah: number; ayah: number };

// Fixed rather than opportunistically sampled. The quran-align release
// contains every reciter identifier below. The set deliberately spans short,
// medium, long, fast, and slower ayat with varied phonetic contexts.
const SAMPLE: readonly FixtureSpec[] = [
  ...Array.from({ length: 11 }, (_, index) => ({ reciter: "Alafasy_128kbps", surah: 93, ayah: index + 1 })),
  ...Array.from({ length: 8 }, (_, index) => ({ reciter: "Alafasy_128kbps", surah: 94, ayah: index + 1 })),
  ...[74, 75, 76, 77].map((ayah) => ({ reciter: "Hani_Rifai_192kbps", surah: 6, ayah })),
  ...[33, 34, 35].map((ayah) => ({ reciter: "Hani_Rifai_192kbps", surah: 3, ayah })),
  ...[19, 20, 21, 22].map((ayah) => ({ reciter: "Hani_Rifai_192kbps", surah: 69, ayah })),
  ...Array.from({ length: 15 }, (_, index) => ({ reciter: "Husary_Muallim_128kbps", surah: 75, ayah: index + 1 })),
];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fixtureId(spec: FixtureSpec) {
  return `${spec.reciter.toLowerCase().replaceAll("_", "-")}-${String(spec.surah).padStart(3, "0")}${String(spec.ayah).padStart(3, "0")}`;
}

function audioUrl(spec: FixtureSpec) {
  return `https://everyayah.com/data/${spec.reciter}/${String(spec.surah).padStart(3, "0")}${String(spec.ayah).padStart(3, "0")}.mp3`;
}

function localAudioPath(spec: FixtureSpec) {
  return resolve(AUDIO_DIRECTORY, spec.reciter, `${String(spec.surah).padStart(3, "0")}${String(spec.ayah).padStart(3, "0")}.mp3`);
}

async function download(url: string, destination: string) {
  try {
    if ((await stat(destination)).size > 0) return;
  } catch { /* Download below. */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed for ${url}: HTTP ${response.status}.`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, new Uint8Array(await response.arrayBuffer()));
}

async function ensureRelease() {
  const marker = resolve(RELEASE_DIRECTORY, "Alafasy_128kbps.json");
  try {
    await stat(marker);
    return;
  } catch { /* Download/extract below. */ }
  const zip = resolve(CACHE, "quran-align/quran-align-data-2016-11-24.zip");
  await download(RELEASE_URL, zip);
  await mkdir(RELEASE_DIRECTORY, { recursive: true });
  await execFileAsync("unzip", ["-oq", zip, "-d", RELEASE_DIRECTORY]);
}

async function decodeMono16k(path: string) {
  const { stdout } = await execFileAsync(FFMPEG, ["-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1"], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
  if (stdout.byteLength % 4) throw new Error(`FFmpeg emitted non-float PCM for ${path}.`);
  return new Float32Array(stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.byteLength));
}

type CpFairAyah = { surah: number; ayah: number; segments: Array<[number, number, number, number]> };

async function fixtureFor(spec: FixtureSpec): Promise<{ fixture: TimingFixture; canonicalWords: BenchmarkWordTiming[]; audio: Float32Array }> {
  const timing = JSON.parse(await readFile(resolve(RELEASE_DIRECTORY, `${spec.reciter}.json`), "utf8")) as CpFairAyah[];
  const reference = timing.find((item) => item.surah === spec.surah && item.ayah === spec.ayah);
  if (!reference) throw new Error(`${fixtureId(spec)} is absent from the ${RELEASE} timing file.`);
  const verseKey = `${spec.surah}:${spec.ayah}`;
  const verse = hafsVerses.find((candidate) => candidate.verseKey === verseKey);
  if (!verse) throw new Error(`Canonical verse ${verseKey} is unavailable.`);
  const canonicalWords = canonicalCtcWords([verse]).map((word) => ({ ...word, startMs: 0 }));
  const maximumIndex = Math.max(...reference.segments.map((segment) => segment[1]));
  // quran-align's Tanzil Uthmani indexes must map 1:1 to the application's
  // canonical spoken-word list. A count mismatch is an exclusion, never a shift.
  if (maximumIndex !== canonicalWords.length || reference.segments.some(([start, end]) => start < 0 || end <= start || end > canonicalWords.length)) {
    throw new Error(`${fixtureId(spec)} has incompatible quran-align indexing (reference max=${maximumIndex}, canonical=${canonicalWords.length}).`);
  }
  const path = localAudioPath(spec);
  await download(audioUrl(spec), path);
  const audio = await decodeMono16k(path);
  const durationMs = Math.round(audio.length / 16);
  const timingEndMs = Math.max(...reference.segments.map((segment) => segment[3]));
  if (timingEndMs > durationMs) throw new Error(`${fixtureId(spec)} timing end ${timingEndMs} exceeds decoded audio duration ${durationMs}.`);
  const words = reference.segments.flatMap(([start, end, startMs, endMs]) => {
    if (end !== start + 1) return [];
    const word = canonicalWords[start]!;
    return [{ verseKey, canonicalWordIndex: word.canonicalWordIndex, expectedStartMs: startMs, expectedEndMs: endMs, provenance: "external-reference-dataset" as const, source: `${RELEASE_URL}#${spec.reciter}.json` }];
  });
  return {
    fixture: {
      fixtureId: fixtureId(spec),
      source: `Collin Fair / cpfair/quran-align ${RELEASE}; CC BY 4.0 external machine-generated reference timing`,
      reciter: spec.reciter,
      audioUrl: audioUrl(spec),
      audioDurationMs: durationMs,
      surah: spec.surah,
      ayahRange: { start: spec.ayah, end: spec.ayah },
      words,
      boundaries: [],
      notes: `Exact EveryAyah-style directory and bitrate identifier ${spec.reciter}; audio duration checked against quran-align reference end.`,
    },
    canonicalWords,
    audio,
  };
}

function currentResult(fixture: TimingFixture, result: FastConformerResult): WordTimingResult {
  if (result.status !== "complete" || !result.alignmentComplete) throw new Error(`${fixture.fixtureId} FastConformer failed: ${result.reason ?? "unknown failure"}`);
  return {
    fixtureId: fixture.fixtureId,
    engineId: "fastconformer-current",
    words: result.alignment.words,
    runtime: { totalMs: result.performance.totalMs, inferencePasses: 1, modelBytes: result.performance.modelArtifactBytes + result.performance.supportingAssetBytes },
    diagnostics: { frameCount: result.frameCount, frameDurationMs: result.frameDurationMs, inferenceMs: result.performance.inferenceMs, alignmentMs: result.performance.alignmentMs, modelRevision: result.modelRevision },
  };
}

function rawBlankTransitionResult(base: WordTimingResult): WordTimingResult {
  // The raw CTC transition candidate is intentionally not offset: with the
  // current Viterbi semantics a blank->lexical transition is the first aligned
  // lexical frame. This checks the boundary interpretation without inventing a
  // numerically convenient shift.
  return { ...base, engineId: "fastconformer-blank-to-lexical-transition", diagnostics: { ...base.diagnostics, boundaryRule: "first observed blank-to-lexical Viterbi transition; equal to first-aligned-token when transition exists" } };
}

function locallyRefinedResult(base: WordTimingResult, audio: Float32Array): WordTimingResult {
  const words = base.words.map((word, index, all) => {
    const refined = refineBoundaryWithLocalEnergy(audio, 16_000, word.startMs, 80);
    const previous = all[index - 1]?.startMs ?? Number.NEGATIVE_INFINITY;
    const next = all[index + 1]?.startMs ?? Number.POSITIVE_INFINITY;
    // Refinement is retained only when it remains a valid timing for this
    // known word. It cannot choose text or cross a CTC neighbor.
    const startMs = refined.refinedMs >= previous && refined.refinedMs < (word.endMs ?? Number.POSITIVE_INFINITY) && refined.refinedMs <= next
      ? refined.refinedMs
      : word.startMs;
    return { ...word, startMs, diagnostics: { ...word.diagnostics, refinement: startMs === refined.refinedMs ? refined : { ...refined, rejected: "would violate fixed CTC word timing order/end" } } };
  });
  return { ...base, engineId: "fastconformer-local-rms-rise-80ms", words, diagnostics: { ...base.diagnostics, boundaryRule: "maximum local 10ms RMS rise within +/-80ms of fixed CTC onset" } };
}

async function main() {
  const requestedOutput = argument("--output");
  const start = Number(argument("--start") ?? 0);
  const limit = Number(argument("--limit") ?? SAMPLE.length);
  if (!Number.isInteger(start) || start < 0 || start >= SAMPLE.length || !Number.isInteger(limit) || limit < 1 || start + limit > SAMPLE.length) throw new Error(`--start/--limit must select a non-empty range within the ${SAMPLE.length}-fixture manifest.`);
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const output = resolve(requestedOutput ?? `${RESULTS_DIRECTORY}/${date}-quran-align-real`);
  await ensureRelease();
  const inputs = [] as Array<{ fixture: TimingFixture; canonicalWords: BenchmarkWordTiming[]; audio: Float32Array }>;
  const exclusions: Array<{ fixtureId: string; reason: string }> = [];
  const selectedSample = SAMPLE.slice(start, start + limit);
  for (const spec of selectedSample) {
    try { inputs.push(await fixtureFor(spec)); }
    catch (error) { exclusions.push({ fixtureId: fixtureId(spec), reason: error instanceof Error ? error.message : String(error) }); }
  }
  if (start === 0 && limit === SAMPLE.length && (inputs.length < 30 || new Set(inputs.map((item) => item.fixture.reciter)).size < 3)) throw new Error(`Insufficient verified benchmark fixtures: ${inputs.length} usable; exclusions: ${JSON.stringify(exclusions)}`);
  const baseline: Array<{ fixture: TimingFixture; canonicalWords: BenchmarkWordTiming[]; result: WordTimingResult }> = [];
  const raw: typeof baseline = [];
  const refined: typeof baseline = [];
  for (const input of inputs) {
    const runner = createFastConformerRunner(input.audio, [{ startMs: 0, endMs: input.fixture.audioDurationMs!, durationMs: input.fixture.audioDurationMs!, confidence: 1 }], `timing-benchmark-${input.fixture.fixtureId}`);
    const verse = hafsVerses.find((candidate) => candidate.verseKey === `${input.fixture.surah}:${input.fixture.ayahRange.start}`);
    if (!verse) throw new Error(`Canonical verse missing for ${input.fixture.fixtureId}.`);
    const result = currentResult(input.fixture, await runner([verse], [{ startMs: 0, endMs: input.fixture.audioDurationMs! }]));
    baseline.push({ fixture: input.fixture, canonicalWords: input.canonicalWords, result });
    raw.push({ fixture: input.fixture, canonicalWords: input.canonicalWords, result: rawBlankTransitionResult(result) });
    refined.push({ fixture: input.fixture, canonicalWords: input.canonicalWords, result: locallyRefinedResult(result, input.audio) });
    // ONNX Runtime Web owns native/WASM allocations. The benchmark is a CLI,
    // so an explicitly exposed collection point prevents a long fixed sample
    // from accumulating completed-output buffers between independent ayat.
    (globalThis as typeof globalThis & { gc?: () => void }).gc?.();
  }
  const reports = [evaluateTimingBenchmark(baseline), evaluateTimingBenchmark(raw), evaluateTimingBenchmark(refined)];
  const decisions = reports.slice(1).map((candidate) => decideTimingPromotion(reports[0]!, candidate));
  const outputPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dataset: { repository: "https://github.com/cpfair/quran-align", release: RELEASE, releaseUrl: RELEASE_URL, attribution: "Collin Fair / quran-align; CC BY 4.0; externally machine-generated reference timing, not human ground truth" },
    audio: { source: "https://everyayah.com/data/<reciter>/<surah><ayah>.mp3", matchingMethod: "quran-align release reciter filename exactly matches EveryAyah directory and bitrate identifier; ayah filename and decoded duration were checked; files are local ignored cache only" },
    manifest: inputs.map(({ fixture }) => ({ fixtureId: fixture.fixtureId, reciter: fixture.reciter, surah: fixture.surah, ayah: fixture.ayahRange.start, audioUrl: fixture.audioUrl, audioDurationMs: fixture.audioDurationMs, usableReferenceWords: fixture.words.length })),
    // Metrics-only, non-copyrighted intermediate data so short local batches
    // can be merged deterministically if a host limits one WASM process.
    entries: { baseline, raw, refined },
    exclusions,
    reports,
    promotionDecisions: decisions,
    productionWinner: "fastconformer-current",
    historicalFixtures: "6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.",
  };
  await mkdir(dirname(output), { recursive: true });
  await Promise.all([
    writeFile(`${output}.json`, `${JSON.stringify(outputPayload, null, 2)}\n`),
    writeFile(`${output}.md`, [
      "# Real Quran word-timing benchmark",
      "",
      `Dataset: ${RELEASE} — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.`,
      "",
      `Usable ayah recordings: ${inputs.length}; usable word references: ${inputs.reduce((sum, input) => sum + input.fixture.words.length, 0)}; exclusions: ${exclusions.length}.`,
      "",
      ...reports.flatMap((report) => [timingBenchmarkMarkdown(report), ""]),
      "## Promotion decision",
      "",
      ...decisions.map((decision) => `- ${decision.candidate}: ${decision.promote ? "PROMOTE" : "do not promote"}; ${decision.reasons.join("; ")}; median word-start change=${decision.medianStartImprovementMs} ms; p90 change=${decision.p90StartDifferenceMs} ms.`),
      "",
      "## Historical reviewed fixtures",
      "",
      outputPayload.historicalFixtures,
      "",
    ].join("\n")),
  ]);
  process.stdout.write(`Wrote ${output}.json and ${output}.md (${inputs.length} usable fixtures; ${exclusions.length} excluded)\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

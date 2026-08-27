import { readFile } from "node:fs/promises";
import { recognizeTranscript } from "../src/lib/recognition/core.ts";

const inputPath = process.argv[2];
const stdin = () => new Promise<string>((resolve, reject) => {
  let value = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => { value += chunk; });
  process.stdin.on("end", () => resolve(value));
  process.stdin.on("error", reject);
});
const raw = inputPath ? await readFile(inputPath, "utf8") : await stdin();
const parsed: unknown = JSON.parse(raw);
const chunks = Array.isArray(parsed) ? parsed : (parsed as { chunks?: unknown }).chunks;
if (!Array.isArray(chunks)) throw new Error('Expected a JSON array or an object with a "chunks" array.');

console.log(JSON.stringify(recognizeTranscript(chunks), null, 2));

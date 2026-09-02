import { existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "public/ort/ort-wasm-simd-threaded.jsep.wasm",
  "public/ort/ort-wasm-simd-threaded.jsep.mjs",
  "public/ort/silero_vad_legacy.onnx",
];
const missing = required.filter((file) => !existsSync(resolve(file)));
if (missing.length) {
  console.error(`Missing browser VAD assets:\n${missing.join("\n")}`);
  process.exit(1);
}
console.log(`Browser VAD assets present (${required.length} files).`);

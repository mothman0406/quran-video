/**
 * Lightweight browser-safe recognition metadata. Server and UI code may import
 * this module without pulling in the local ONNX/Transformers runtime.
 */
export const FASTCONFORMER_MODEL = "acibZ/tilawa-quran-onnx";
export const FASTCONFORMER_MODEL_LICENSE = "CC-BY-4.0";
export const FASTCONFORMER_MODEL_REVISION = "0cd79471524bc9cfa1c9296055242a935a1873e4";
export const FASTCONFORMER_MODEL_ARTIFACT = "fastconformer_full_mixed.onnx";
export const FASTCONFORMER_MODEL_BYTES = 88_307_366;
export const FASTCONFORMER_TOKEN_TABLE_BYTES = 12_211_783;
export const FASTCONFORMER_VOCAB_BYTES = 21_062;
export const FASTCONFORMER_QURAN_BYTES = 3_186_385;
export const FASTCONFORMER_RUNTIME = "ONNX Runtime Web 1.24.2 (WASM only; Tilawa-compatible)";
export const FASTCONFORMER_ORT_IMPORT = "fastconformer-onnxruntime-web/wasm";
export const FASTCONFORMER_ORT_VERSION = "1.24.2";
export const FASTCONFORMER_TILAWA_RELEASE = "v0.2.0";
export const FASTCONFORMER_VOCAB_REVISION = FASTCONFORMER_MODEL_REVISION;
export const FASTCONFORMER_TOKEN_TABLE_REVISION = FASTCONFORMER_MODEL_REVISION;
export const FASTCONFORMER_BASE_URL = `https://huggingface.co/${FASTCONFORMER_MODEL}/resolve/${FASTCONFORMER_MODEL_REVISION}`;
export const FASTCONFORMER_MODEL_URL = `${FASTCONFORMER_BASE_URL}/${FASTCONFORMER_MODEL_ARTIFACT}`;

export type FastConformerProgress =
  | { phase: "downloading-model"; bytesLoaded: number; bytesTotal: number }
  | { phase: "identifying-passage"; completed: number; total: number }
  | { phase: "aligning-words"; step: "inference" | "forced-alignment" };
export type FastConformerProgressCallback = (progress: FastConformerProgress) => void;

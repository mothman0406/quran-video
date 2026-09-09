/** Browser capability check kept separate from the recognition runtime. */
export function localTranscriptionSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "This check must run in a browser." };
  if (typeof AudioContext === "undefined") return { supported: false, reason: "This browser does not expose AudioContext for local audio decoding." };
  const webgpu = "gpu" in navigator;
  return {
    supported: true,
    webgpu,
    reason: webgpu ? "WebGPU will be tried first; WASM is used if it fails." : "WebGPU is unavailable; local WASM will be used.",
  };
}

# Browser-local Arabic/Quran CTC model research

This assessment is for shadow forced alignment, not open-ended recognition.
Whisper remains responsible for passage identification. Model cards were
checked on 2026-09-02; claims below are not treated as reciter benchmarks.

| Model | License | Artifact / size | Runtime / vocabulary | Decision |
| --- | --- | --- | --- | --- |
| `abdelmoez98/wav2vec2-large-xlsr-53-arabic-quran-v_final-ONNX` | Apache-2.0 | ONNX repo reports 2.93 GB total; includes `onnx/model_int8.onnx`. Exact artifact bytes were not retrievable in this environment (public Hub resolver returned 401), so the browser records download telemetry when available. | Transformers.js / ONNX Runtime Web; Arabic character CTC vocabulary loaded from `vocab.json`; WebGPU attempted, WASM fallback. | **Selected for shadow only.** It is the available Quran-fine-tuned, browser-oriented ONNX CTC candidate with commercial-compatible declared licensing. Download size is a serious deployment risk and blocks promotion to production until measured. |
| `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` | Apache-2.0 | 1.26 GB PyTorch weights reported; no maintained browser ONNX artifact found. | Arabic character CTC, 16 kHz; PyTorch model card. | Rejected for browser prototype: compatible license and a useful Arabic baseline, but not browser ONNX. Its reported Common Voice WER/CER is general Arabic, not Quran recitation evidence. |
| `boutchaz/adkar-recite-wav2vec2-ar-ctc` | Apache-2.0 | int8 dynamic quantized `.pte`; size not published in inspected model card. | ExecuTorch / React Native; `[1,T/320,52]` Arabic character logits. | Research comparison only: explicitly supports known-text CTC alignment and Quran use, but is not ONNX or browser-web compatible. |
| `cstr/wav2vec2-large-xlsr-53-arabic-GGUF` | Apache-2.0 | q4_k about 212 MB; q8 about 356 MB; f16 about 627 MB. | GGUF / CrispASR, 51-token CTC vocabulary. | Rejected: encouraging smaller quantization comparison, but not ONNX/Transformers.js browser runtime. It is not a production dependency. |
| Non-profit / research-only Quran models | Varies, often non-commercial | Varies | Varies | Rejected from product dependency before technical testing whenever the license excludes commercial paid use. |

Sources: [Quran ONNX candidate](https://huggingface.co/abdelmoez98/wav2vec2-large-xlsr-53-arabic-quran-v_final-ONNX), [Arabic XLSR baseline](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-arabic), [Quran ExecuTorch comparison](https://huggingface.co/boutchaz/adkar-recite-wav2vec2-ar-ctc), and [Arabic GGUF quantization comparison](https://huggingface.co/cstr/wav2vec2-large-xlsr-53-arabic-GGUF).

## Selection safeguards

- The selected model is loaded only after a Quran passage has already been
  fixed, receives VAD-constrained PCM, and returns logits for deterministic
  Viterbi against the full canonical passage.
- No decoded text replaces the target transcript. Each canonical word is
  encoded through the model tokenizer and must receive acoustic frames.
- Model-card Quran claims are not accepted as accuracy proof. Shadow debug
  comparison, especially the 6:76 → 6:77 recording, is the required next
  evidence before any timing authority changes.
- `int8` is selected by the repository artifact. There is no evidence yet that
  a smaller browser-compatible quantization retains sufficient logits, so no
  size claim is extrapolated from GGUF measurements.

## Development-environment performance record

The Node workspace can measure deterministic Viterbi, but it cannot measure a
browser download, browser cold/warm model load, or ONNX inference without a
fetchable model artifact and a browser GPU/WASM runtime. Those fields are
therefore reported as unavailable, never estimated. Per real browser run the
shadow debug payload records cold/warm load, inference, Viterbi, and total
milliseconds when the model can load.

Measured with `node --experimental-strip-types scripts/benchmark-ctc-alignment.ts`:

| Approximate source duration | Viterbi alignment | Model download/load/inference |
| --- | --- | --- |
| 20 seconds | 60.50 ms | unavailable in this environment |
| 60 seconds | 156.40 ms | unavailable in this environment |
| 3 minutes | 454.14 ms | unavailable in this environment |

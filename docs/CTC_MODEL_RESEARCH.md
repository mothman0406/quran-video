# Browser-local Quran CTC model research

This assessment is for shadow forced alignment only. Whisper remains
responsible for passage identification and no CTC output changes a caption,
timeline interval, or manual edit.

## Decision (verified 2026-09-02)

Selected: `Tidzo/darten-quran-asr` at immutable revision
`0530f8aabd7a19a152e8476fe94fa6c6b2f38dd3`, artifact
`model.int8.onnx`.

- License: Apache-2.0, inherited from the declared
  `jonatasgrosman/wav2vec2-large-xlsr-53-arabic` base.
- Exact artifact size: 355,026,417 bytes.
- Input/output verified with ONNX Runtime Web WASM: `input_values`
  `[1, raw 16 kHz float PCM samples]` -> `logits` `[1, T, 51]`.
- The 51 output classes, blank id `0`, and character ids are exactly those in
  the public upstream `vocab.json`. The browser normalizes each known
  canonical word only for its acoustic target, emits its character tokens plus
  `|` word delimiters, and maps frames back to the untouched Uthmani word.
- Frontend: Wav2Vec2's published processor configuration requires 16 kHz mono
  waveform and per-utterance zero-mean/unit-variance normalization
  (`sqrt(variance + 1e-7)`). No mel frontend is used.
- Browser loading: the public, SHA-pinned Hugging Face resolver is fetched
  client-side, checked to return a CORS response for `localhost`, and stored in
  the browser Cache API. ONNX Runtime Web tries WebGPU then falls back to the
  existing single-threaded WASM runtime assets.

355 MB is above the preferred 100–300 MB range, but is substantially below
the rejected multi-GB export and is the only tested candidate with a complete,
verified, commercially compatible character vocabulary. It is lazy loaded only
after VAD and passage identification.

## Candidates evaluated

| Model | Result | Reason |
| --- | --- | --- |
| `Tidzo/darten-fastconformer-quran` | Rejected | The mirror advertises Apache-2.0 and exposes an accessible 131,801,467-byte BPE ONNX artifact, but its declared upstream `Muno459/fastconformer-quran` currently governs its weights/tokenizer under the Quran-Lab No-Profit License. A mirror cannot supply the commercial rights this product needs. Its BPE tokenizer also requires a separate exact SentencePiece asset/frontend. |
| `Tidzo/darten-quran-asr` `model.hamza.int8.onnx` | Rejected | Compact at 121,949,460 bytes, but an actual ONNX Runtime Web run produces `[1, T, 63]` logits while the declared upstream vocabulary is 51 classes and the repository supplies no matching vocabulary. Using inferred ids would violate deterministic canonical mapping. |
| `Tidzo/darten-quran-asr` `model.int8.onnx` | **Selected** | Public, ungated, Apache-2.0, raw-PCM character CTC, exact 51-class upstream vocabulary, 355,026,417 bytes. Actual ONNX Runtime Web WASM session creation and real model logits succeeded in this development environment. |
| `TheGreatQuran/QuranKarim-SpeechToText-onnxModel` | Research comparison only | Promising 87 MB CC-BY-4.0 Quran FastConformer with tokens, but it is BPE and does not publish the SentencePiece tokenizer needed to form exact known-text CTC targets in this application. It cannot be substituted with a greedy reconstruction. |
| Earlier `abdelmoez98/...` Wav2Vec2 ONNX | Rejected | About 2.93 GB and resolver access was not reliable. It does not meet the practical browser-size criterion. |

## Character CTC choice

The selected representation is deliberately character CTC:

```text
canonical Uthmani word -> target-only normalized character text
-> exact Wav2Vec2 character ids -> CTC frames -> original canonical word
```

The BPE FastConformer candidates require exact SentencePiece encoding and an
80-channel log-mel frontend. Their model-card accuracy claims are encouraging,
but they are either commercially ineligible or do not publish enough tokenizer
data to encode the canonical target exactly. The character model is simpler to
audit: every target character id comes from the checked-in vocabulary table and
every canonical word remains present even when its alignment confidence is low.

## Runtime evidence and remaining measurement

The selected ONNX graph was loaded and invoked through ONNX Runtime Web WASM
with a real `[1, 16000]` PCM tensor; it exposes the expected `input_values`,
`logits`, and 51-class output. That validates the artifact/runtime contract,
not user-recording accuracy.

The application records per real browser recognition run: artifact and
transferred bytes, cache status, backend, cold/warm load, preprocessing,
inference, Viterbi, total, tokenization, every word confidence, verse deltas,
and pause word boundaries. It does not estimate browser timing in Node.

The workspace contains no 6:74–6:77 source video/audio or pre-existing browser
measurements. Therefore the requested real recording benchmark, including the
6:76 -> 6:77 production-versus-CTC transition delta, remains a manual
validation blocker. CTC timing remains shadow-only until that evidence exists.

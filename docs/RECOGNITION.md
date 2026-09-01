# Two-stage local Quran recognition

The recognition transcriber uses `onnx-community/whisper-base_timestamped`, the multilingual Whisper Base ONNX export that retains the decoder cross-attention outputs Transformers.js needs for `return_timestamps: "word"`. It remains fully browser-local: q4 is selected for the encoder and merged decoder (about 145 MB including tokenizer/config assets on first download), WebGPU is preferred, and the same cached model runs through local WASM when WebGPU cannot initialize. The source is decoded once to mono 16 kHz PCM and reduced to a local 10 ms RMS envelope; neither PCM nor text is uploaded.

## Timestamp capability and fallback

Word timing is a declared capability of the timestamped export; the ordinary `onnx-community/whisper-base` export must not be used for that mode. Each run validates non-empty word timestamps after absolute-time overlap stitching: values must be finite, ordered, within the source duration, and not all identical. An occasional zero-duration word is retained for neighboring interpolation, but missing timestamps, large regressions, out-of-duration values, or identical timestamps invalidate precise timing.

If Transformers.js reports its known missing-cross-attention/output-attentions failure, or validation rejects the returned words, the transcriber retries once with `return_timestamps: true` on the same model. Passage mapping continues from coarse timestamped chunks, but the result is marked `chunk-fallback`, records its reason in developer diagnostics, and the editor warns that timing is approximate. This fallback never claims word precision.

## 1. Passage mapping

The complete normalized recording is mapped to a bounded set of candidate Quran regions. Cheap fuzzy token anchors retrieve and expand surrounding ayat, then a semi-global dynamic-programming alignment finds the best *contiguous canonical Quran word span* inside each region. Canonical gaps before the first and after the last matched word are free, so a clip can start/end inside an ayah. ASR gaps are not free: speech tokens that cannot be explained by a candidate remain an explicit penalty and coverage loss. Thus silence contributes no mapping evidence, but a substantial Quran-like prefix cannot be silently discarded in favor of a later clean anchor. Windows cannot cross a surah boundary.

Mapping reports the selected word span (first/last verse, one-based canonical word index, canonical word text, and boundary state), intersected ayat, per-ayah word coverage, top three alternatives, mapping quality, transcript coverage, canonical-span coverage, uniqueness margin, and `confident-unique` / `plausible-ambiguous` / `no-reliable-match`. A strong interior anchor is locally expanded backward and forward before final selection; partial boundary ayat are supported by token alignment and continuity rather than a full-ayah threshold. An ambiguous but credible clip still yields its best usable passage for correction; only no reliable mapping produces no captions. Chunk-level confidence never decides the final passage.

## 2. Word and PCM timing

After mapping, the selected canonical passage is aligned again as one monotonic word sequence when validated ASR words are available. Every canonical token retains its ayah, word index, and global passage order. Aligned ASR words supply initial timings; under a documented chunk fallback, missing interior evidence uses timestamped chunk text and interpolation only between canonical neighbors.

PCM energy is consulted only inside a corridor already implied by the last aligned word of ayah A and first aligned word of ayah B. A local adaptive noise floor finds active speech offset/onset around that expected transition. A genuine gap yields distinct A end and B start times; connected recitation uses the text-derived transition instead. Silence is never a global verse segmenter, so a breath within an ayah cannot split it.

The first ayah has an additional safeguard: its start is anchored to the strongest local run of ASR tokens that actually aligned to that first canonical ayah. A lone, much-earlier token is not allowed to beat a later multi-word aligned run. PCM then searches only a bounded lookback corridor around that anchor; generic audio activity is recorded for debugging but is never timing input. If the clip starts partway through an ayah, the canonical word span remains exact and the local corridor begins near the first supported canonical word. Weak evidence biases toward the anchor rather than showing Quran text seconds early.

Automatic display generation is deliberately simpler than recognition: each detected ayah creates exactly one whole-ayah `CaptionSegment`. Partial canonical start/end words remain recognition metadata, while the visible Arabic and translation remain the entire ayah. Repeated words do not create or advance a display set; only the next ayah's credible onset changes the active caption. Manual split/merge remains available as an editor operation, but is never performed automatically.

Evidence is stored as `word-audio-refined`, `word-timestamp`, `token-interpolated`, `chunk-interpolated`, or `low-confidence-fallback`. Caption intervals remain exact half-open `CaptionSegment.startMs`/`endMs` values shared by preview and timeline; fades are bounded inside those intervals.

## 4. Timing Lab

Development builds expose `/recognition` as the local Timing Lab. It keeps the selected video in the browser, shows transcription/timestamp/audio-analysis/passage diagnostics, and materializes the same `VerseAlignment` → `CaptionSegment` display model used by the editor. The lab records integer-millisecond ground-truth marks for recitation onset, set transitions, and final recitation end; marks can be associated with detected segments and edited or removed. `Copy Timing Report` produces plain text and `Export Debug JSON` saves structured timing/canonical/ASR diagnostics without source media bytes. Both include first-onset trace values, per-ayah alignment/display/manual-error values, and observed lab caption activations. Production builds show no detailed recognition diagnostics.

## Performance and limitations

The full corpus has 6,236 ayat, but only bounded anchor windows receive dynamic programming. The noisy five-ayah Ad-Duha regression scores in approximately 0.73 s in Node on this workspace; PCM envelope construction is linear in source duration. This is deterministic refinement around ASR word evidence, not phonetic forced alignment: difficult ASR, heavy reverb, or weak word timestamps can still fall back to interpolation and merit manual correction. Browser fixture measurements remain required to quantify boundary error across real reciters and codecs.

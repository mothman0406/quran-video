# Recognition research note

The browser-local pipeline uses multilingual Whisper Base for Arabic text, then evaluates both an orthographic normalization and a conservative Hafs-aware recitation representation. This improves tolerance for connected recitation without changing canonical Quran text or claiming that Whisper emits phonemes.

## Whole-recording passage inference

Transcription chunks are retrieval and timestamp evidence only. The final result is selected from bounded, contiguous Quran windows: local chunk anchors seed candidate starts, each window is scored against the complete normalized transcript, and the top three are retained for diagnostics. The score combines fuzzy text similarity, recitation-aware token similarity, monotonic token coverage of the transcript, canonical coverage, and consecutive-ayah consistency. Windows never cross a surah boundary.

The decision state is `confident-unique`, `plausible-ambiguous`, or `no-reliable-match`. A short phrase with comparably explanatory locations is deliberately returned as ambiguous; later contiguous ayat can resolve it. A high-scoring shorter suffix does not create ambiguity when it leaves meaningful earlier transcript evidence unexplained.

## Alignment and timing policy

Once a unique window is chosen, its full canonical token sequence is monotonically aligned to all timestamped ASR tokens. Ayah boundaries come from those aligned tokens, with local interpolation for missing interior ayat; chunk edges, breaths, and silence do not themselves form ayah boundaries. Timing evidence records direct ASR words, chunk-text alignment, or interpolation.

The first displayed ayah starts at its first aligned canonical token, never at the video, passage, or initial chunk start by default. When first-word evidence is weak, the fallback is conservative: show later rather than before recitation. Caption display timing remains independently editable as `CaptionSegment.startMs`/`endMs`; recognition `VerseAlignment` values are preserved as the reset evidence.

## Performance and evaluation

The Quran corpus has 6,236 ayat. Candidate retrieval is bounded and the expensive global scorer evaluates only local anchors; for longer recordings with several strong anchors it does not reopen corpus-wide alternatives. The live-sized noisy Ad-Duha regression remains below 1.5 seconds in Node tests.

A future evaluation should compare this generic Whisper pipeline with a Quran-specific speech-to-phoneme or phonetic model on held-out, timestamped Hafs recitations. Measure ayah retrieval, false positives on unrelated Arabic, ambiguity correctness, and boundary error separately; retain the deterministic sequence matcher as the model-independent alignment boundary.

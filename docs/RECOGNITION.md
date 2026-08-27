# Recognition research note

The current browser-local pipeline uses multilingual Whisper Base for Arabic text, then evaluates both an orthographic normalization and a conservative Hafs-aware recitation representation. This improves tolerance for connected recitation without changing canonical Quran text or claiming that Whisper emits phonemes.

A future evaluation should compare this generic Whisper pipeline with a Quran-specific speech-to-phoneme or phonetic model on held-out, timestamped Hafs recitations. Measure ayah retrieval, false positives on unrelated Arabic, and boundary error separately; retain the deterministic sequence matcher as the model-independent alignment boundary.

# Two-stage local Quran recognition

Whisper Base remains fully browser-local and now requests Transformers.js `return_timestamps: "word"`. Overlapping 30-second transcription windows are stitched into one monotonic transcript: overlap duplicates are removed and timestamp order cannot move backward. The source is decoded once to mono 16 kHz PCM and reduced to a local 10 ms RMS envelope; neither PCM nor text is uploaded.

## 1. Passage mapping

The complete normalized recording is mapped to a bounded set of contiguous Quran windows. Cheap fuzzy token anchors retrieve candidate regions, then a dynamic-programming monotonic token alignment scores each complete candidate against all ASR evidence. Scores reward transcript coverage, canonical coverage, token order, and consecutive ayat; insertions, omissions, substitutions, repeated words, opening silence, isti'adhah, and trailing speech are tolerated. Windows cannot cross a surah boundary.

Mapping reports the selected best passage, top three alternatives, global score, coverage, uniqueness margin, and `confident-unique` / `plausible-ambiguous` / `no-reliable-match`. An ambiguous but credible clip still yields its best usable passage for correction; only no reliable mapping produces no captions. Chunk-level confidence never decides the final passage.

## 2. Word and PCM timing

After mapping, the selected canonical passage is aligned again as one monotonic word sequence. Every canonical token retains its ayah, word index, and global passage order. Aligned ASR words supply initial timings; missing interior evidence is interpolated only between canonical neighbors.

PCM energy is consulted only inside a corridor already implied by the last aligned word of ayah A and first aligned word of ayah B. A local adaptive noise floor finds active speech offset/onset around that expected transition. A genuine gap yields distinct A end and B start times; connected recitation uses the text-derived transition instead. Silence is never a global verse segmenter, so a breath within an ayah cannot split it. The first/last ayah are refined around their first/last aligned word, preserving initial silence and elongated final vocal energy without retaining a long reverb tail.

Evidence is stored as `word-audio-refined`, `word-timestamp`, `token-interpolated`, `chunk-interpolated`, or `low-confidence-fallback`. Caption intervals remain exact half-open `CaptionSegment.startMs`/`endMs` values shared by preview and timeline; fades are bounded inside those intervals.

## Performance and limitations

The full corpus has 6,236 ayat, but only bounded anchor windows receive dynamic programming. The noisy five-ayah Ad-Duha regression scores in approximately 0.73 s in Node on this workspace; PCM envelope construction is linear in source duration. This is deterministic refinement around ASR word evidence, not phonetic forced alignment: difficult ASR, heavy reverb, or weak word timestamps can still fall back to interpolation and merit manual correction. Browser fixture measurements remain required to quantify boundary error across real reciters and codecs.

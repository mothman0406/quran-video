# Quran recognition and forced alignment

## Architecture decision

Recognition is a browser-local, accuracy-first hybrid pipeline:

1. Decode the selected media once to mono PCM and build a 10 ms RMS envelope.
2. Run lazy-loaded local Whisper Base Timestamped over overlapping 30-second windows.
3. Retrieve high-recall Quran candidates, then score contiguous passages against the whole recording.
4. Freeze the selected canonical Quran word span.
5. Run a second, canonical-first alignment pass. Timestamped ASR words are mapped onto that fixed word sequence with a strongly forward path and a bounded five-word backward allowance for immediate repetitions.
6. Refine word edges and text-associated pause candidates from the local PCM envelope.
7. Derive ayah timings and caption display sets from word occurrences, without mutating the canonical recognition result.

The canonical Hafs corpus is the displayed text authority. Whisper supplies retrieval and coarse temporal evidence only.

## Alternatives considered

- Better use of Whisper word timestamps alone: rejected because timestamps cannot represent repeated canonical words and are not a forced-alignment model.
- Existing ASR-to-ayah interpolation: retained only as a compatibility fallback for persisted `VerseAlignment`; it collapses too much timing detail for caption generation.
- A second browser-local Arabic CTC/forced-alignment model: rejected for now. No tested, compact Arabic Quran CTC model is available in the current local runtime; adding an unvalidated large model would increase first-run download and memory without demonstrated accuracy improvement.

Whisper Base Timestamped remains lazy loaded, local, and approximately 145 MB q4 on first download. The canonical second pass is linear in ASR words times a small local (15-word) corridor, so it adds modest CPU work but no model/network cost. Processing may be roughly up to twice the old timing stage for difficult recordings, by design.

## Output layers

- `CanonicalPassageWord`: fixed Quran identity and canonical position.
- `WordOccurrence`: each audible occurrence, including repeated local words, with evidence and confidence.
- `ForcedVerseTiming`: timing for every intersected ayah, including partial-start/end metadata.
- `PauseCandidate`: low-energy interval associated with a canonical boundary, never global silence segmentation.
- `CaptionSetPlan`: natural, word-boundary-only display proposals. Long ayat prefer scored pauses near a readable word count; prior text remains visible until the next set begins.

Manual timeline edits remain authoritative for presentation and never rewrite canonical recognition.

## Debugging

Every recognition run stores a JSON-safe report at `window.__QURAN_ALIGNMENT_DEBUG__` in development. The normal editor exposes **Copy Alignment Debug** after recognition; the development `/recognition` route includes the same data in its debug export. Reports contain source metadata, transcriber/runtime details, passage candidates, word occurrences, verse timings, pause candidates, and display sets—never media bytes.

## Current limitations

This is text-constrained forced alignment rather than phoneme/CTC alignment. Its accuracy is bounded by local Whisper anchors, especially where ASR misses several consecutive words or fails to emit Arabic timestamps. Acoustic refinement uses RMS energy (not phonetic boundaries), so it marks reliable onset/offset and pauses rather than claiming sub-phoneme precision.

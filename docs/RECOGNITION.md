# Quran recognition and forced alignment

## Architecture decision

Recognition is a browser-local, accuracy-first hybrid pipeline:

1. Decode the selected media once to mono PCM and build a 10 ms RMS envelope.
2. Run lazy-loaded local Whisper Base Timestamped over overlapping 30-second windows.
3. Retrieve high-recall Quran candidates, then score contiguous passages against the whole recording.
4. Freeze the selected contiguous canonical ayat. Canonical display ranges default to each full ayah; an unmatched first or last ASR word is not evidence that the reciter skipped it.
5. Run a canonical-first alignment pass. Each canonical word receives an evidence-graded timing record, including interpolated words between anchors. Timestamped ASR words are direct evidence; chunk text is only coarse evidence. A backward jump requires a following sequential word, so one noisy token cannot invent a repetition.
6. If word timestamps are unavailable, or an ayah has no direct anchor, trim the timing search to detected speech regions and run bounded overlapping local micro-ASR windows against the already-known passage. The first verified Quran-containing window anchors onset; a missing interior ayah is explicitly searched between neighbouring evidence before interpolation is allowed.
7. Refine verified onset, offset, and ayah transitions from the local PCM envelope. Derive one complete-ayah caption display set per ayah, without mutating the canonical recognition result.

The canonical Hafs corpus is the displayed text authority. Whisper supplies retrieval and coarse temporal evidence only.

## Alternatives considered

- Better use of Whisper word timestamps alone: rejected because timestamps cannot represent repeated canonical words and are not a forced-alignment model.
- Existing ASR-to-ayah interpolation: retained only as a compatibility fallback for persisted `VerseAlignment`; it collapses too much timing detail for caption generation.
- A second browser-local Arabic CTC/forced-alignment model: rejected for now. No tested, compact Arabic Quran CTC model is available in the current local runtime; adding an unvalidated large model would increase first-run download and memory without demonstrated accuracy improvement.

Whisper Base Timestamped remains lazy loaded, local, and approximately 145 MB q4 on first download. The recovery pass reuses that in-memory model and decoded PCM: it reads up to sixteen 8-second windows with a 2-second overlap, bounded to active speech instead of rerunning the entire recording. This can roughly double difficult fallback runs, by design, with no additional model download or network use.

## Output layers

- `CanonicalPassageWord`: fixed Quran identity and canonical position.
- `CanonicalWordAlignment`: one record for every selected canonical word. `directMatch`, `recoveredMatch`, and timing evidence distinguish word timestamps, micro-ASR, PCM refinement, interpolation, coarse chunks, and unknown timing.
- `WordOccurrence`: ASR observations, including meaningful repeated local words and explicitly labelled coarse chunks; it never determines which Arabic words are displayed.
- `ForcedVerseTiming`: timing for every intersected ayah, direct/recovered word coverage, recovery status, and conservative partial-start/end metadata.
- `PauseCandidate`: low-energy interval associated with a canonical boundary, never global silence segmentation.
- `CaptionSetPlan`: currently exactly one full canonical ayah per automatic display set. Pause and splitting evidence remain available internally for a later reactivation.

Manual timeline edits remain authoritative for presentation and never rewrite canonical recognition.

## Debugging

Every recognition run stores a JSON-safe report at `window.__QURAN_ALIGNMENT_DEBUG__` in development. The normal editor exposes **Copy Alignment Debug** after recognition; the development `/recognition` route includes the same data in its debug export. Reports explicitly include word-timestamp availability, micro-ASR use, direct/recovered coverage by ayah, verse-start evidence, recovery windows, the first-onset trace, canonical word alignments, direct observations, and display sets—never media bytes.

## Current limitations

This is text-constrained forced alignment rather than phoneme/CTC alignment. Micro-ASR supplies stronger verse-level localization when word timestamps fail, but it is still not a phonetic boundary model; interpolated canonical-word timing is deliberately marked as such. Acoustic refinement uses RMS energy (not phonetic boundaries), so it can refine verified onset/offset and pauses without claiming sub-phoneme precision. Manual timeline adjustment remains appropriate for noisy recitation.

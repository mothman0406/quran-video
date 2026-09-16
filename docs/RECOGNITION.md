# Quran recognition and forced alignment

## Architecture decision

Recognition is a browser-local, accuracy-first hybrid pipeline:

1. Decode the selected media once to mono PCM and build a 10 ms RMS envelope.
2. Run FastConformer Quran-wide CTC retrieval/reranking over VAD-qualified windows, solve a surah-aware continuity path, and pass it through the centralized production evidence gate.
3. Adapt an accepted FastConformer word-level range to `FinalCanonicalSpan`. Canonical display ranges remain full ayat; identifier word boundaries remain evidence only.
4. When a native-decoded FastConformer result is insufficient, make one local FFmpeg 16 kHz PCM recovery attempt and rerun VAD plus the same FastConformer gate. This is independent preprocessing, not a lower threshold.
5. Only when FastConformer remains insufficient, ambiguous, or structurally invalid, run lazy-loaded local Whisper Base Timestamped and retain its whole-recording matcher as the fallback passage engine.
6. Run the existing canonical-first FastConformer forced alignment. It remains the sole automatic timing authority regardless of passage source.
7. If word timestamps are unavailable, or an ayah has no direct anchor, trim the timing search to detected speech regions and run bounded overlapping local micro-ASR windows against the already-known passage. Micro-ASR is timing-only evidence and cannot replace the primary passage. The first verified Quran-containing window anchors onset; a missing interior ayah is explicitly searched between neighbouring evidence before interpolation is allowed.
8. Refine verified onset, offset, and ayah transitions from the local PCM envelope. Derive one complete-ayah caption display set per ayah, without mutating the canonical recognition result.

The canonical Hafs corpus is the displayed text authority. FastConformer identification decides what passage was recited; FastConformer forced alignment decides when its canonical words occur. Whisper is fallback passage evidence only.

The production evidence gate always requires a passing best-window CTC score,
margin, VAD-qualified coverage, multi-window agreement, structural validity,
and same-surah coherence. Short recordings use those signals without requiring
every supporting window to meet the aggregate acoustic threshold. Recordings
with five or more generated identification windows additionally require a
passing coherent-path mean CTC score and the long-timeline support, gap, and
lexical-uniqueness safeguards.

## Alternatives considered

- Better use of Whisper word timestamps alone: rejected because timestamps cannot represent repeated canonical words and are not a forced-alignment model.
- Existing ASR-to-ayah interpolation: retained only as a compatibility fallback for persisted `VerseAlignment`; it collapses too much timing detail for caption generation.
- A second browser-local Arabic CTC/forced-alignment model: rejected for now. No tested, compact Arabic Quran CTC model is available in the current local runtime; adding an unvalidated large model would increase first-run download and memory without demonstrated accuracy improvement.

Whisper Base Timestamped remains lazy loaded, local, and approximately 145 MB q4 on first download. PCM recovery reuses the already-loaded FastConformer worker/model, but deliberately replaces its input with one FFmpeg-extracted PCM representation before rerunning VAD and identification. It never downloads a second FastConformer model or changes the evidence threshold.

## Output layers

- `CanonicalPassageWord`: fixed Quran identity and canonical position.
- `CanonicalWordAlignment`: one record for every selected canonical word. `directMatch`, `recoveredMatch`, and timing evidence distinguish word timestamps, micro-ASR, PCM refinement, interpolation, coarse chunks, and unknown timing.
- `WordOccurrence`: ASR observations, including meaningful repeated local words and explicitly labelled coarse chunks; it never determines which Arabic words are displayed.
- `ForcedVerseTiming`: timing for every intersected ayah, direct/recovered word coverage, recovery status, and conservative partial-start/end metadata.
- `PauseCandidate`: low-energy interval associated with a canonical boundary, never global silence segmentation.
- `CaptionSetPlan`: currently exactly one full canonical ayah per automatic display set. Pause and splitting evidence remain available internally for a later reactivation.

Manual timeline edits remain authoritative for presentation and never rewrite canonical recognition.

## Debugging

Every recognition run stores a JSON-safe report at `window.__QURAN_ALIGNMENT_DEBUG__` in development. The normal editor exposes **Copy Alignment Debug** after recognition; the development `/recognition` route includes the same data in its debug export. `PASSAGE_IDENTIFICATION_DEBUG_REPORT` preserves normalized CTC output/token IDs, ten candidates per identification window, retrieval/reranking/coverage scores, repeated-phrase ambiguity, canonical boundary/prelude evidence, global competing hypotheses, cross-surah rejections, and the final acceptance/rejection reason. It never contains PCM, a media URL, filename, media bytes, or customer transcript. See `docs/PASSAGE_IDENTIFICATION_AUDIT.md` for the decision-path audit and real-clip procedure.

## Current limitations

This is text-constrained forced alignment rather than phoneme/CTC alignment. Micro-ASR supplies stronger verse-level localization when word timestamps fail, but it is still not a phonetic boundary model; interpolated canonical-word timing is deliberately marked as such. Acoustic refinement uses RMS energy (not phonetic boundaries), so it can refine verified onset/offset and pauses without claiming sub-phoneme precision. Manual timeline adjustment remains appropriate for noisy recitation.

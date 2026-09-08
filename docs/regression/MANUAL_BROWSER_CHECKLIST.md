# Pre-production Quran browser checklist

Use retained local source media only. Do not add it to Git. This is designed to take 10–15 minutes.

1. **Al-Ma'arij opening:** import the historical clip and generate captions. PASS means the accepted passage is Surah 70, never 32:5, and its Arabic is canonical.
2. **Clean clip:** generate captions from one clean recording. PASS means caption onset matches recitation, all canonical words are ordered once, and no unstable identity appears while generating.
3. **Long ayah (18:57):** PASS means automatic Arabic uses several contiguous pieces, retains every word once, translates each piece in order, and only the last piece carries the verse ornament.
4. **Portrait video:** PASS means a portrait source chooses the portrait project format; preview and exported video show the full source frame with contain/fit (no accidental crop).
5. **Audio-only:** PASS means recognition, neutral canvas, captions, waveform, playback, and export all work.
6. **Highlighting:** use Read so far. PASS means past words remain highlighted, future words do not, the final ornament follows the final word, intermediate split pieces have no ornament, and a basmalah stays separate.
7. **Safe zones:** switch TikTok, Reels, and Shorts guides, move captions to safety, then Undo/Redo. PASS means normalized editor-only guides and exact state restoration; guides never appear in export.
8. **Speed:** check 0.5x and 2x. PASS means source-aligned caption/highlight timing remains correct, duration scales, and browser audio pitch is preserved.
9. **1080p export/download:** PASS means Standard exports 1080p with no watermark, preserves Quran/highlighting timing, contains no safe-zone guide, and Download retrieves the completed Blob.
10. **Another version:** after a successful export, open Export settings. PASS means it does not render immediately, the previous completed download remains available, and rendering begins only after Export video → preflight → render.

Also run the noisy Surah 74 and historical 6:74–77 clips when available. PASS means Surah 74 stays within 74:1–9 without prior-surah leakage, and 6:77 remains around 44.8 seconds—not the retired ~50.6-second behavior.

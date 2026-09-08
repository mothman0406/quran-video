# Final pre-production manual QA

Use a known, non-private Quran video with audible recitation and keep one short audio-only file available. This walkthrough takes about 15–20 minutes. Do not use production TikTok credentials unless the app is already approved for them.

## 1. Landing and entry — 2 minutes

1. At 1440px, then 768px and 390px wide, open `/` and scroll from top to bottom.
   - PASS: the page scrolls normally, has no horizontal overflow, sticky navigation remains usable, imagery is readable, and reduced-motion preference does not prevent access to content.
2. Use every primary CTA, including **Start creating free**.
   - PASS: each enters `/editor`; the editor also opens directly in a new tab without visiting `/`.

## 2. Media and recognition — 4 minutes

1. Create a clean editor project and import the known video.
   - PASS: its metadata and duration are correct, the preview contains the full source frame, audio plays, a waveform appears, and the asset is listed.
2. Import the audio-only file in a clean project.
   - PASS: a neutral canvas, waveform, playback, and caption-generation controls are available.
3. Generate captions for the known Quran clip, then review the identified passage.
   - PASS: no confident wrong passage is accepted; Arabic is canonical, captions begin at recitation onset, and the final caption survives through recitation completion.
4. If local YouTube tooling is configured, import one permitted test URL.
   - PASS: the import follows the same source workflow. If `yt-dlp` is unavailable, the app explains the local-tool dependency without claiming success.

## 3. Captions, workspace, and playback — 5 minutes

1. Select Arabic from the preview and timeline.
   - PASS: each selects the exact same segment and opens **Subtitles**.
2. Change a global font size, then a segment-only color/position; use **Use global style**; undo and redo each change.
   - PASS: scope is respected and every state restores exactly.
3. Confirm **Read so far** is the default, then try each highlight swatch and a long ayah such as 18:57.
   - PASS: canonical words remain complete and ordered, only the terminal ayah piece has the ornament, and the basmalah remains separate.
4. Toggle translation and edit a fragment if available.
   - PASS: semantic pieces remain ordered, reset/review state is clear, and Arabic and translation do not overlap by default.
5. Resize/collapse/restore both side panels and the timeline; scroll each sidebar.
   - PASS: custom sizes return, the timeline stays between sidebars, inspector controls remain reachable, editor document scrolling does not appear, and no resize creates history or seeks media.
6. Try 0.5x and 2x playback.
   - PASS: source-time timeline/trim/captions/highlighting stay synchronized. Also listen for preserved pitch at both speeds.

## 4. Safe zones and export — 5 minutes

1. Switch among None, TikTok, Instagram Reels, and YouTube Shorts guides; use **Move to safe area**, undo, and redo.
   - PASS: guides are preview-only, the linked Arabic/translation footprint moves safely, and exported output has no guides.
2. Choose **Export**.
   - PASS: **Export Settings** opens first; Basic is 720p/watermarked, Standard is 1080p, and Ultra is 4K. Check the displayed dimensions for the chosen project format.
3. Export a healthy Standard project.
   - PASS: healthy preflight is silent, render completes, and completion shows a Blob-backed MP4 with filename, dimensions, duration, playback rate, quality, and size.
4. Download twice, then choose **Export another version** and select Basic.
   - PASS: downloads reuse the existing completed Blob with no recognition/preflight/rerender; another version returns to settings; Basic output visibly carries the watermark.
5. Trigger one known warning and one known blocker with a disposable test project.
   - PASS: warnings offer Review/Fix and Export anyway; blockers prevent rendering; a failed replacement leaves the previous download available without displaying contradictory success/error states.

## 5. TikTok and final handoff — 2 minutes

1. From Basic, open **Post to TikTok**.
   - PASS: posting is blocked and offers **Export Standard version**; no watermark is silently removed.
2. From Standard or Ultra, open **Post to TikTok** with credentials absent.
   - PASS: an understandable configuration state appears; editor/export/download remain usable.
3. In the approved sandbox/mock environment, exercise Direct and Draft posting through connect, creator settings, editable social caption, explicit confirmation, transfer, and status.
   - PASS: media transfer progress and outcomes are clear; expired auth, upload failure, processing failure, retry, and cancel preserve the completed export and its download.

Record the browser/device, source fixture identity, observed result, and any console error for every failure. Do not treat unavailable local media, TikTok credentials, or browser encoder capability as a pass.

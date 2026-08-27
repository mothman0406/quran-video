# Product

Quran-first video caption editor for recitation videos. The product will identify the recited surah and ayat, align canonical Hafs Arabic, and optionally show Saheeh International translation and transliteration over the video.

Defaults: vertical 9:16, centered Arabic with translation below, ayah-level timing, and editable fades. Users will eventually be able to adjust text, timing, position, style, typography, and output format.

V1 is Hafs only. Madinah/QCF, Uthmani, IndoPak, and KFGQPC typography are planned choices. Recognition, canonical content, rendering, accounts, billing, and additional media features are explicitly staged for later milestones.

## Local-first product behavior

- Selecting a source video starts a browser-local editing session. The source video remains local by default, and the editor should keep draft state local where practical.
- The product may send a temporary copy for a processing or rendering job when required. That copy is deleted when the job completes, including unsuccessful or expired jobs.
- Export downloads directly to the user. The service does not keep a rendered export by default.
- “Save Project” is an explicit opt-in action, separate from editing and exporting. Initially it saves lightweight project metadata and settings only—not source videos or rendered exports.
- When a saved project is reopened, the user may need to reselect the original local video. Without that video, the saved settings and caption work can be viewed or edited, but preview, processing, and rendering cannot resume.

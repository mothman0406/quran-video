# Milestones

- **M0 — Foundation:** product/architecture docs and shared project schema, including the local-first and ephemeral media contract.
- **M1 — Video + hardcoded Quran overlay:** select a video in the browser and play it with a fixed Quran caption; keep the source local by default and do not add server-side source persistence.
- **M2 — Quran Foundation content/fonts:** replace fixtures with canonical Hafs content, translations, transliteration, and supported font data.
- **M3 — Automatic recitation recognition spike:** evaluate surah/ayah and timing detection offline.
- **M4 — Recognition integrated with upload UI:** run recognition for a selected video and populate alignments; if recognition needs server media, use a temporary job copy with guaranteed cleanup.
- **M5 — Timeline/editor controls:** edit segments, split/merge, timing, text visibility, position, and style.
- **M6 — Animations/templates:** editable smooth fades and reusable caption layouts.
- **M7 — MP4 rendering/export:** render the edited composition with Remotion, clean up any temporary server media, and download the MP4 directly to the user.
- **M8 — Supabase accounts/saved projects:** add auth and explicit opt-in persistence for lightweight project metadata/settings only; do not add default source-video or rendered-export storage.
- **M9 — Stripe quotas/subscriptions:** add usage limits and paid plans.
- **M10 — Future formats/qiraat/media library:** support other formats, future qiraat decisions, and media organization.

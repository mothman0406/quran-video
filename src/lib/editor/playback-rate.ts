/** Project playback is a presentation concern; all editor timings stay source-time based. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export const DEFAULT_PLAYBACK_RATE: PlaybackRate = 1;

export function isPlaybackRate(value: unknown): value is PlaybackRate {
  return typeof value === "number" && (PLAYBACK_RATES as readonly number[]).includes(value);
}

/** Keeps malformed or legacy persisted values on the safe, neutral presentation rate. */
export function resolvePlaybackRate(value: unknown): PlaybackRate {
  return isPlaybackRate(value) ? value : DEFAULT_PLAYBACK_RATE;
}

export function playbackRateLabel(rate: PlaybackRate): string {
  return `${rate}x`;
}

type PitchPreservingMedia = Pick<HTMLMediaElement, "playbackRate" | "defaultPlaybackRate"> & {
  preservesPitch?: boolean;
  webkitPreservesPitch?: boolean;
  mozPreservesPitch?: boolean;
};

/** Deliberately never seeks: rate changes preserve the shared source-time clock. */
export function applyPlaybackRate(media: PitchPreservingMedia, rate: PlaybackRate): void {
  media.playbackRate = rate;
  media.defaultPlaybackRate = rate;
  if ("preservesPitch" in media) media.preservesPitch = true;
  if ("webkitPreservesPitch" in media) media.webkitPreservesPitch = true;
  if ("mozPreservesPitch" in media) media.mozPreservesPitch = true;
}

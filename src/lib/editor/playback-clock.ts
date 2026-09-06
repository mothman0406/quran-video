export type PlaybackMediaElement = Pick<HTMLMediaElement, "currentTime" | "paused" | "ended">;

export type PlaybackUpdateSource =
  | "animation-frame"
  | "ended"
  | "pause"
  | "play"
  | "seek"
  | "source-replaced"
  | "timeupdate";

type PlaybackClockOptions = {
  onSample: (currentTimeMs: number, source: PlaybackUpdateSource) => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (requestId: number) => void;
};

/**
 * Samples the active media element without ever advancing a synthetic clock.
 * Both audio and video therefore expose the same authoritative media time to
 * the editor while playback is active.
 */
export class MediaPlaybackClock {
  private media: PlaybackMediaElement | null = null;
  private frameId: number | null = null;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (requestId: number) => void;
  private readonly onSample: PlaybackClockOptions["onSample"];

  constructor(options: PlaybackClockOptions) {
    this.onSample = options.onSample;
    this.requestFrame = options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrame = options.cancelFrame ?? ((requestId) => cancelAnimationFrame(requestId));
  }

  get isRunning(): boolean {
    return this.frameId !== null;
  }

  setMedia(media: PlaybackMediaElement | null): void {
    if (this.media === media) return;
    this.stop("source-replaced");
    this.media = media;
  }

  start(media?: PlaybackMediaElement | null): void {
    if (media !== undefined) this.setMedia(media);
    if (!this.media || this.frameId !== null) return;
    this.sample("play");
    this.schedule();
  }

  stop(source: Extract<PlaybackUpdateSource, "pause" | "ended" | "source-replaced">): void {
    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }
    this.sample(source);
  }

  sync(source: Extract<PlaybackUpdateSource, "seek" | "timeupdate">): void {
    this.sample(source);
  }

  dispose(): void {
    if (this.frameId !== null) {
      this.cancelFrame(this.frameId);
      this.frameId = null;
    }
    this.media = null;
  }

  private schedule(): void {
    this.frameId = this.requestFrame(() => {
      this.frameId = null;
      if (!this.media || this.media.paused || this.media.ended) return;
      this.sample("animation-frame");
      this.schedule();
    });
  }

  private sample(source: PlaybackUpdateSource): void {
    if (!this.media || !Number.isFinite(this.media.currentTime)) return;
    this.onSample(this.media.currentTime * 1_000, source);
  }
}

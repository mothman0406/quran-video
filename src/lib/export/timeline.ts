export const DEFAULT_EXPORT_FRAME_RATE = 30;

export function resolveExportFrameRate(sourceFps: number | null | undefined): number {
  return sourceFps && Number.isFinite(sourceFps) && sourceFps >= 12 && sourceFps <= 60 ? sourceFps : DEFAULT_EXPORT_FRAME_RATE;
}

/** Returns a deterministic zero-based timeline that always ends at source duration. */
export function frameTimeline(durationSeconds: number, frameRate: number): Array<{ timestamp: number; duration: number }> {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || !Number.isFinite(frameRate) || frameRate <= 0) return [];
  const interval = 1 / frameRate;
  const frames: Array<{ timestamp: number; duration: number }> = [];
  for (let timestamp = 0; timestamp < durationSeconds - 1e-9; timestamp += interval) {
    frames.push({ timestamp, duration: Math.min(interval, durationSeconds - timestamp) });
  }
  return frames;
}

export function durationMatches(expectedSeconds: number, actualSeconds: number, toleranceSeconds = 0.12): boolean {
  return Number.isFinite(expectedSeconds) && Number.isFinite(actualSeconds) && Math.abs(expectedSeconds - actualSeconds) <= toleranceSeconds;
}

export function coverPlacement(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

/** Centers the entire source frame inside a project canvas without distortion. */
export function containPlacement(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}

/** Gives cleanup a single, testable cancellation boundary. */
export function onceCleanup(cleanup: () => void): () => void {
  let complete = false;
  return () => { if (!complete) { complete = true; cleanup(); } };
}

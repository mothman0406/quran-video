export type LocalMediaPreparationStage =
  | "checking"
  | "preparing-converter"
  | "inspecting-recording"
  | "converting-recording"
  | "preparing-audio"
  | "preparing-editor";

export type LocalMediaPreparationProgress = {
  stage: LocalMediaPreparationStage;
  /** Present only while FFmpeg is processing media against a known source duration. */
  percentage?: number;
};

function clampPercentage(value: number) {
  return Math.min(100, Math.max(0, value));
}

/**
 * Owns one local media-preparation job. FFmpeg may emit slightly noisy time
 * events, so each measurable operation displays only its greatest valid value.
 */
export class LocalMediaPreparationProgressController {
  private job: number | null = null;
  private highestPercentage = 0;
  private value: LocalMediaPreparationProgress | null = null;

  start(job: number, stage: LocalMediaPreparationStage = "checking") {
    this.job = job;
    this.highestPercentage = 0;
    this.value = { stage };
    return this.value;
  }

  stage(job: number, stage: LocalMediaPreparationStage) {
    if (this.job !== job) return null;
    this.highestPercentage = 0;
    this.value = { stage };
    return this.value;
  }

  reportProcessedTime(job: number, stage: Extract<LocalMediaPreparationStage, "converting-recording" | "preparing-audio">, processedTimeMs: number, sourceDurationMs?: number) {
    if (this.job !== job || !Number.isFinite(processedTimeMs) || !Number.isFinite(sourceDurationMs) || !sourceDurationMs || sourceDurationMs <= 0) return null;
    const percentage = clampPercentage(Math.round((processedTimeMs / sourceDurationMs) * 100));
    this.highestPercentage = Math.max(this.highestPercentage, percentage);
    this.value = { stage, percentage: this.highestPercentage };
    return this.value;
  }

  complete(job: number, stage: Extract<LocalMediaPreparationStage, "converting-recording" | "preparing-audio">, sourceDurationMs?: number) {
    return this.reportProcessedTime(job, stage, sourceDurationMs ?? Number.NaN, sourceDurationMs);
  }

  clear(job: number) {
    if (this.job !== job) return null;
    this.job = null;
    this.highestPercentage = 0;
    this.value = null;
    return this.value;
  }

  reset() {
    this.job = null;
    this.highestPercentage = 0;
    this.value = null;
  }

  snapshot() { return this.value; }
}

/** Limits React updates without delaying a real stage transition or completion. */
export class LocalMediaPreparationProgressCoalescer {
  private previous: LocalMediaPreparationProgress | null = null;
  private publishedAt = 0;

  reset() {
    this.previous = null;
    this.publishedAt = 0;
  }

  shouldPublish(next: LocalMediaPreparationProgress | null, now = performance.now()) {
    if (!next) return false;
    const previous = this.previous;
    const stageChanged = previous?.stage !== next.stage;
    const percentageChanged = previous?.percentage !== next.percentage;
    const completed = next.percentage === 100;
    if (!stageChanged && !completed && (!percentageChanged || now - this.publishedAt < 150)) return false;
    this.previous = next;
    this.publishedAt = now;
    return true;
  }
}

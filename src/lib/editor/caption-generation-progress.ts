export type CaptionGenerationPhase =
  | "preparing-media"
  | "analyzing-speech"
  | "downloading-model"
  | "identifying-passage"
  | "confirming-passage"
  | "aligning-words"
  | "building-captions"
  | "adding-translation"
  | "finalizing"
  | "complete"
  | "manual-correction"
  | "failed";

export type CaptionGenerationProgress = {
  phase: CaptionGenerationPhase;
  /** Inclusive 0..1 overall progress; it only moves forward within one job. */
  progress: number;
  label: string;
  detail?: string;
};

type PhaseDefinition = {
  label: string;
  start: number;
  end: number;
};

// Download overlaps the start of identification intentionally. Cached runs do
// not reserve an empty slice of the overall progress bar for model fetching.
const PHASES: Record<Exclude<CaptionGenerationPhase, "complete" | "manual-correction" | "failed">, PhaseDefinition> = {
  "preparing-media": { label: "Preparing your recitation…", start: 0, end: 0.1 },
  "analyzing-speech": { label: "Listening for the Quran passage…", start: 0.1, end: 0.18 },
  "downloading-model": { label: "Downloading Quran recognition model…", start: 0.18, end: 0.32 },
  "identifying-passage": { label: "Identifying the Surah and ayat…", start: 0.18, end: 0.62 },
  "confirming-passage": { label: "Confirming the Quran text…", start: 0.62, end: 0.66 },
  "aligning-words": { label: "Syncing Quran words to your recitation…", start: 0.66, end: 0.86 },
  "building-captions": { label: "Building your captions…", start: 0.86, end: 0.93 },
  "adding-translation": { label: "Adding translation…", start: 0.93, end: 0.98 },
  finalizing: { label: "Finishing your project…", start: 0.98, end: 0.995 },
};

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

function phaseProgress(phase: keyof typeof PHASES, fraction?: number) {
  const definition = PHASES[phase];
  return definition.start + (definition.end - definition.start) * clamp(fraction ?? 0);
}

/**
 * Owns progress for one generation job. Reports from previous jobs are
 * ignored, which keeps source changes and retries from reviving stale UI.
 */
export class CaptionGenerationProgressController {
  private job: number | null = null;
  private value: CaptionGenerationProgress | null = null;

  start(job: number) {
    this.job = job;
    this.value = null;
    this.value = this.report(job, "preparing-media");
    return this.value;
  }

  report(
    job: number,
    phase: keyof typeof PHASES,
    fraction?: number,
    detail?: string,
  ) {
    if (this.job !== job) return null;
    const definition = PHASES[phase];
    const progress = Math.max(this.value?.progress ?? 0, phaseProgress(phase, fraction));
    this.value = { phase, progress, label: definition.label, ...(detail ? { detail } : {}) };
    return this.value;
  }

  confirmIdentity(job: number, detail: string) {
    return this.report(job, "confirming-passage", 1, detail);
  }

  complete(job: number) {
    if (this.job !== job) return null;
    this.value = { phase: "complete", progress: 1, label: "Captions are ready" };
    return this.value;
  }

  manualCorrection(job: number) {
    if (this.job !== job) return null;
    const progress = Math.max(this.value?.progress ?? 0, PHASES["confirming-passage"].end);
    this.value = { phase: "manual-correction", progress, label: "Choose the Quran passage manually" };
    return this.value;
  }

  fail(job: number) {
    if (this.job !== job) return null;
    this.value = { phase: "failed", progress: this.value?.progress ?? 0, label: "Caption generation needs attention" };
    return this.value;
  }

  reset() {
    this.job = null;
    this.value = null;
    return this.value;
  }
}

export function captionGenerationProgressForDownload(
  controller: CaptionGenerationProgressController,
  job: number,
  bytesLoaded: number,
  bytesTotal: number,
) {
  const percent = Math.round((bytesLoaded / Math.max(1, bytesTotal)) * 100);
  return controller.report(job, "downloading-model", bytesLoaded / Math.max(1, bytesTotal), `${percent}% downloaded`);
}

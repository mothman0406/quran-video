"use client";

import { useSyncExternalStore } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AccountEntitlements } from "./entitlements.ts";
import { quranProjectMetadata } from "./cloud-projects.ts";
import {
  beginCloudProjectSave,
  cancelCloudProjectSave,
  completeCloudProjectSave,
  createProjectThumbnail,
  deleteCloudProject,
  listCloudProjectRecords,
  newCloudSourcePath,
  newCloudThumbnailPath,
  removePrivateProjectObjects,
  uploadPrivateProjectObject,
} from "./cloud-sync.ts";
import { createProjectRepository, type ProjectRepository } from "./project-storage.ts";
import { LocalRecognitionWorkerClient, RecognitionJobCancelledError } from "./recognition/recognition-worker-client.ts";
import type { DecodedAudioChannels } from "./recognition/local-audio-decode.ts";
import type { CaptionGenerationProgress } from "./editor/caption-generation-progress.ts";
import type { SavedProject } from "./schemas/project.ts";
import { freeFifoReplacement } from "./video-fifo.ts";

export type VideoJobStatus = "generating" | "ready" | "failed" | "interrupted";

export type VideoJob = {
  id: string;
  project: SavedProject;
  status: VideoJobStatus;
  progress: CaptionGenerationProgress | null;
  error: string | null;
  cloudSaved: boolean;
  cloudError: string | null;
};

export type VideoRuntime = {
  file: File;
  sourceUrl: string;
  posterUrl: string | null;
};

export type StartVideoJobInput = {
  project: SavedProject;
  file: File;
  preparedAudio?: DecodedAudioChannels;
  session: Session | null;
  entitlements: AccountEntitlements;
};

type RuntimeEntry = VideoRuntime & {
  poster: Blob | null;
  preparedAudio?: DecodedAudioChannels;
  session: Session | null;
  entitlements: AccountEntitlements;
  runToken: number;
  workerJobId: number | null;
};

type PersistedVideoJob = Pick<VideoJob, "id" | "status" | "error" | "cloudSaved" | "cloudError">;

const STORAGE_KEY = "quran-autocaption-video-jobs-v1";

function publicJob(job: VideoJob): VideoJob {
  return { ...job, project: structuredClone(job.project), progress: job.progress ? { ...job.progress } : null };
}

class VideoJobManager {
  private jobs = new Map<string, VideoJob>();
  private runtimes = new Map<string, RuntimeEntry>();
  private listeners = new Set<() => void>();
  private snapshot: VideoJob[] = [];
  private repository: ProjectRepository | null = null;
  private worker: LocalRecognitionWorkerClient | null = null;
  private nextWorkerJobId = 1;
  private queue: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => EMPTY_VIDEO_JOBS;

  initialize(): Promise<void> {
    this.initialization ??= this.hydrate();
    return this.initialization;
  }

  private async hydrate() {
    if (typeof indexedDB === "undefined") return;
    this.repository = createProjectRepository();
    const projects = await this.repository.list().catch(() => []);
    let persisted: PersistedVideoJob[] = [];
    try {
      persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as PersistedVideoJob[];
    } catch {
      persisted = [];
    }
    for (const item of persisted) {
      if (this.jobs.has(item.id)) continue;
      const project = projects.find((candidate) => candidate.id === item.id);
      if (!project) continue;
      const status = item.status === "generating" ? "interrupted" : item.status;
      this.jobs.set(item.id, {
        id: item.id,
        project,
        status,
        progress: null,
        error: status === "interrupted" ? "Local caption generation stopped when this page closed. Relink the source in the editor or retry while this tab remains open." : item.error,
        cloudSaved: item.cloudSaved,
        cloudError: item.cloudError,
      });
    }
    this.publish();
  }

  start(input: StartVideoJobInput): string {
    const id = input.project.id;
    const previous = this.runtimes.get(id);
    if (previous) this.revokeRuntime(previous);
    const sourceUrl = URL.createObjectURL(input.file);
    this.runtimes.set(id, {
      file: input.file,
      sourceUrl,
      posterUrl: null,
      poster: null,
      preparedAudio: input.preparedAudio,
      session: input.session,
      entitlements: input.entitlements,
      runToken: (previous?.runToken ?? 0) + 1,
      workerJobId: null,
    });
    this.jobs.set(id, { id, project: input.project, status: "generating", progress: null, error: null, cloudSaved: false, cloudError: null });
    this.publish();
    this.queue = this.queue.catch(() => undefined).then(async () => {
      await this.initialize();
      await this.run(id);
    });
    return id;
  }

  retry(id: string): boolean {
    const job = this.jobs.get(id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || (job.status !== "failed" && job.status !== "interrupted")) return false;
    runtime.runToken += 1;
    runtime.workerJobId = null;
    this.jobs.set(id, { ...job, status: "generating", progress: null, error: null, cloudError: null });
    this.publish();
    this.queue = this.queue.catch(() => undefined).then(() => this.run(id));
    return true;
  }

  getRuntime(id: string): VideoRuntime | null {
    const runtime = this.runtimes.get(id);
    return runtime ? { file: runtime.file, sourceUrl: runtime.sourceUrl, posterUrl: runtime.posterUrl } : null;
  }

  attachRuntime(id: string, file: File): VideoRuntime {
    const current = this.runtimes.get(id);
    if (current) this.revokeRuntime(current);
    const sourceUrl = URL.createObjectURL(file);
    const runtime: RuntimeEntry = {
      file,
      sourceUrl,
      posterUrl: null,
      poster: null,
      session: null,
      entitlements: { plan: "free", maxExportQuality: "basic", watermarkRequiredForBasic: true, canExportStandard: false, canExportUltra: false, cloudProjectLimit: 3 },
      runToken: 0,
      workerJobId: null,
    };
    this.runtimes.set(id, runtime);
    return { file, sourceUrl, posterUrl: null };
  }

  async remove(id: string, removeCloud = false): Promise<void> {
    const runtime = this.runtimes.get(id);
    if (runtime?.workerJobId !== null && runtime?.workerJobId !== undefined) this.worker?.cancel(runtime.workerJobId);
    if (runtime) this.revokeRuntime(runtime);
    this.runtimes.delete(id);
    this.jobs.delete(id);
    await this.initialize();
    await this.repository?.delete(id);
    if (removeCloud) await deleteCloudProject(id);
    this.publish();
  }

  private async run(id: string) {
    const job = this.jobs.get(id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime) return;
    const token = runtime.runToken;
    const workerJobId = this.nextWorkerJobId++;
    runtime.workerJobId = workerJobId;
    await this.repository?.put(job.project);
    void this.preparePoster(id, token);
    try {
      let preparedAudio = runtime.preparedAudio;
      runtime.preparedAudio = undefined;
      if (!preparedAudio && job.project.sourceMedia?.compatibility === "audio-fallback") {
        const { decodeRecognitionAudioFallback } = await import("./recognition/local-media-compatibility.ts");
        preparedAudio = await decodeRecognitionAudioFallback(runtime.file);
      }
      const { generateVideoCaptions } = await import("./video-generation.ts");
      const result = await generateVideoCaptions({
        jobId: workerJobId,
        file: runtime.file,
        sourceUrl: runtime.sourceUrl,
        preparedAudio,
        worker: this.worker ??= new LocalRecognitionWorkerClient(),
        onProgress: (progress) => {
          const current = this.jobs.get(id);
          const active = this.runtimes.get(id);
          if (!current || !active || active.runToken !== token) return;
          this.jobs.set(id, { ...current, progress });
          this.publish();
        },
      });
      const current = this.jobs.get(id);
      const active = this.runtimes.get(id);
      if (!current || !active || active.runToken !== token) return;
      const detected = { ...current.project, verseAlignments: result.alignments, captionSegments: result.segments, updatedAt: new Date().toISOString() };
      const autoTitle = quranProjectMetadata(detected).autoTitle;
      const completed = { ...detected, title: autoTitle ?? detected.title };
      await this.repository?.put(completed);
      this.jobs.set(id, { ...current, project: completed, status: "ready", progress: { phase: "complete", progress: 1, label: "Captions are ready" }, error: null });
      this.publish();
      if (active.session) void this.saveReadyToCloud(id, token);
    } catch (error) {
      const current = this.jobs.get(id);
      const active = this.runtimes.get(id);
      if (!current || !active || active.runToken !== token || error instanceof RecognitionJobCancelledError) return;
      this.jobs.set(id, { ...current, status: "failed", error: error instanceof Error ? error.message : "Caption generation failed. Please retry.", progress: { phase: "failed", progress: current.progress?.progress ?? 0, label: "Caption generation needs attention" } });
      this.publish();
    } finally {
      this.worker?.release(workerJobId);
      const active = this.runtimes.get(id);
      if (active?.workerJobId === workerJobId) active.workerJobId = null;
    }
  }

  private async preparePoster(id: string, token: number) {
    const runtime = this.runtimes.get(id);
    const job = this.jobs.get(id);
    if (!runtime || !job) return;
    try {
      const poster = await createProjectThumbnail(runtime.file, Boolean(job.project.sourceMedia?.hasVideo));
      const active = this.runtimes.get(id);
      if (!active || active.runToken !== token) return;
      if (active.posterUrl) URL.revokeObjectURL(active.posterUrl);
      active.poster = poster;
      active.posterUrl = URL.createObjectURL(poster);
      this.publish();
    } catch {
      // A neutral card remains available when a representative frame fails.
    }
  }

  private async saveReadyToCloud(id: string, token: number) {
    const runtime = this.runtimes.get(id);
    const job = this.jobs.get(id);
    if (!runtime?.session || !job || job.status !== "ready") return;
    let reserved = false;
    let finalized = false;
    const uploaded: string[] = [];
    const assertActive = () => {
      const active = this.runtimes.get(id);
      if (!active || active.runToken !== token || !this.jobs.has(id)) throw new RecognitionJobCancelledError();
    };
    try {
      const records = await listCloudProjectRecords();
      assertActive();
      const replacement = freeFifoReplacement(records, runtime.entitlements, id);
      if (replacement) await deleteCloudProject(replacement.row.id);
      assertActive();
      await beginCloudProjectSave(job.project);
      reserved = true;
      assertActive();
      const sourcePath = newCloudSourcePath(runtime.session.user.id, id, runtime.file);
      const thumbnailPath = newCloudThumbnailPath(runtime.session.user.id, id);
      const poster = runtime.poster ?? await createProjectThumbnail(runtime.file, Boolean(job.project.sourceMedia?.hasVideo));
      await uploadPrivateProjectObject(sourcePath, runtime.file, runtime.file.type || "application/octet-stream", "source-upload");
      uploaded.push(sourcePath);
      assertActive();
      await uploadPrivateProjectObject(thumbnailPath, poster, "image/webp", "thumbnail");
      uploaded.push(thumbnailPath);
      assertActive();
      await completeCloudProjectSave(job.project, {
        source_media_path: sourcePath,
        source_media_type: runtime.file.type || "application/octet-stream",
        source_media_name: runtime.file.name,
        source_media_size_bytes: runtime.file.size,
        thumbnail_path: thumbnailPath,
        thumbnail_size_bytes: poster.size,
      });
      finalized = true;
      assertActive();
      const active = this.runtimes.get(id);
      const current = this.jobs.get(id);
      if (!active || !current || active.runToken !== token) return;
      this.jobs.set(id, { ...current, cloudSaved: true, cloudError: null });
      this.publish();
    } catch (error) {
      if (uploaded.length) await removePrivateProjectObjects(id, uploaded).catch(() => undefined);
      if (reserved) await (finalized ? deleteCloudProject(id) : cancelCloudProjectSave(id)).catch(() => undefined);
      const active = this.runtimes.get(id);
      const current = this.jobs.get(id);
      if (!active || !current || active.runToken !== token) return;
      this.jobs.set(id, { ...current, cloudError: "Captions are ready locally, but this video could not be saved to your account yet." });
      this.publish();
    }
  }

  private revokeRuntime(runtime: RuntimeEntry) {
    URL.revokeObjectURL(runtime.sourceUrl);
    if (runtime.posterUrl) URL.revokeObjectURL(runtime.posterUrl);
  }

  private publish() {
    this.snapshot = [...this.jobs.values()].sort((left, right) => right.project.createdAt.localeCompare(left.project.createdAt)).map(publicJob);
    if (typeof localStorage !== "undefined") {
      try {
        const persisted: PersistedVideoJob[] = this.snapshot.map(({ id, status, error, cloudSaved, cloudError }) => ({ id, status, error, cloudSaved, cloudError }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      } catch {
        // Runtime ownership does not depend on optional status persistence.
      }
    }
    this.listeners.forEach((listener) => listener());
  }
}

export const videoJobManager = new VideoJobManager();

const EMPTY_VIDEO_JOBS: VideoJob[] = [];

export function useVideoJobs(): VideoJob[] {
  return useSyncExternalStore(videoJobManager.subscribe, videoJobManager.getSnapshot, videoJobManager.getServerSnapshot);
}

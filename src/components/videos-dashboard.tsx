"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import ComposedVideoPreview from "@/components/composed-video-preview";
import DashboardShell from "@/components/dashboard-shell";
import { deleteCloudProject, downloadCloudProjectSource, getAuthSession, getPrivateThumbnailUrl, getSupabaseClient, listCloudProjectRecords, type CloudProjectRecord } from "@/lib/cloud-sync";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";
import { createProjectRepository } from "@/lib/project-storage";
import { quranProjectMetadata } from "@/lib/cloud-projects";
import type { SavedProject } from "@/lib/schemas/project";
import { useVideoJobs, videoJobManager, type VideoJobStatus } from "@/lib/video-jobs";

type Filter = "all" | "ready" | "generating" | "failed";
type VideoCard = {
  id: string;
  project: SavedProject;
  status: VideoJobStatus;
  progress: number | null;
  statusLabel: string;
  error: string | null;
  posterUrl: string | null;
  cloud: CloudProjectRecord | null;
  cloudSaved: boolean;
  cloudError: string | null;
};

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "Just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function generationLabel(status: VideoJobStatus, progress: VideoCard["progress"]): string {
  if (status === "ready") return "Ready";
  if (status === "failed") return "Generation failed";
  if (status === "interrupted") return "Interrupted";
  return progress === null || progress < 0.1 ? "Preparing" : "Generating captions";
}

export default function VideosDashboard() {
  const jobs = useVideoJobs();
  const [localProjects, setLocalProjects] = useState<SavedProject[]>([]);
  const [cloudRecords, setCloudRecords] = useState<Array<CloudProjectRecord & { thumbnailUrl: string | null }>>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<VideoCard | null>(null);
  const [watchLoading, setWatchLoading] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await videoJobManager.initialize();
      const repository = createProjectRepository();
      const local = await repository.list();
      setLocalProjects(local);
      if (!getSupabaseClient()) return;
      const nextSession = await getAuthSession();
      setSession(nextSession);
      if (!nextSession) { setCloudRecords([]); return; }
      const [account, records] = await Promise.all([getAccountEntitlements(nextSession).catch(() => accountEntitlementsForPlan("free")), listCloudProjectRecords()]);
      setEntitlements(account);
      setCloudRecords(await Promise.all(records.map(async (record) => ({ ...record, thumbnailUrl: await getPrivateThumbnailUrl(record.row).catch(() => null) }))));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your videos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => { void refresh(); });
    return () => cancelAnimationFrame(frame);
  }, [refresh]);

  const cards = useMemo(() => {
    const byId = new Map<string, VideoCard>();
    for (const record of cloudRecords) {
      byId.set(record.row.id, {
        id: record.row.id,
        project: record.project,
        status: record.project.captionSegments.length ? "ready" : "interrupted",
        progress: null,
        statusLabel: record.project.captionSegments.length ? "Ready" : "Needs captions",
        error: record.project.captionSegments.length ? null : "Open this earlier video in the advanced editor to generate captions.",
        posterUrl: record.thumbnailUrl,
        cloud: record,
        cloudSaved: true,
        cloudError: null,
      });
    }
    for (const project of localProjects) {
      if (byId.has(project.id)) continue;
      byId.set(project.id, {
        id: project.id,
        project,
        status: project.captionSegments.length ? "ready" : "interrupted",
        progress: null,
        statusLabel: project.captionSegments.length ? "Ready" : "Needs captions",
        error: project.captionSegments.length ? null : "This local draft does not have generated captions yet.",
        posterUrl: videoJobManager.getRuntime(project.id)?.posterUrl ?? null,
        cloud: null,
        cloudSaved: false,
        cloudError: null,
      });
    }
    for (const job of jobs) {
      const runtime = videoJobManager.getRuntime(job.id);
      byId.set(job.id, {
        id: job.id,
        project: job.project,
        status: job.status,
        progress: job.progress?.progress ?? null,
        statusLabel: generationLabel(job.status, job.progress?.progress ?? null),
        error: job.error,
        posterUrl: runtime?.posterUrl ?? byId.get(job.id)?.posterUrl ?? null,
        cloud: byId.get(job.id)?.cloud ?? null,
        cloudSaved: job.cloudSaved || Boolean(byId.get(job.id)?.cloud),
        cloudError: job.cloudError,
      });
    }
    return [...byId.values()].sort((left, right) => right.project.createdAt.localeCompare(left.project.createdAt));
  }, [cloudRecords, jobs, localProjects]);

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return cards.filter((card) => {
      const filterMatch = filter === "all" || (filter === "failed" ? card.status === "failed" || card.status === "interrupted" : card.status === filter);
      const metadata = quranProjectMetadata(card.project);
      const searchMatch = !term || [card.project.title, card.project.sourceMedia?.displayName, metadata.passageLabel].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(term));
      return filterMatch && searchMatch;
    });
  }, [cards, filter, search]);

  async function watch(card: VideoCard) {
    setWatchLoading(card.id); setError(null);
    try {
      let runtime = videoJobManager.getRuntime(card.id);
      if (!runtime && card.cloud) {
        const restored = await downloadCloudProjectSource(card.cloud.row);
        if (restored.status !== "ready") throw new Error("This saved source video could not be loaded. Open it in the editor to relink the recording.");
        runtime = videoJobManager.attachRuntime(card.id, restored.file);
      }
      if (!runtime) throw new Error("This browser no longer has the source recording. Open the video in the editor to relink it.");
      setWatching(card);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this video.");
    } finally {
      setWatchLoading(null);
    }
  }

  async function remove(card: VideoCard) {
    if (!window.confirm(`Delete “${card.project.title}”?${card.cloud || card.cloudSaved ? "\n\nThis also removes its private saved source media." : ""}`)) return;
    try {
      if (jobs.some((job) => job.id === card.id)) await videoJobManager.remove(card.id, card.cloudSaved && !card.cloud);
      else {
        const repository = createProjectRepository();
        await repository.delete(card.id);
        if (card.cloud) await deleteCloudProject(card.id);
      }
      if (watching?.id === card.id) setWatching(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete this video.");
    }
  }

  return <DashboardShell current="videos"><section className="videos-page">
    <header className="videos-header"><div><p>VIDEO LIBRARY</p><h1>Your videos</h1><span>{cards.length} {cards.length === 1 ? "video" : "videos"}{session && entitlements.plan === "free" ? ` · ${Math.min(cloudRecords.length, 3)} of 3 saved videos` : ""}</span></div><Link className="videos-new" href="/create">New video</Link></header>
    <div className="videos-toolbar"><div className="videos-filters" role="group" aria-label="Video status">{(["all", "ready", "generating", "failed"] as const).map((value) => <button type="button" className={filter === value ? "is-active" : ""} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value[0]!.toUpperCase() + value.slice(1)}</button>)}</div><input aria-label="Search videos" placeholder="Search videos…" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></div>
    {error && <p className="videos-error" role="alert">{error}</p>}
    {loading && !cards.length ? <p className="videos-empty">Loading your videos…</p> : !visible.length ? <div className="videos-empty"><h2>{cards.length ? "No videos match this view." : "Your generated Quran videos will appear here."}</h2>{!cards.length && <Link className="videos-new" href="/create">Create your first video</Link>}</div> : <div className="videos-grid">{visible.map((card) => <article className="video-card" key={card.id}>
      <button className="video-card-poster" type="button" disabled={card.status !== "ready" || watchLoading === card.id} onClick={() => void watch(card)} aria-label={`Watch ${card.project.title}`}>
        {card.posterUrl ? <img src={card.posterUrl} alt="" /> : <span className="video-card-placeholder" aria-hidden="true">۝</span>}
        {card.status === "ready" && <i aria-hidden="true">▶</i>}
        <b className={`video-status is-${card.status}`} role="status" aria-live="polite" aria-atomic="true">{card.status === "ready" ? "✓ " : ""}{card.statusLabel}</b>
        {card.status === "generating" && <span className="video-progress"><span style={{ width: `${Math.round((card.progress ?? 0) * 100)}%` }} /></span>}
      </button>
      <div className="video-card-body"><h2>{card.project.title}</h2><p>{quranProjectMetadata(card.project).passageLabel ?? card.project.sourceMedia?.displayName ?? card.project.sourceMedia?.fileName ?? "Quran recitation"}</p><span>{relativeTime(card.project.createdAt)}{card.cloudSaved ? " · Saved privately" : " · On this device"}</span>
        {card.error && <small className="video-card-error">{card.error}</small>}{card.cloudError && <small className="video-card-warning">{card.cloudError}</small>}
        {card.status === "ready" ? <footer><button type="button" onClick={() => void watch(card)} disabled={watchLoading === card.id}>{watchLoading === card.id ? "Opening…" : "Watch"}</button><Link href={`/editor?project=${encodeURIComponent(card.id)}`}>Edit</Link><Link href={`/editor?project=${encodeURIComponent(card.id)}&export=1`}>Download</Link><button type="button" className="is-danger" onClick={() => void remove(card)}>Delete</button><button type="button" className="video-tiktok" disabled>Post to TikTok <span>Coming soon</span></button></footer> : <footer>{(card.status === "failed" || card.status === "interrupted") && (videoJobManager.getRuntime(card.id) ? <button type="button" onClick={() => videoJobManager.retry(card.id)}>Retry</button> : <Link href={`/editor?project=${encodeURIComponent(card.id)}`}>Retry in editor</Link>)}<button type="button" className="is-danger" onClick={() => void remove(card)}>Delete</button></footer>}
      </div>
    </article>)}</div>}
    {watching && videoJobManager.getRuntime(watching.id) && <div className="watch-backdrop" role="dialog" aria-modal="true" aria-label={`Watch ${watching.project.title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setWatching(null); }}><div className="watch-modal"><header><div><span>CAPTIONED PREVIEW</span><h2>{watching.project.title}</h2></div><button type="button" aria-label="Close preview" onClick={() => setWatching(null)}>×</button></header><ComposedVideoPreview project={watching.project} sourceUrl={videoJobManager.getRuntime(watching.id)!.sourceUrl} /><footer><Link href={`/editor?project=${encodeURIComponent(watching.id)}`}>Open advanced editor</Link><Link href={`/editor?project=${encodeURIComponent(watching.id)}&export=1`}>Download</Link></footer></div></div>}
  </section></DashboardShell>;
}

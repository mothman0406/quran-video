"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AccountPanel from "@/components/account-panel";
import { deleteCloudProject, getAuthSession, getPrivateThumbnailUrl, getSupabaseClient, listCloudProjectRecords, renameCloudProject, signOut, type CloudProjectRecord } from "@/lib/cloud-sync";
import { quranProjectMetadata } from "@/lib/cloud-projects";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";

type ProjectCard = CloudProjectRecord & { thumbnailUrl: string | null };

function duration(durationMs: number | null): string {
  if (!durationMs) return "—";
  const seconds = Math.round(durationMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1_000));
  if (seconds < 60) return "just now";
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export default function ProjectsDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => getSupabaseClient() !== null);
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(() => getSupabaseClient() === null);
  const [accountEntitlements, setAccountEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const records = await listCloudProjectRecords();
      const cards = await Promise.all(records.map(async (record) => ({ ...record, thumbnailUrl: await getPrivateThumbnailUrl(record.row).catch(() => null) })));
      setProjects(cards);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load your projects."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void getAuthSession().then((next) => { if (!active) return; setSession(next); if (next) { void refresh(); void getAccountEntitlements(next).then(setAccountEntitlements).catch(() => setAccountEntitlements(accountEntitlementsForPlan("free"))); } else { setLoading(false); setAuthOpen(true); setAccountEntitlements(accountEntitlementsForPlan("free")); } }).catch((caught: unknown) => { if (active) { setError(caught instanceof Error ? caught.message : "Could not read your session."); setLoading(false); } });
    const subscription = supabase.auth.onAuthStateChange((_event, next) => { if (!active) return; setSession(next); if (next) { setAuthOpen(false); void refresh(); void getAccountEntitlements(next).then(setAccountEntitlements).catch(() => setAccountEntitlements(accountEntitlementsForPlan("free"))); } else { setProjects([]); setAuthOpen(true); setAccountEntitlements(accountEntitlementsForPlan("free")); } });
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, [refresh]);

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return projects;
    return projects.filter(({ project, row }) => [project.title, row.auto_title, quranProjectMetadata(project).passageLabel].filter(Boolean).some((value) => value!.toLocaleLowerCase().includes(term)));
  }, [projects, search]);

  async function rename(project: ProjectCard) {
    const name = window.prompt("Project name", project.project.title)?.trim();
    if (!name || name === project.project.title) return;
    try { await renameCloudProject(project.row.id, name); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not rename the project."); }
  }
  async function remove(project: ProjectCard) {
    if (!window.confirm(`Delete “${project.project.title}”?\n\nThis permanently removes the cloud project and its saved source media.`)) return;
    try { await deleteCloudProject(project.row.id); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete the project."); }
  }

  return <main className="projects-app">
    <aside className="projects-sidebar">
      <Link className="projects-brand" href="/"><span>۝</span>Quran Video</Link>
      <Link className="projects-new projects-new-side" href="/editor">＋ New project</Link>
      <nav><span>Library</span><Link className="is-active" href="/projects">Projects</Link></nav>
      <div className="projects-account">{session ? <><span className="projects-avatar">{(session.user.email ?? "Q").slice(0, 1).toUpperCase()}</span><div><strong>{session.user.user_metadata.full_name ?? session.user.email ?? "Quran Video member"}</strong><small>{accountEntitlements.plan.replace(/^./, (letter) => letter.toUpperCase())} plan</small></div><Link href="/account">Settings</Link><button type="button" onClick={() => void signOut()}>Sign out</button></> : <span>Sign in to save projects</span>}</div>
    </aside>
    <section className="projects-main">
      <header className="projects-heading"><div><p>PROJECT LIBRARY</p><h1>Your projects</h1><span>{projects.length} projects saved{accountEntitlements.cloudProjectLimit === null ? " · paid storage quota to be announced" : ` / ${accountEntitlements.cloudProjectLimit} project limit`}</span></div><Link className="projects-new" href="/editor">＋ New project</Link></header>
      {session && <input className="projects-search" aria-label="Search projects" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects…" />}
      {error && <p className="projects-error" role="alert">{error}</p>}
      {loading ? <p className="projects-empty">Loading your projects…</p> : !session ? <p className="projects-empty">Sign in to view the projects saved to your account.</p> : visibleProjects.length === 0 ? <div className="projects-empty"><h2>{projects.length ? "No matching projects" : "Save your first Quran video project and continue editing it anywhere."}</h2>{!projects.length && <Link className="projects-new" href="/editor">New project</Link>}</div> : <div className="projects-grid">{visibleProjects.map((item) => {
        const passage = item.row.surah_start ? quranProjectMetadata(item.project).passageLabel : null;
        return <article className="project-card" key={item.row.id}><Link className="project-card-image" href={`/editor?project=${encodeURIComponent(item.row.id)}`}>{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <span>Quran Video</span>}</Link><div className="project-card-copy"><h2>{item.project.title}</h2><p>{passage ?? "Passage not detected yet"}</p><div><span>Edited {relativeTime(item.row.updated_at)}</span><span>{duration(item.row.duration_ms)}</span></div><footer><Link href={`/editor?project=${encodeURIComponent(item.row.id)}`}>Open project</Link><button type="button" onClick={() => void rename(item)}>Rename</button><button className="is-danger" type="button" onClick={() => void remove(item)}>Delete</button></footer></div></article>;
      })}</div>}
    </section>
    {authOpen && <AccountPanel session={null} authReturnPath="/projects" onClose={() => setAuthOpen(false)} />}
  </main>;
}

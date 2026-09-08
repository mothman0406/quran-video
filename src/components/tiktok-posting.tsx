"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompletedExport } from "@/lib/export/types";
import { createTikTokUploadPlan, tiktokMediaDescriptor, validateTikTokMedia } from "@/lib/tiktok/media";
import { connectTikTokOAuth, getTikTokConnection, getTikTokCreatorInfo, getTikTokPostStatus, initializeTikTokPost, uploadTikTokVideo } from "@/lib/tiktok/client";
import { TIKTOK_STATUS_POLL_INTERVAL_MS, isTikTokStatusFinal, tiktokStatusMessage } from "@/lib/tiktok/status";
import type { TikTokConnectionState, TikTokCreatorInfo, TikTokPostInitialization, TikTokPostMode, TikTokPrivacyLevel, TikTokPublishStatus } from "@/lib/tiktok/types";

type Props = { exported: CompletedExport; generatedCaption: string; onExportStandardVersion: () => void };
type Screen = "closed" | "loading" | "unconfigured" | "connect" | "compose" | "uploading" | "processing" | "success" | "failure";

const privacyLabel: Record<TikTokPrivacyLevel, string> = { PUBLIC_TO_EVERYONE: "Everyone", MUTUAL_FOLLOW_FRIENDS: "Friends", FOLLOWER_OF_CREATOR: "Followers", SELF_ONLY: "Only you" };

export default function TikTokPosting({ exported, generatedCaption, onExportStandardVersion }: Props) {
  const [screen, setScreen] = useState<Screen>("closed");
  const [connection, setConnection] = useState<TikTokConnectionState | null>(null);
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [caption, setCaption] = useState(generatedCaption);
  const [mode, setMode] = useState<TikTokPostMode>("direct");
  const [privacy, setPrivacy] = useState<TikTokPrivacyLevel>("SELF_ONLY");
  const [disableComment, setDisableComment] = useState(false);
  const [disableDuet, setDisableDuet] = useState(false);
  const [disableStitch, setDisableStitch] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [initialization, setInitialization] = useState<TikTokPostInitialization | null>(null);
  const [status, setStatus] = useState<TikTokPublishStatus | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const media = useMemo(() => tiktokMediaDescriptor(exported), [exported]);
  const localErrors = useMemo(() => validateTikTokMedia(media, creator?.maxVideoPostDurationSeconds), [creator?.maxVideoPostDurationSeconds, media]);
  const watermarkBlocked = exported.quality === "basic";
  const captionTooLong = caption.length > 2200;

  useEffect(() => () => uploadAbort.current?.abort(), []);

  async function open() {
    setCaption(generatedCaption); setMessage(null); setStatus(null); setInitialization(null);
    if (watermarkBlocked) { setScreen("compose"); return; }
    setScreen("loading");
    try {
      const current = await getTikTokConnection(); setConnection(current);
      if (!current.configured) { setScreen("unconfigured"); return; }
      if (!current.connected) { setScreen("connect"); return; }
      await loadCreator(current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "TikTok is unavailable."); setScreen("failure"); }
  }
  async function loadCreator(current = connection) {
    try {
      const next = await getTikTokCreatorInfo(); setCreator(next);
      const available = current?.directPostAudited ? next.privacyLevelOptions : next.privacyLevelOptions.filter((option) => option === "SELF_ONLY");
      if (!available.length) throw new Error("TikTok did not provide an eligible private visibility setting for this unaudited Direct Post app.");
      setPrivacy(available.includes("SELF_ONLY") ? "SELF_ONLY" : available[0]!);
      setScreen("compose");
    } catch (error) { setMessage(error instanceof Error ? error.message : "TikTok creator information is unavailable."); setScreen("failure"); }
  }
  async function connect() {
    setMessage(null);
    try { await connectTikTokOAuth(); const current = await getTikTokConnection(); setConnection(current); if (!current.connected) throw new Error("TikTok did not complete the connection."); await loadCreator(current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "TikTok connection failed."); setScreen("connect"); }
  }
  async function poll(publishId: string, postMode: TikTokPostMode) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, TIKTOK_STATUS_POLL_INTERVAL_MS));
      const next = await getTikTokPostStatus(publishId); setStatus(next); setMessage(tiktokStatusMessage(next, postMode));
      if (!isTikTokStatusFinal(next)) continue;
      setScreen(next.status === "FAILED" ? "failure" : "success"); return;
    }
  }
  async function send() {
    if (localErrors.length || captionTooLong || !creator) return;
    setMessage(null); setStatus(null); setProgress(0);
    try {
      const upload = createTikTokUploadPlan(exported.blob.size);
      const next = await initializeTikTokPost({ mode, title: caption, privacyLevel: mode === "direct" ? privacy : undefined, disableComment, disableDuet, disableStitch, media, upload });
      setInitialization(next);
      await transfer(next, upload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "TikTok could not start this post."); setScreen("failure"); }
  }
  async function transfer(next: TikTokPostInitialization, upload = createTikTokUploadPlan(exported.blob.size)) {
    setScreen("uploading");
    const controller = new AbortController(); uploadAbort.current = controller;
    try {
      await uploadTikTokVideo(next.uploadUrl, exported.blob, media.mimeType, upload, (bytes) => setProgress(Math.round((bytes / exported.blob.size) * 100)), controller.signal);
      uploadAbort.current = null; setScreen("processing"); setMessage("Processing on TikTok"); await poll(next.publishId, mode);
    } catch (error) {
      uploadAbort.current = null;
      if ((error as DOMException)?.name === "AbortError") { setMessage("Upload cancelled before completion. Your completed export is still ready to download or retry."); }
      else setMessage(error instanceof Error ? error.message : "TikTok upload failed.");
      setScreen("failure");
    }
  }
  function close() { if (screen === "uploading") return; setScreen("closed"); }
  const finalLabel = mode === "draft" ? "Send to TikTok drafts" : "Post to TikTok";
  const privacyOptions = creator ? (connection?.directPostAudited ? creator.privacyLevelOptions : creator.privacyLevelOptions.filter((option) => option === "SELF_ONLY")) : [];

  return <>
    <button className="editor-button editor-button-quiet" type="button" onClick={() => void open()}>Post to TikTok</button>
    {screen !== "closed" && <div className="editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="Post to TikTok"><div className="editor-modal tiktok-post-modal">
      <div className="editor-modal-heading"><div><p className="editor-section-label">Post to TikTok</p><h2>{screen === "success" ? "TikTok update" : "Share your completed export"}</h2></div>{screen !== "uploading" && <button type="button" aria-label="Close TikTok posting" onClick={close}>×</button>}</div>
      {watermarkBlocked ? <><p className="editor-alert">TikTok requires an export without the product watermark.</p><p>Your Basic 720p file is kept intact and can still be downloaded. TikTok integration cannot send watermarked product content.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={() => { close(); onExportStandardVersion(); }}>Export Standard version</button></div></> : screen === "loading" ? <p>Checking TikTok connection…</p> : screen === "unconfigured" ? <><p className="editor-alert">TikTok is not configured in this development environment.</p><p>Add the server-only TikTok credentials described in <code>docs/TIKTOK_SETUP.md</code>. Export and download continue to work without them.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Close</button></div></> : screen === "connect" ? <><p>Connect the TikTok account that will receive this completed export. This is a TikTok integration connection, not a Quran Video account.</p>{message && <p className="editor-alert">{message}</p>}<div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={() => void connect()}>Connect TikTok</button></div></> : screen === "compose" ? <><p>Posting as <strong>@{creator?.username ?? "TikTok"}</strong>{creator?.nickname ? ` · ${creator.nickname}` : ""}</p>{connection && !connection.directPostAudited && <p className="editor-platform-warning">This Direct Post app is not audited. TikTok restricts Direct Post content to Only you until the integration is approved.</p>}{localErrors.map((error) => <p className="editor-alert" key={error}>{error}</p>)}<label className="tiktok-caption-label">Caption<textarea value={caption} onChange={(event) => setCaption(event.currentTarget.value)} rows={6} /></label><div className={captionTooLong ? "editor-alert" : "editor-section-label"}>{caption.length}/2200 {captionTooLong ? "— shorten the caption before posting." : ""}</div><button className="editor-button editor-button-quiet" type="button" onClick={() => void navigator.clipboard?.writeText(caption)}>Copy caption</button><div className="editor-export-quality-options" role="radiogroup" aria-label="TikTok posting destination"><button type="button" role="radio" aria-checked={mode === "direct"} className={mode === "direct" ? "is-selected" : ""} onClick={() => setMode("direct")}><strong>Post directly</strong><small>{connection?.directPostAudited ? "Post with the selected TikTok settings" : "Private until TikTok audit approval"}</small></button><button type="button" role="radio" aria-checked={mode === "draft"} className={mode === "draft" ? "is-selected" : ""} onClick={() => setMode("draft")}><strong>Send to TikTok drafts</strong><small>Continue editing and publish in TikTok</small></button></div>{mode === "direct" && <label>Privacy<select className="editor-select" value={privacy} onChange={(event) => setPrivacy(event.currentTarget.value as TikTokPrivacyLevel)}>{privacyOptions.map((option) => <option key={option} value={option}>{privacyLabel[option]}</option>)}</select></label>}{mode === "direct" && <div className="tiktok-interactions">{!creator?.commentDisabled && <label><input type="checkbox" checked={!disableComment} onChange={(event) => setDisableComment(!event.currentTarget.checked)} /> Allow comments</label>}{!creator?.duetDisabled && <label><input type="checkbox" checked={!disableDuet} onChange={(event) => setDisableDuet(!event.currentTarget.checked)} /> Allow Duet</label>}{!creator?.stitchDisabled && <label><input type="checkbox" checked={!disableStitch} onChange={(event) => setDisableStitch(!event.currentTarget.checked)} /> Allow Stitch</label>}</div>}<div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" disabled={Boolean(localErrors.length || captionTooLong)} onClick={() => void send()}>{finalLabel}</button></div></> : screen === "uploading" ? <><p><strong>Uploading to TikTok</strong></p><progress value={progress} max={100} aria-label="TikTok upload progress" /> <span>{progress}%</span><p>Video bytes are transferring directly from this browser to TikTok.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={() => uploadAbort.current?.abort()}>Cancel upload</button></div></> : screen === "processing" ? <><p><strong>Processing on TikTok</strong></p><p>{message ?? "TikTok is processing the uploaded video."}</p></> : screen === "success" ? <><p><strong>{message ?? (mode === "draft" ? "Sent to TikTok" : "Posted to TikTok")}</strong></p>{mode === "draft" && <p>Open TikTok to finish editing and publish.</p>}{status?.publiclyAvailablePostIds.length ? <p>TikTok post ID: {status.publiclyAvailablePostIds.join(", ")}</p> : null}<div className="editor-modal-actions"><button className="editor-button editor-button-accent" type="button" onClick={close}>Done</button></div></> : <><p className="editor-alert">{message ?? "TikTok could not complete this post."}</p><p>Your completed export is still available for download. No render or Quran processing was repeated.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Back to export</button>{initialization && <button className="editor-button editor-button-accent" type="button" onClick={() => void transfer(initialization)}>Retry upload</button>}</div></>}
    </div></div>}
  </>;
}

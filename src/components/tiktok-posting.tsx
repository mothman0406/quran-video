"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CompletedExport } from "@/lib/export/types";
import { createTikTokUploadPlan, isTikTokExportEligible, tiktokMediaDescriptor, validateTikTokMedia } from "@/lib/tiktok/media";
import { connectTikTokOAuth, getTikTokConnection, getTikTokCreatorInfo, getTikTokPostStatus, initializeTikTokPost, uploadTikTokVideo } from "@/lib/tiktok/client";
import { TIKTOK_STATUS_POLL_INTERVAL_MS, isTikTokStatusFinal, tiktokStatusMessage } from "@/lib/tiktok/status";
import type { TikTokConnectionState, TikTokCreatorInfo, TikTokPostInitialization, TikTokPrivacyLevel, TikTokPublishStatus } from "@/lib/tiktok/types";

type Props = { exported: CompletedExport; generatedCaption: string; onExportStandardVersion: () => void };
type Screen = "closed" | "loading" | "unconfigured" | "connect" | "compose" | "uploading" | "processing" | "success" | "failure";

const privacyLabel: Record<TikTokPrivacyLevel, string> = { PUBLIC_TO_EVERYONE: "Everyone", MUTUAL_FOLLOW_FRIENDS: "Friends", FOLLOWER_OF_CREATOR: "Followers", SELF_ONLY: "Only you" };

export default function TikTokPosting({ exported, generatedCaption, onExportStandardVersion }: Props) {
  const [screen, setScreen] = useState<Screen>("closed");
  const [connection, setConnection] = useState<TikTokConnectionState | null>(null);
  const [creator, setCreator] = useState<TikTokCreatorInfo | null>(null);
  const [caption, setCaption] = useState(generatedCaption);
  const [privacy, setPrivacy] = useState<TikTokPrivacyLevel | "">("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowStitch, setAllowStitch] = useState(false);
  const [commercialContent, setCommercialContent] = useState(false);
  const [brandContent, setBrandContent] = useState(false);
  const [brandOrganic, setBrandOrganic] = useState(false);
  const [userConsent, setUserConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [initialization, setInitialization] = useState<TikTokPostInitialization | null>(null);
  const [status, setStatus] = useState<TikTokPublishStatus | null>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  const media = useMemo(() => tiktokMediaDescriptor(exported), [exported]);
  const localErrors = useMemo(() => validateTikTokMedia(media, creator?.maxVideoPostDurationSeconds), [creator?.maxVideoPostDurationSeconds, media]);
  const watermarkBlocked = !isTikTokExportEligible(exported);
  const captionTooLong = caption.length > 2200;

  useEffect(() => () => uploadAbort.current?.abort(), []);

  async function open() {
    setCaption(generatedCaption); setMessage(null); setStatus(null); setInitialization(null); setPrivacy(""); setAllowComment(false); setAllowDuet(false); setAllowStitch(false); setCommercialContent(false); setBrandContent(false); setBrandOrganic(false); setUserConsent(false);
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
      setPrivacy("");
      setScreen("compose");
    } catch (error) { setMessage(error instanceof Error ? error.message : "TikTok creator information is unavailable."); setScreen("failure"); }
  }
  async function connect() {
    setMessage(null);
    try { await connectTikTokOAuth(); const current = await getTikTokConnection(); setConnection(current); if (!current.connected) throw new Error("TikTok did not complete the connection."); await loadCreator(current); }
    catch (error) { setMessage(error instanceof Error ? error.message : "TikTok connection failed."); setScreen("connect"); }
  }
  async function poll(publishId: string) {
    for (;;) {
      await new Promise((resolve) => window.setTimeout(resolve, TIKTOK_STATUS_POLL_INTERVAL_MS));
      const next = await getTikTokPostStatus(publishId); setStatus(next); setMessage(tiktokStatusMessage(next));
      if (!isTikTokStatusFinal(next)) continue;
      setScreen(next.status === "FAILED" ? "failure" : "success"); return;
    }
  }
  async function send() {
    if (localErrors.length || captionTooLong || !creator || !privacy || !userConsent || (commercialContent && !brandContent && !brandOrganic)) return;
    setMessage(null); setStatus(null); setProgress(0);
    try {
      const upload = createTikTokUploadPlan(exported.blob.size);
      const next = await initializeTikTokPost({ title: caption, privacyLevel: privacy as TikTokPrivacyLevel, disableComment: !allowComment, disableDuet: !allowDuet, disableStitch: !allowStitch, brandContentToggle: commercialContent && brandContent, brandOrganicToggle: commercialContent && brandOrganic, userConsent, media, upload });
      setInitialization(next);
      await transfer(next, upload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "TikTok could not start this post."); setScreen("failure"); }
  }
  async function transfer(next: TikTokPostInitialization, upload = createTikTokUploadPlan(exported.blob.size)) {
    setScreen("uploading");
    const controller = new AbortController(); uploadAbort.current = controller;
    try {
      await uploadTikTokVideo(next.uploadUrl, exported.blob, media.mimeType, upload, (bytes) => setProgress(Math.round((bytes / exported.blob.size) * 100)), controller.signal);
      uploadAbort.current = null; setScreen("processing"); setMessage("Processing on TikTok"); await poll(next.publishId);
    } catch (error) {
      uploadAbort.current = null;
      if ((error as DOMException)?.name === "AbortError") { setMessage("Upload cancelled before completion. Your completed export is still ready to download or retry."); }
      else setMessage(error instanceof Error ? error.message : "TikTok upload failed.");
      setScreen("failure");
    }
  }
  function close() { if (screen === "uploading") return; setScreen("closed"); }
  const privacyOptions = creator ? (connection?.directPostAudited ? creator.privacyLevelOptions : creator.privacyLevelOptions.filter((option) => option === "SELF_ONLY")) : [];
  const commercialSelectionIncomplete = commercialContent && !brandContent && !brandOrganic;
  const consentLabel = commercialContent && brandContent ? <>By posting, you agree to TikTok&apos;s <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</> : <>By posting, you agree to TikTok&apos;s <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</>;

  return <>
    <button className="editor-button editor-button-quiet" type="button" onClick={() => void open()}>Post to TikTok</button>
    {screen !== "closed" && <div className="editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="Post to TikTok"><div className="editor-modal tiktok-post-modal">
      <div className="editor-modal-heading"><div><p className="editor-section-label">Post to TikTok</p><h2>{screen === "success" ? "TikTok update" : "Share your completed export"}</h2></div>{screen !== "uploading" && <button type="button" aria-label="Close TikTok posting" onClick={close}>×</button>}</div>
      {watermarkBlocked ? <><p className="editor-alert">TikTok requires an export without the product watermark.</p><p>Your Basic 720p file is kept intact and can still be downloaded. TikTok integration cannot send watermarked product content.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={() => { close(); onExportStandardVersion(); }}>Export Standard version</button></div></> : screen === "loading" ? <p>Checking TikTok connection…</p> : screen === "unconfigured" ? <><p>TikTok posting is unavailable right now. Your completed export is still ready to download.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Close</button></div></> : screen === "connect" ? <><p>Connect the TikTok account that will receive this completed export. This is a TikTok integration connection, not a Quran Video account.</p>{message && <p className="editor-alert">{message}</p>}<div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={() => void connect()}>Connect TikTok</button></div></> : screen === "compose" ? <><p>Posting as <strong>@{creator?.username ?? "TikTok"}</strong>{creator?.nickname ? ` · ${creator.nickname}` : ""}</p><p className="editor-muted">This completed export will transfer directly from this browser to TikTok only after you confirm below.</p>{connection && !connection.directPostAudited && <p className="editor-platform-warning">TikTok currently limits this integration to private posts while approval is pending.</p>}{localErrors.map((error) => <p className="editor-alert" key={error}>{error}</p>)}<label className="tiktok-caption-label">Caption<textarea value={caption} onChange={(event) => setCaption(event.currentTarget.value)} rows={6} /></label><div className={captionTooLong ? "editor-alert" : "editor-section-label"}>{caption.length}/2200 {captionTooLong ? "— shorten the caption before posting." : ""}</div><button className="editor-button editor-button-quiet" type="button" onClick={() => void navigator.clipboard?.writeText(caption)}>Copy caption</button><label>Privacy<select className="editor-select" value={privacy} onChange={(event) => setPrivacy(event.currentTarget.value as TikTokPrivacyLevel | "")}><option value="" disabled>Select privacy…</option>{privacyOptions.map((option) => <option key={option} value={option}>{privacyLabel[option]}</option>)}</select></label><div className="tiktok-interactions"><label className={creator?.commentDisabled ? "is-disabled" : ""}><input type="checkbox" checked={allowComment} disabled={creator?.commentDisabled} onChange={(event) => setAllowComment(event.currentTarget.checked)} /> Allow comments</label><label className={creator?.duetDisabled ? "is-disabled" : ""}><input type="checkbox" checked={allowDuet} disabled={creator?.duetDisabled} onChange={(event) => setAllowDuet(event.currentTarget.checked)} /> Allow Duet</label><label className={creator?.stitchDisabled ? "is-disabled" : ""}><input type="checkbox" checked={allowStitch} disabled={creator?.stitchDisabled} onChange={(event) => setAllowStitch(event.currentTarget.checked)} /> Allow Stitch</label></div><label className="editor-toggle"><input type="checkbox" checked={commercialContent} onChange={(event) => { setCommercialContent(event.currentTarget.checked); if (!event.currentTarget.checked) { setBrandContent(false); setBrandOrganic(false); } }} /><span />Commercial content</label>{commercialContent && <div className="tiktok-interactions"><label><input type="checkbox" checked={brandOrganic} onChange={(event) => setBrandOrganic(event.currentTarget.checked)} /> Your brand</label><label className={privacy === "SELF_ONLY" ? "is-disabled" : ""} title={privacy === "SELF_ONLY" ? "Branded content visibility cannot be set to private." : undefined}><input type="checkbox" checked={brandContent} disabled={privacy === "SELF_ONLY"} onChange={(event) => setBrandContent(event.currentTarget.checked)} /> Paid partnership</label>{commercialSelectionIncomplete && <p className="editor-alert">Choose Your brand, Paid partnership, or both to continue.</p>}{brandOrganic && <p className="editor-muted">Your video will be labeled as promotional content.</p>}{brandContent && <p className="editor-muted">Your video will be labeled as paid partnership.</p>}</div>}<label className="tiktok-consent"><input type="checkbox" checked={userConsent} onChange={(event) => setUserConsent(event.currentTarget.checked)} /> <span>{consentLabel}</span></label><p className="editor-muted">TikTok may take a few minutes to process the video before it appears on your profile.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Cancel</button><button className="editor-button editor-button-accent" type="button" disabled={Boolean(localErrors.length || captionTooLong || !privacy || !userConsent || commercialSelectionIncomplete)} onClick={() => void send()}>Post to TikTok</button></div></> : screen === "uploading" ? <><p><strong>Uploading to TikTok</strong></p><progress value={progress} max={100} aria-label="TikTok upload progress" /> <span>{progress}%</span><p>Video bytes are transferring directly from this browser to TikTok.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={() => uploadAbort.current?.abort()}>Cancel upload</button></div></> : screen === "processing" ? <><p><strong>Processing on TikTok</strong></p><p>{message ?? "TikTok is processing the uploaded video."}</p></> : screen === "success" ? <><p><strong>{message ?? "Posted to TikTok"}</strong></p>{status?.publiclyAvailablePostIds.length ? <p>TikTok post ID: {status.publiclyAvailablePostIds.join(", ")}</p> : null}<div className="editor-modal-actions"><button className="editor-button editor-button-accent" type="button" onClick={close}>Done</button></div></> : <><p className="editor-alert">{message ?? "TikTok could not complete this post."}</p><p>Your completed export is still available for download. No render or Quran processing was repeated.</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={close}>Back to export</button>{initialization && <button className="editor-button editor-button-accent" type="button" onClick={() => void transfer(initialization)}>Retry upload</button>}</div></>}
    </div></div>}
  </>;
}

import { NextResponse } from "next/server";
import { clearOAuthState, exchangeTikTokAuthorizationCode, setTikTokConnection, TikTokServerError, validateOAuthState } from "@/lib/tiktok/server";

function finishPopup(success: boolean, message?: string) {
  const payload = JSON.stringify({ type: "quran-video:tiktok-oauth", success, message }).replace(/[<>&]/gu, (character) => ({ "<": "\\u003c", ">": "\\u003e", "&": "\\u0026" })[character]!);
  return `<!doctype html><html><body><script>window.opener?.postMessage(${payload}, window.location.origin);window.close();</script><p>${success ? "TikTok connected. You may close this window." : "TikTok connection failed. You may close this window."}</p></body></html>`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    await validateOAuthState(url.searchParams.get("state"));
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (error || !code) throw new TikTokServerError(400, "TikTok authorization was cancelled or denied.");
    const response = new NextResponse(finishPopup(true), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'" } });
    setTikTokConnection(response, await exchangeTikTokAuthorizationCode(code));
    clearOAuthState(response);
    return response;
  } catch (error) {
    const response = new NextResponse(finishPopup(false, error instanceof Error ? error.message : "TikTok authorization failed."), { status: error instanceof TikTokServerError ? error.status : 500, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'" } });
    clearOAuthState(response);
    return response;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authCallbackUrl, applicationOrigin } from "@/lib/application-url";
import { authDebugEnabled, logAuthDebug } from "@/lib/auth-debug";
import { safeAuthReturnPath } from "@/lib/auth-flow";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!authDebugEnabled()) return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
  const body: unknown = await request.json().catch(() => null);
  const requestedNext = body && typeof body === "object" && "next" in body && typeof body.next === "string" ? body.next : null;
  const submittedRedirectTo = body && typeof body === "object" && "redirectTo" in body && typeof body.redirectTo === "string" ? body.redirectTo : null;
  const next = safeAuthReturnPath(requestedNext);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(/:$/, "");
  const appUrl = applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
  let redirectTo: string | null = null;
  try {
    redirectTo = authCallbackUrl(next, request.url);
  } catch {
    // The log still identifies a malformed production configuration without exposing it.
  }
  logAuthDebug("oauth-start", { host, protocol, appUrl, redirectTo, next, redirectToMatchesConfigured: submittedRedirectTo === redirectTo });
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { attachRefreshedConnection, clearTikTokConnection, getTikTokPostStatus, TikTokServerError } from "@/lib/tiktok/server";

export async function POST(request: Request) {
  try {
    const { publishId } = await request.json() as { publishId?: string };
    if (!publishId || publishId.length > 64) throw new TikTokServerError(400, "A valid TikTok publish ID is required.");
    const result = await getTikTokPostStatus(publishId);
    return attachRefreshedConnection(NextResponse.json(result.status), result.refreshed);
  } catch (error) { const response = NextResponse.json({ message: error instanceof Error ? error.message : "TikTok status is unavailable." }, { status: error instanceof TikTokServerError ? error.status : 500 }); if (error instanceof TikTokServerError && error.status === 401) clearTikTokConnection(response); return response; }
}

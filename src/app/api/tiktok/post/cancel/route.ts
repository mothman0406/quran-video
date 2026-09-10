import { NextResponse } from "next/server";
import { attachRefreshedConnection, cancelTikTokPost, clearTikTokConnection, TikTokServerError } from "@/lib/tiktok/server";

export async function POST(request: Request) {
  try {
    const { publishId } = await request.json() as { publishId?: string };
    if (!publishId || publishId.length > 64) throw new TikTokServerError(400, "A valid TikTok publish ID is required.");
    const result = await cancelTikTokPost(publishId);
    return attachRefreshedConnection(NextResponse.json({ cancelled: true }), result.refreshed);
  } catch (error) { const response = NextResponse.json({ message: error instanceof Error ? error.message : "TikTok could not cancel this post." }, { status: error instanceof TikTokServerError ? error.status : 500 }); if (error instanceof TikTokServerError && error.status === 401) clearTikTokConnection(response); return response; }
}

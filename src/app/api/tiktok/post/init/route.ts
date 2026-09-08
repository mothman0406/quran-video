import { NextResponse } from "next/server";
import { attachRefreshedConnection, initializeTikTokPost, TikTokServerError } from "@/lib/tiktok/server";
import type { TikTokInitRequest } from "@/lib/tiktok/types";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as TikTokInitRequest;
    const result = await initializeTikTokPost(payload);
    return attachRefreshedConnection(NextResponse.json(result.initialization), result.refreshed);
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "TikTok could not initialize this post." }, { status: error instanceof TikTokServerError ? error.status : 500 }); }
}

import { NextResponse } from "next/server";
import { attachRefreshedConnection, creatorInfo, TikTokServerError } from "@/lib/tiktok/server";

export async function POST() {
  try { const result = await creatorInfo(); return attachRefreshedConnection(NextResponse.json(result.creator), result.refreshed); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "TikTok is unavailable." }, { status: error instanceof TikTokServerError ? error.status : 500 }); }
}

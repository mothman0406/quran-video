import { NextResponse } from "next/server";
import { connectionStateForRequest, TikTokServerError } from "@/lib/tiktok/server";

export async function GET() {
  try { return NextResponse.json(await connectionStateForRequest()); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "TikTok is unavailable." }, { status: error instanceof TikTokServerError ? error.status : 500 }); }
}

import { NextResponse } from "next/server";
import { createOAuthRedirect, storeOAuthState, TikTokServerError } from "@/lib/tiktok/server";

export async function GET() {
  try {
    const { state, url } = await createOAuthRedirect();
    const response = NextResponse.redirect(url);
    await storeOAuthState(response, state);
    return response;
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "TikTok is unavailable." }, { status: error instanceof TikTokServerError ? error.status : 500 });
  }
}

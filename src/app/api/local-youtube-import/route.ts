import { NextResponse } from "next/server";
import { importYouTubeMedia, isLocalYouTubeImportEnabled, isValidImportSessionId, removeYouTubeImport, type YouTubeImportMode } from "@/lib/youtube-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isLocalYouTubeImportEnabled()) return NextResponse.json({ error: "YouTube import is available only in local development." }, { status: 403 });
  try {
    const body = await request.json() as { sessionId?: unknown; url?: unknown; mode?: unknown };
    if (typeof body.sessionId !== "string" || !isValidImportSessionId(body.sessionId) || typeof body.url !== "string" || (body.mode !== "video" && body.mode !== "audio")) {
      return NextResponse.json({ error: "Invalid local YouTube import request." }, { status: 400 });
    }
    const imported = await importYouTubeMedia(body.sessionId, body.url, body.mode as YouTubeImportMode);
    return NextResponse.json({ ...imported, filePath: undefined, mediaUrl: `/api/local-youtube-import/${imported.sessionId}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not import this YouTube video." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isLocalYouTubeImportEnabled()) return new Response(null, { status: 403 });
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !isValidImportSessionId(sessionId)) return new Response(null, { status: 400 });
  await removeYouTubeImport(sessionId);
  return new Response(null, { status: 204 });
}

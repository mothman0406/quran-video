import { Readable } from "node:stream";
import { createReadStream, getYouTubeImportFile, isLocalYouTubeImportEnabled, mimeTypeForFile } from "@/lib/youtube-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  if (!isLocalYouTubeImportEnabled()) return new Response(null, { status: 403 });
  const { sessionId } = await context.params;
  const file = await getYouTubeImportFile(sessionId);
  if (!file) return new Response("Temporary import not found. Re-import the source.", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(file.filePath)) as ReadableStream, {
    headers: {
      "Content-Type": mimeTypeForFile(file.fileName, "video"),
      "Content-Length": String(file.fileSize),
      "Content-Disposition": `inline; filename="${file.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}

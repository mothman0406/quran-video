import { getLocalQuranContent } from "@/lib/quran/local";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const verseKey = new URL(request.url).searchParams.get("key") ?? "";
  const result = getLocalQuranContent(verseKey);
  const status = result.status === "ready" ? 200 : 404;
  return Response.json(result, { status });
}

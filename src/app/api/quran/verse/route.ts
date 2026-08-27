import { fetchQuranVerse } from "@/lib/quran/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const verseKey = new URL(request.url).searchParams.get("key") ?? "";
  const result = await fetchQuranVerse(verseKey);
  const status = result.status === "ready" ? 200 : result.status === "setup_required" ? 503 : 502;
  return Response.json(result, { status });
}

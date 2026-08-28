import { getLocalQuranContent } from "@/lib/quran/local";
import { getTranslation } from "@/lib/quran/translations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keys = params.getAll("key");
  if (keys.length > 1) {
    const translations = Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await getTranslation(key)] as const)));
    return Response.json({ translations });
  }
  const verseKey = keys[0] ?? params.get("key") ?? "";
  const result = getLocalQuranContent(verseKey);
  const status = result.status === "ready" ? 200 : 404;
  return Response.json(result, { status });
}

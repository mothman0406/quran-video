const MEDIA_PATH = "/debug/transmux/opfs-media";
const OWNED_PREFIX = "quran-video-transmux-";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "claim-debug-clients") event.waitUntil(self.clients.claim());
});

function parseRange(value, size) {
  const match = /^bytes=(\d+)-(\d*)$/u.exec(value ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size) return null;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function serveOpfsMedia(request) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "";
  if (!name.startsWith(OWNED_PREFIX)) return new Response("Not found", { status: 404 });

  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(name);
    const file = await handle.getFile();
    const requestedRange = parseRange(request.headers.get("range"), file.size);
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": "video/mp4",
    });
    if (!requestedRange) {
      headers.set("Content-Length", String(file.size));
      return new Response(file, { status: 200, headers });
    }

    const { start, end } = requestedRange;
    headers.set("Content-Length", String(end - start + 1));
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    return new Response(file.slice(start, end + 1), { status: 206, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return new Response("Not found", { status: 404 });
    }
    return new Response("OPFS read failed", { status: 500 });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname === MEDIA_PATH) {
    event.respondWith(serveOpfsMedia(event.request));
  }
});

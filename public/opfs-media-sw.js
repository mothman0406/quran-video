const MEDIA_PREFIX = "/_quran-video/opfs-media/";
const OWNED_NAME = /^quran-video-transmux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/u;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data === "claim-opfs-media-clients") event.waitUntil(self.clients.claim());
  if (event.data?.type === "delete-opfs-media" && OWNED_NAME.test(event.data.name)) {
    event.waitUntil(navigator.storage.getDirectory()
      .then((root) => root.removeEntry(event.data.name))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
      }));
  }
});

function parseRange(value, size) {
  if (!value) return { kind: "none" };
  const match = /^bytes=(\d*)-(\d*)$/u.exec(value);
  if (!match || (!match[1] && !match[2])) return { kind: "invalid" };
  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: "invalid" };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return { kind: "invalid" };
  return { kind: "range", start, end: Math.min(end, size - 1) };
}

async function serve(request, name) {
  if (!OWNED_NAME.test(name) || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle(name)).getFile();
    const requested = parseRange(request.headers.get("range"), file.size);
    const headers = new Headers({
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "video/mp4",
    });
    if (requested.kind === "invalid") {
      headers.set("Content-Range", `bytes */${file.size}`);
      return new Response(null, { status: 416, headers });
    }
    if (requested.kind === "none") {
      headers.set("Content-Length", String(file.size));
      return new Response(request.method === "HEAD" ? null : file, { status: 200, headers });
    }
    const { start, end } = requested;
    headers.set("Content-Length", String(end - start + 1));
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    return new Response(request.method === "HEAD" ? null : file.slice(start, end + 1), { status: 206, headers });
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return new Response("Not found", { status: 404 });
    return new Response("Temporary media unavailable", { status: 500 });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(MEDIA_PREFIX)) return;
  const encodedName = url.pathname.slice(MEDIA_PREFIX.length);
  let name = "";
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    event.respondWith(new Response("Not found", { status: 404 }));
    return;
  }
  if (name.includes("/") || name.includes("\\")) {
    event.respondWith(new Response("Not found", { status: 404 }));
    return;
  }
  event.respondWith(serve(event.request, name));
});

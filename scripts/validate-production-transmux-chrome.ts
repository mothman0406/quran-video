const DEFAULT_DEBUG_URL = "http://127.0.0.1:9222";

export {};

type CdpMessage = { id?: number; result?: unknown; error?: unknown };

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve(value: unknown): void; reject(reason: unknown): void }>();
  private socket: WebSocket;
  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error))); else pending.resolve(message.result);
    });
  }
  static async connect(url: string) {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Unable to connect to Chrome DevTools.")), { once: true });
    });
    return new CdpClient(socket);
  }
  command<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluate<T>(client: CdpClient, expression: string, userGesture = false) {
  const response = await client.command<{ result: { value?: T; description?: string }; exceptionDetails?: unknown }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture });
  if (response.exceptionDetails) throw new Error(response.result.description ?? "Chrome evaluation failed.");
  return response.result.value as T;
}

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 120_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

async function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("Usage: npm run regression:production-transmux:chrome -- <source.mov>");
  const targets = await fetch(`${DEFAULT_DEBUG_URL}/json/list`).then((response) => response.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http://localhost:3000/"));
  if (!target) throw new Error("Open headed Chrome on the local application before running this regression.");
  const version = await fetch(`${DEFAULT_DEBUG_URL}/json/version`).then((response) => response.json());
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.command("Runtime.enable"); await client.command("DOM.enable");
    if (!target.url.includes("/create?debugMedia=1")) {
      await evaluate(client, `location.href = '/create?debugMedia=1'`);
      await waitFor(() => evaluate<string>(client, `location.pathname + location.search`), (value) => value === "/create?debugMedia=1", 30_000);
    }
    await evaluate(client, `(() => { window.__productionMediaLogs = []; const original = console.info.bind(console); console.info = (...args) => { window.__productionMediaLogs.push(args.map(String).join(' ')); original(...args); }; return true; })()`);
    await evaluate(client, `(() => { sessionStorage.removeItem('production-transmux-pagehide-persisted'); window.addEventListener('pagehide', (event) => sessionStorage.setItem('production-transmux-pagehide-persisted', String(event.persisted)), { once: true }); return true; })()`);
    await waitFor(() => evaluate<boolean>(client, `Boolean(document.querySelector('.quick-create-drop input[type="file"]'))`), Boolean, 30_000);
    const document = await client.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await client.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: '.quick-create-drop input[type="file"]' });
    if (!input.nodeId) throw new Error("Quick Create source input was not found.");
    await client.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [sourcePath] });
    const status = await waitFor(() => evaluate<string>(client, `document.querySelector('.quick-create-status strong')?.textContent ?? ''`), (value) => value === "Ready to generate" || value.includes("couldn"));
    if (status !== "Ready to generate") throw new Error(status);
    const playback = await evaluate<Record<string, unknown>>(client, `(async () => {
      const video = document.querySelector('.quick-create-preview video');
      if (!(video instanceof HTMLVideoElement)) throw new Error('Production preview video missing');
      const wait = (event) => new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Timed out: ' + event)), 15000); video.addEventListener(event, () => { clearTimeout(timeout); resolve(); }, { once: true }); });
      if (video.readyState < 1) await wait('loadedmetadata');
      const seeks = [];
      for (const requested of [1, 10, 20, 30]) { const target = Math.min(requested, Math.max(0, video.duration - .05)); const done = wait('seeked'); video.currentTime = target; await done; seeks.push({ requested, currentTime: video.currentTime }); }
      await video.play(); await new Promise((resolve) => setTimeout(resolve, 500)); video.pause();
      const root = await navigator.storage.getDirectory(); const owned = []; for await (const [name] of root) if (name.startsWith('quran-video-transmux-')) owned.push(name);
      return { src: video.getAttribute('src'), duration: video.duration, readyState: video.readyState, pausedAt: video.currentTime, seeks, ownedTemporaryCount: owned.length };
    })()`, true);
    const logs = await evaluate<string[]>(client, `window.__productionMediaLogs ?? []`);
    const routeLog = logs.find((line) => line.includes("media-route-decision") && line.includes("exact-transmux")) ?? null;
    const completeLog = logs.find((line) => line.includes("exact-transmux-complete")) ?? null;
    const ffmpegInitialized = logs.some((line) => line.includes("ffmpeg-initialize-start") || line.includes('"loaded":true'));
    if (!routeLog || !completeLog || ffmpegInitialized) throw new Error("Production route evidence was incomplete or FFmpeg initialized.");
    const temporaryName = String(playback.src ?? "").split("/").at(-1);
    if (!temporaryName) throw new Error("Temporary media identifier was not observable.");
    await evaluate(client, `(() => { const button = document.querySelector('.quick-create-generate'); if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Generate button unavailable'); button.click(); return true; })()`, true);
    await waitFor(() => evaluate<string>(client, `location.pathname`), (value) => value === "/videos", 30_000);
    const normalFlow = await waitFor(
      () => evaluate<Record<string, unknown> | null>(client, `(() => { const card = document.querySelector('.video-card'); if (!card) return null; return { pathname: location.pathname, title: card.querySelector('h2')?.textContent ?? null, status: card.querySelector('.video-status')?.textContent ?? null }; })()`),
      (value) => value !== null,
      30_000,
    );
    await evaluate(client, `location.replace('/')`);
    await waitFor(() => evaluate<string>(client, `location.pathname`), (value) => value === "/", 30_000);
    const temporaryRemoved = await waitFor(() => evaluate<boolean>(client, `(async () => { try { await (await navigator.storage.getDirectory()).getFileHandle(${JSON.stringify(temporaryName)}); return false; } catch (error) { return error instanceof DOMException && error.name === 'NotFoundError'; } })()`), (value) => value, 30_000);
    const pagehidePersisted = await evaluate<string | null>(client, `sessionStorage.getItem('production-transmux-pagehide-persisted')`);
    console.log(JSON.stringify({ version, route: "exact-transmux", status, playback, routeLog, completeLog, ffmpegInitialized, recognitionSource: "original", normalFlow, pagehidePersisted, temporaryRemoved }, null, 2));
  } finally { client.close(); }
}

await main();

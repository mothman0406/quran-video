const DEBUG_URL = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";

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

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 180_000) {
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
  if (!sourcePath) throw new Error("Usage: npm run regression:media-preparation:chrome -- <media-path>");
  const targets = await fetch(`${DEBUG_URL}/json/list`).then((response) => response.json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>;
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http://localhost:3000/"));
  if (!target) throw new Error("Open Chrome on the local application before running this regression.");
  const version = await fetch(`${DEBUG_URL}/json/version`).then((response) => response.json()) as { Browser?: string };
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.command("Runtime.enable");
    await client.command("DOM.enable");
    await evaluate(client, `location.replace('/create?debugMedia=1&qa=' + Date.now())`);
    await waitFor(() => evaluate<string>(client, `location.pathname`), (value) => value === "/create", 30_000);
    await evaluate(client, `(() => {
      window.__mediaQaLogs = [];
      window.__mediaQaErrors = [];
      const original = console.info.bind(console);
      console.info = (...args) => { window.__mediaQaLogs.push(args.map(String).join(' ')); original(...args); };
      window.addEventListener('error', (event) => window.__mediaQaErrors.push(String(event.error?.message ?? event.message)));
      window.addEventListener('unhandledrejection', (event) => window.__mediaQaErrors.push(String(event.reason?.message ?? event.reason)));
      return true;
    })()`);
    await waitFor(() => evaluate<boolean>(client, `Boolean(document.querySelector('.quick-create-page input[type="file"]'))`), Boolean, 30_000);
    const document = await client.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await client.command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: '.quick-create-page input[type="file"]' });
    if (!input.nodeId) throw new Error("Quick Create source input was not found.");
    const startedAt = performance.now();
    await client.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [sourcePath] });
    const status = await waitFor(
      () => evaluate<string>(client, `document.querySelector('.quick-create-status strong')?.textContent ?? ''`),
      (value) => value === "Ready to generate" || value === "Preparation failed",
    );
    const totalMilliseconds = Math.round(performance.now() - startedAt);
    const result = await evaluate<Record<string, unknown>>(client, `(async () => {
      const video = document.querySelector('.quick-create-preview video');
      if (!(video instanceof HTMLVideoElement)) throw new Error('Production preview video missing');
      const button = document.querySelector('.quick-create-generate');
      const logs = window.__mediaQaLogs ?? [];
      let playbackSucceeded = false;
      try {
        video.currentTime = Math.min(1, Math.max(0, video.duration - .05));
        await video.play();
        await new Promise((resolve) => setTimeout(resolve, 250));
        video.pause();
        playbackSucceeded = video.currentTime > 0;
      } catch {}
      return {
        status: document.querySelector('.quick-create-status strong')?.textContent ?? null,
        preview: { duration: video.duration, readyState: video.readyState, sourceIsBlob: video.src.startsWith('blob:'), playbackSucceeded },
        generateEnabled: button instanceof HTMLButtonElement && !button.disabled,
        preparationLogs: logs.filter((line) => line.includes('[Quran AutoCaption debug]')),
        errors: window.__mediaQaErrors ?? [],
      };
    })()`, true);
    console.log(JSON.stringify({ browser: version.Browser, sourcePath, totalMilliseconds, ...result }, null, 2));
    if (status !== "Ready to generate") throw new Error(status);
    if (!result.generateEnabled) throw new Error("Generate remained disabled after media preparation.");
  } finally {
    client.close();
  }
}

await main();

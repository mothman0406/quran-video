const DEFAULT_DEBUG_URL = "http://127.0.0.1:9222";

export {};

type CdpResult = { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };

class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: unknown) => void }>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpResult;
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
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
  const response = await client.command<{ result: { value?: T; description?: string }; exceptionDetails?: unknown }>(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture },
  );
  if (response.exceptionDetails) throw new Error(response.result.description ?? "Chrome evaluation failed.");
  return response.result.value as T;
}

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 30_000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

async function main() {
  const sourcePath = process.argv[2];
  const outputMode = process.argv[3] ?? "buffer-fast-start";
  if (!sourcePath) throw new Error("Usage: node scripts/validate-mediabunny-transmux-chrome.ts <source.mov> [buffer-fast-start|opfs-fragmented]");
  if (!new Set(["buffer-fast-start", "opfs-fragmented"]).has(outputMode)) throw new Error("Unknown output mode.");

  const targets = await fetch(`${DEFAULT_DEBUG_URL}/json/list`).then((response) => response.json()) as Array<{
    type: string;
    url: string;
    webSocketDebuggerUrl: string;
  }>;
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url.endsWith("/debug/transmux"));
  if (!target) throw new Error("Open the headed Chrome debug page before running this script.");
  const version = await fetch(`${DEFAULT_DEBUG_URL}/json/version`).then((response) => response.json());
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.command("Runtime.enable");
    await client.command("DOM.enable");
    const document = await client.command<{ root: { nodeId: number } }>("DOM.getDocument");
    const input = await client.command<{ nodeId: number }>("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: '[data-testid="transmux-source"]',
    });
    if (!input.nodeId) throw new Error("Source file input was not found.");
    await client.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [sourcePath] });
    await evaluate(client, `(() => {
      const select = document.querySelector('select');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Mode selector missing');
      select.value = ${JSON.stringify(outputMode)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await evaluate(client, `document.querySelector('[data-testid="generate-transmux"]')?.click()`, true);
    const generationStatus = await waitFor(
      () => evaluate<string>(client, `document.querySelector('[data-testid="transmux-status"]')?.textContent ?? ''`),
      (value) => value.includes("Generated and loaded") || value.includes("REJECTED") || value.includes("failed") || value.includes("Error"),
      60_000,
    );
    if (!generationStatus.includes("Generated and loaded")) {
      const rejectedReport = JSON.parse(await evaluate<string>(client, `document.querySelector('[data-testid="transmux-report"]')?.textContent ?? '{}'`));
      console.log(JSON.stringify({ version, generationStatus, rejectedReport }, null, 2));
      throw new Error(generationStatus);
    }
    const afterGeneration = JSON.parse(await evaluate<string>(client, `document.querySelector('[data-testid="transmux-report"]')?.textContent ?? '{}'`));
    await evaluate(client, `document.querySelector('[data-testid="run-chrome-suite"]')?.click()`, true);
    const validationStatus = await waitFor(
      () => evaluate<string>(client, `document.querySelector('[data-testid="transmux-status"]')?.textContent ?? ''`),
      (value) => value.includes("checks passed") || value.includes("Timed out") || value.includes("error"),
      60_000,
    );
    if (!validationStatus.includes("checks passed")) throw new Error(validationStatus);
    const report = JSON.parse(await evaluate<string>(client, `document.querySelector('[data-testid="transmux-report"]')?.textContent ?? '{}'`));
    const events = JSON.parse(await evaluate<string>(client, `document.querySelector('[data-testid="transmux-events"]')?.textContent ?? '[]'`));
    console.log(JSON.stringify({ version, generationStatus, validationStatus, afterGeneration, report, events }, null, 2));
  } finally {
    client.close();
  }
}

await main();

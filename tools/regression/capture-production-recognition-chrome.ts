#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const DEBUG_URL = "http://127.0.0.1:9222";
const DEBUG_PREFIX = "[Quran AutoCaption debug]";

type CdpMessage = {
  id?: number;
  method?: string;
  params?: { type?: string; args?: Array<{ type?: string; value?: unknown }> };
  result?: unknown;
  error?: unknown;
};

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(reason: unknown): void }>();
  private readonly listeners = new Set<(message: CdpMessage) => void>();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
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

  onEvent(listener: (message: CdpMessage) => void) { this.listeners.add(listener); }
  close() { this.socket.close(); }
}

async function evaluate<T>(client: CdpClient, expression: string, userGesture = false) {
  const response = await client.command<{ result: { value?: T; description?: string }; exceptionDetails?: unknown }>("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  });
  if (response.exceptionDetails) throw new Error(response.result.description ?? "Chrome evaluation failed.");
  return response.result.value as T;
}

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs: number) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

const sourcePath = process.argv[2];
const outputPath = process.argv[3];
if (!sourcePath || !outputPath) {
  throw new Error("Usage: npm run calibration:validation:capture -- <private-media> <ignored-debug-log>");
}

const targets = await fetch(`${DEBUG_URL}/json/list`).then((response) => response.json()) as Array<{
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}>;
const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http://localhost:3000/"));
if (!target) throw new Error("Open Chrome with remote debugging on the local production application first.");

const client = await CdpClient.connect(target.webSocketDebuggerUrl);
const logs: string[] = [];
client.onEvent((message) => {
  if (message.method !== "Runtime.consoleAPICalled") return;
  const line = message.params?.args?.flatMap((argument) => typeof argument.value === "string" ? [argument.value] : []).join(" ") ?? "";
  if (line.includes(DEBUG_PREFIX)) logs.push(line.slice(line.indexOf(DEBUG_PREFIX)));
});

try {
  await client.command("Runtime.enable");
  await client.command("DOM.enable");
  await evaluate(client, `location.href = '/create?debugMedia=1'`);
  await waitFor(
    () => evaluate<string>(client, `location.pathname + location.search`),
    (value) => value === "/create?debugMedia=1",
    30_000,
  );
  await waitFor(
    () => evaluate<boolean>(client, `Boolean(document.querySelector('.quick-create-drop input[type="file"]'))`),
    Boolean,
    30_000,
  );
  const document = await client.command<{ root: { nodeId: number } }>("DOM.getDocument");
  const input = await client.command<{ nodeId: number }>("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: '.quick-create-drop input[type="file"]',
  });
  if (!input.nodeId) throw new Error("Quick Create source input was not found.");
  // Runtime.enable can replay console history from the preceding capture.
  // Start this artifact only after the fresh Quick Create page is ready.
  logs.length = 0;
  await client.command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [sourcePath] });
  const status = await waitFor(
    () => evaluate<string>(client, `document.querySelector('.quick-create-status strong')?.textContent ?? ''`),
    (value) => value === "Ready to generate" || value.includes("couldn"),
    180_000,
  );
  if (status !== "Ready to generate") throw new Error(status);
  await evaluate(client, `(() => { const button = document.querySelector('.quick-create-generate'); if (!(button instanceof HTMLButtonElement) || button.disabled) throw new Error('Generate button unavailable'); button.click(); return true; })()`, true);
  await waitFor(() => evaluate<string>(client, `location.pathname`), (value) => value === "/videos", 30_000);
  try {
    await waitFor(
      async () => logs,
      (lines) => {
        const final = lines.find((line) => line.includes(" final-identity-decision "));
        if (!final) return false;
        if (final.includes('"decision":"abstained"')) return true;
        return lines.some((line) => line.includes(" forced-alignment-succeeded ") || line.includes(" forced-alignment-failed "));
      },
      900_000,
    );
  } finally {
    // Preserve terminal-or-timeout evidence so an expensive browser-local run
    // never has to be repeated merely because alignment did not terminate.
    await writeFile(outputPath, `${logs.join("\n")}\n`, "utf8");
  }
  const events = logs.map((line) => line.slice(DEBUG_PREFIX.length).trim().split(" ", 1)[0]);
  process.stdout.write(`${JSON.stringify({ capturedEvents: events.length, finalIdentity: events.includes("final-identity-decision"), forcedAlignmentTerminal: events.includes("forced-alignment-succeeded") || events.includes("forced-alignment-failed") })}\n`);
} finally {
  client.close();
}

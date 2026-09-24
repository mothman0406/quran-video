#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve, sep } from "node:path";
import { COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS } from "./quran-complete-range-final-validation.ts";

const require = createRequire(import.meta.url);
const root = process.cwd();
const sourcePath = process.argv[2] ? resolve(process.argv[2]) : null;
const designationId = process.argv[3];
const outputPath = process.argv[4] ? resolve(process.argv[4]) : null;
const designation = COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.find((entry) => entry.id === designationId);
if (!sourcePath || !designation || !outputPath) {
  throw new Error("Usage: capture-quran-complete-range-final-validation.ts <private-media> <predesignated-id> <privacy-safe-output.json>");
}

const bundleDirectory = join(root, "tmp", "quran-complete-range-final-browser");
await mkdir(bundleDirectory, { recursive: true });
const { loadBindings } = require("next/dist/build/swc/index.js") as { loadBindings(): Promise<unknown> };
await loadBindings();
type WebpackStats = { hasErrors(): boolean; toString(options: Record<string, unknown>): string };
type Webpack = (configuration: Record<string, unknown>, callback: (error?: Error | null, stats?: WebpackStats) => void) => void;
const webpack = (require("next/dist/compiled/webpack/webpack") as { webpack: Webpack }).webpack;
const swcLoader = require.resolve("next/dist/build/webpack/loaders/next-swc-loader");
await new Promise<void>((resolveBuild, rejectBuild) => webpack({
  mode: "production",
  target: "web",
  entry: join(root, "tools/regression/browser-quran-complete-range-final-validation.ts"),
  output: { path: bundleDirectory, filename: "capture.js", chunkFilename: "[name].[contenthash].js", publicPath: "/" },
  resolve: { extensions: [".ts", ".tsx", ".mjs", ".js", ".json"] },
  experiments: { asyncWebAssembly: true },
  module: {
    rules: [{
      test: /\.tsx?$/u,
      include: [join(root, "src"), join(root, "tools")],
      use: [{
        loader: swcLoader,
        options: {
          rootDir: root,
          isServer: false,
          hasReactRefresh: false,
          nextConfig: {},
          jsConfig: { compilerOptions: {} },
          supportedBrowsers: ["chrome 120"],
          swcCacheDir: join(bundleDirectory, ".swc"),
        },
      }],
    }],
  },
  optimization: { minimize: false },
}, (error: Error | null | undefined, stats: WebpackStats | undefined) => {
  if (error) return rejectBuild(error);
  if (stats?.hasErrors()) return rejectBuild(new Error(stats.toString({ all: false, errors: true, warnings: true })));
  resolveBuild();
}));

const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".onnx": "application/octet-stream",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost:3000").pathname;
    if (pathname === "/__source") {
      response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" });
      response.end(await readFile(sourcePath));
      return;
    }
    if (pathname === "/") {
      response.writeHead(200, { "content-type": contentTypes[".html"] });
      response.end("<!doctype html><meta charset=utf-8><body><script src=/capture.js></script></body>");
      return;
    }
    const relative = pathname.replace(/^\/+/, "");
    const candidates = [join(bundleDirectory, relative), join(root, "public", relative)];
    for (const candidate of candidates) {
      if (!candidate.startsWith(bundleDirectory + sep) && !candidate.startsWith(join(root, "public") + sep)) continue;
      try {
        if (!(await stat(candidate)).isFile()) continue;
        response.writeHead(200, { "content-type": contentTypes[extname(candidate)] ?? "application/octet-stream" });
        response.end(await readFile(candidate));
        return;
      } catch { /* try next safe root */ }
    }
    response.writeHead(404).end();
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : String(error));
  }
});
await new Promise<void>((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(3000, "127.0.0.1", resolveListen);
});

type CdpMessage = { id?: number; result?: unknown; error?: unknown };
class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(reason: unknown): void }>();
  private readonly socket: WebSocket;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as CdpMessage;
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
    await new Promise<void>((resolveSocket, rejectSocket) => {
      socket.addEventListener("open", () => resolveSocket(), { once: true });
      socket.addEventListener("error", () => rejectSocket(new Error("Unable to connect to Chrome DevTools.")), { once: true });
    });
    return new CdpClient(socket);
  }

  command<T>(method: string, params: Record<string, unknown> = {}) {
    const id = this.nextId++;
    return new Promise<T>((resolveCommand, rejectCommand) => {
      this.pending.set(id, { resolve: resolveCommand as (value: unknown) => void, reject: rejectCommand });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

try {
  const targets = await fetch("http://127.0.0.1:9222/json/list").then((response) => response.json()) as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const target = targets.find((candidate) => candidate.type === "page");
  if (!target) throw new Error("Open Chrome with remote debugging on port 9222 before capture.");
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    await client.command("Runtime.enable");
    await client.command("Page.enable");
    await client.command("Network.enable");
    await client.command("Network.setBypassServiceWorker", { bypass: true });
    await client.command("Page.addScriptToEvaluateOnNewDocument", {
      source: "window.__completeRangeErrors=[];addEventListener('error',event=>window.__completeRangeErrors.push(String(event.error?.stack||event.message)));addEventListener('unhandledrejection',event=>window.__completeRangeErrors.push(String(event.reason?.stack||event.reason)));",
    });
    await client.command("Page.navigate", { url: "http://127.0.0.1:3000/" });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const probe = await client.command<{ result: { value?: boolean } }>("Runtime.evaluate", {
        expression: "typeof window.runCompleteRangeFinalValidation === 'function'",
        returnByValue: true,
      });
      if (probe.result.value) { ready = true; break; }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (!ready) {
      const diagnostic = await client.command<{ result: { value?: unknown } }>("Runtime.evaluate", {
        expression: "({errors:window.__completeRangeErrors,scripts:[...document.scripts].map(script=>script.src),body:document.body?.innerText})",
        returnByValue: true,
      });
      throw new Error(`Validation bundle did not become ready: ${JSON.stringify(diagnostic.result.value)}`);
    }
    const evaluation = await client.command<{ result: { value?: unknown; description?: string }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression: `window.runCompleteRangeFinalValidation(${JSON.stringify(designation.id)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (evaluation.exceptionDetails || !evaluation.result.value) {
      throw new Error(evaluation.result.description ?? "Complete-range validation failed.");
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evaluation.result.value, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ id: designation.id, role: designation.role, output: outputPath })}\n`);
  } finally {
    client.close();
  }
} finally {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

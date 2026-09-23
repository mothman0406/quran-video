#!/usr/bin/env node
import { writeFile } from "node:fs/promises";

const DEBUG_URL = "http://127.0.0.1:9222";
const DEBUG_PREFIX = "[Quran AutoCaption debug]";
const outputPath = process.argv[2];
if (!outputPath) throw new Error("Usage: capture-current-debug-console.ts <ignored-debug-log>");

const targets = await fetch(`${DEBUG_URL}/json/list`).then((response) => response.json()) as Array<{
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}>;
const target = targets.find((candidate) => candidate.type === "page" && candidate.url.startsWith("http://localhost:3000/"));
if (!target) throw new Error("No local application page is attached to Chrome DevTools.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const lines: string[] = [];
await new Promise<void>((resolve, reject) => {
  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
    setTimeout(resolve, 2_000);
  }, { once: true });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      method?: string;
      params?: { args?: Array<{ value?: unknown }> };
    };
    if (message.method !== "Runtime.consoleAPICalled") return;
    const line = message.params?.args?.flatMap((argument) => typeof argument.value === "string" ? [argument.value] : []).join(" ") ?? "";
    if (line.includes(DEBUG_PREFIX)) lines.push(line.slice(line.indexOf(DEBUG_PREFIX)));
  });
  socket.addEventListener("error", () => reject(new Error("Unable to read Chrome DevTools console.")), { once: true });
});
socket.close();
await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${lines.length}\n`);

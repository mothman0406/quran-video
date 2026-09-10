import type { ExportPreflightStatus } from "./preflight.ts";

export class ExportCoordinator {
  private active = false;

  start(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  finish(): void { this.active = false; }
  get isActive(): boolean { return this.active; }
}

/** Holds one authorized request while non-blocking warnings await confirmation. */
export class ExportPreflightOverride<T> {
  private pending: T | null = null;

  stage(status: ExportPreflightStatus, request: T): ExportPreflightStatus {
    this.pending = status === "warnings" ? request : null;
    return status;
  }

  take(): T | null {
    const request = this.pending;
    this.pending = null;
    return request;
  }

  clear(): void { this.pending = null; }
}

export function localExportFailureMessage(caught: unknown): string {
  if ((caught as DOMException)?.name === "AbortError")
    return "Export cancelled. Your source video and editor state were kept.";
  return caught instanceof Error
    ? caught.message
    : "Local export failed. Your project was kept.";
}

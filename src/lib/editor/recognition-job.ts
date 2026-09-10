export type RecognitionJobPhase = "idle" | "initializing" | "processing" | "aligning" | "finalizing" | "completed" | "failed" | "cancelled";
export type RecognitionJobSnapshot = { id: number; sourceIdentity: string; phase: RecognitionJobPhase };

/**
 * Imperative recognition ownership, deliberately independent from React and
 * document visibility. Browser background throttling can pause work, but it
 * must never change which job owns a later completion.
 */
export class RecognitionJobController {
  private nextId = 0;
  private current: RecognitionJobSnapshot | null = null;

  start(sourceIdentity: string, explicitRerun = false): RecognitionJobSnapshot | null {
    if (this.current && this.current.sourceIdentity === sourceIdentity && !explicitRerun && !this.isTerminal(this.current.phase)) return null;
    if (this.current && !this.isTerminal(this.current.phase)) this.current = { ...this.current, phase: "cancelled" };
    this.current = { id: ++this.nextId, sourceIdentity, phase: "initializing" };
    return this.current;
  }

  update(id: number, phase: Exclude<RecognitionJobPhase, "idle" | "cancelled">) {
    if (!this.current || this.current.id !== id || this.current.phase === "cancelled") return null;
    this.current = { ...this.current, phase };
    return this.current;
  }

  cancel(id: number) {
    if (!this.current || this.current.id !== id || this.isTerminal(this.current.phase)) return null;
    this.current = { ...this.current, phase: "cancelled" };
    return this.current;
  }

  invalidateSource() {
    if (!this.current || this.isTerminal(this.current.phase)) return null;
    this.current = { ...this.current, phase: "cancelled" };
    return this.current;
  }

  isCurrent(id: number) { return this.current?.id === id && this.current.phase !== "cancelled"; }
  snapshot() { return this.current ? { ...this.current } : null; }
  /** Visibility reconciliation is intentionally a read-only operation. */
  reconcileVisibility() { return this.snapshot(); }

  private isTerminal(phase: RecognitionJobPhase) { return phase === "completed" || phase === "failed" || phase === "cancelled" || phase === "idle"; }
}

/**
 * Small, framework-independent transactional history for editable project
 * state. Callers own applying the returned snapshots to their UI store.
 */
export type EditorHistorySnapshot<T> = Readonly<{
  past: readonly T[];
  future: readonly T[];
  transactionOpen: boolean;
}>;

export class EditorHistory<T> {
  #past: T[] = [];
  #future: T[] = [];
  #transactionStart: T | null = null;
  readonly #equals: (left: T, right: T) => boolean;
  readonly #limit: number;

  constructor(equals: (left: T, right: T) => boolean, limit = 120) {
    this.#equals = equals;
    this.#limit = limit;
  }

  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }

  snapshot(): EditorHistorySnapshot<T> {
    return { past: this.#past, future: this.#future, transactionOpen: this.#transactionStart !== null };
  }

  reset() {
    this.#past = [];
    this.#future = [];
    this.#transactionStart = null;
  }

  begin(present: T) {
    if (this.#transactionStart === null) this.#transactionStart = present;
  }

  commit(present: T): boolean {
    const start = this.#transactionStart;
    this.#transactionStart = null;
    return start !== null && this.record(start, present);
  }

  cancel() { this.#transactionStart = null; }

  record(previous: T, next: T): boolean {
    if (this.#equals(previous, next)) return false;
    this.#past.push(previous);
    if (this.#past.length > this.#limit) this.#past.splice(0, this.#past.length - this.#limit);
    this.#future = [];
    return true;
  }

  undo(present: T): T | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(present);
    return previous;
  }

  redo(present: T): T | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(present);
    return next;
  }
}

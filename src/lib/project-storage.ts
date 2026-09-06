import { SavedProjectSchema, type SavedProject } from "./schemas/project.ts";

export const PROJECT_DATABASE_NAME = "quran-video-projects";
export const PROJECT_STORE_NAME = "projects";
const PROJECT_DATABASE_VERSION = 1;

export interface ProjectRepository {
  list(): Promise<SavedProject[]>;
  get(id: string): Promise<SavedProject | null>;
  put(project: SavedProject): Promise<void>;
  delete(id: string): Promise<void>;
}

function assertMetadataOnly(value: unknown, path = "project"): void {
  if (typeof Blob !== "undefined" && value instanceof Blob) throw new Error(`Unsupported media payload at ${path}`);
  if (typeof File !== "undefined" && value instanceof File) throw new Error(`Unsupported media payload at ${path}`);
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) throw new Error(`Unsupported media payload at ${path}`);
  if (typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:video/") || value.startsWith("data:audio/"))) {
    throw new Error(`Unsupported media URL at ${path}`);
  }
  if (Array.isArray(value)) value.forEach((item, index) => assertMetadataOnly(item, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => assertMetadataOnly(item, `${path}.${key}`));
}

function migrateSavedProject(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const project = value as Record<string, unknown>;
  if (!Array.isArray(project.verseAlignments)) return value;

  return {
    ...project,
    // Projects created before inline ayah numbers had no explicit preference.
    // Preserve saved false, but give missing legacy state the new default.
    ...(typeof project.showVerseNumber === "boolean" ? {} : { showVerseNumber: true }),
    verseAlignments: project.verseAlignments.map((alignment) => {
      if (!alignment || typeof alignment !== "object" || Array.isArray(alignment)) return alignment;
      const current = alignment as Record<string, unknown>;
      const hasCurrentTiming = "startMs" in current || "endMs" in current;
      if (hasCurrentTiming || !(typeof current.startSeconds === "number" && typeof current.endSeconds === "number")) return alignment;
      const verseKey = typeof current.verseKey === "string"
        ? current.verseKey
        : typeof current.surahNumber === "number" && typeof current.ayahNumber === "number"
          ? `${current.surahNumber}:${current.ayahNumber}`
          : undefined;
      const rest = Object.fromEntries(Object.entries(current).filter(([key]) => key !== "startSeconds" && key !== "endSeconds"));
      return {
        ...rest,
        ...(verseKey ? { verseKey } : {}),
        startMs: current.startSeconds * 1_000,
        endMs: current.endSeconds * 1_000,
        confidence: typeof current.confidence === "number" ? current.confidence : 0,
      };
    }),
  };
}

export function validateSavedProject(project: unknown): SavedProject {
  const parsed = SavedProjectSchema.parse(migrateSavedProject(project));
  assertMetadataOnly(parsed);
  return parsed;
}

/** Serialize only validated, metadata-only project state for local persistence. */
export function serializeSavedProject(project: SavedProject): string {
  return JSON.stringify(validateSavedProject(project));
}

/** Load either a JSON payload or an IndexedDB object and migrate legacy timing once. */
export function loadSavedProject(value: unknown): SavedProject {
  if (typeof value === "string") {
    try {
      return validateSavedProject(JSON.parse(value) as unknown);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("Saved project data is not valid JSON.", { cause: error });
      throw error;
    }
  }
  return validateSavedProject(value);
}

export function createProjectRepository(indexedDB: IDBFactory | undefined = globalThis.indexedDB): ProjectRepository {
  if (!indexedDB) throw new Error("IndexedDB is unavailable in this browser.");
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(PROJECT_DATABASE_NAME, PROJECT_DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Could not open local project storage."));
    request.onupgradeneeded = () => request.result.createObjectStore(PROJECT_STORE_NAME, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
  });
  const transact = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, finish: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> => {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE_NAME, mode);
      const store = transaction.objectStore(PROJECT_STORE_NAME);
      run(store, resolve, reject);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error("Local project storage failed.")); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? new Error("Local project storage was aborted.")); };
    });
  };
  return {
    list: () => transact("readonly", (store, resolve, reject) => { const request = store.getAll(); request.onsuccess = () => { try { resolve(request.result.map(loadSavedProject)); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }),
    get: (id) => transact("readonly", (store, resolve, reject) => { const request = store.get(id); request.onsuccess = () => { try { resolve(request.result ? loadSavedProject(request.result) : null); } catch (error) { reject(error); } }; request.onerror = () => reject(request.error); }),
    put: (project) => { const valid = loadSavedProject(serializeSavedProject(project)); return transact("readwrite", (store, resolve, reject) => { const request = store.put(valid); request.onsuccess = () => resolve(undefined); request.onerror = () => reject(request.error); }); },
    delete: (id) => transact("readwrite", (store, resolve, reject) => { const request = store.delete(id); request.onsuccess = () => resolve(undefined); request.onerror = () => reject(request.error); }),
  };
}

export function createMemoryProjectRepository(seed: SavedProject[] = []): ProjectRepository {
  const projects = new Map(seed.map((project) => [project.id, structuredClone(loadSavedProject(project))]));
  return {
    async list() { return [...projects.values()].map((project) => structuredClone(project)); },
    async get(id) { const project = projects.get(id); return project ? structuredClone(project) : null; },
    async put(project) { const valid = loadSavedProject(serializeSavedProject(project)); projects.set(valid.id, structuredClone(valid)); },
    async delete(id) { projects.delete(id); },
  };
}

export function sourceFingerprint(file: Pick<File, "name" | "size" | "type">): string {
  return `${file.name}:${file.size}:${file.type}`;
}

export function verifySourceFile(file: Pick<File, "name" | "size" | "type">, source: SavedProject["sourceVideo"], durationSeconds?: number): { matches: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!source) return { matches: true, reasons };
  if (source.fileName !== file.name) reasons.push(`filename is “${file.name}”, expected “${source.fileName}”`);
  if (source.fileSize !== undefined && source.fileSize !== file.size) reasons.push(`file size is ${file.size} bytes, expected ${source.fileSize} bytes`);
  if (source.mimeType !== file.type) reasons.push(`media type is “${file.type || "unknown"}”, expected “${source.mimeType}”`);
  if (source.durationSeconds !== undefined && durationSeconds !== undefined && Math.abs(source.durationSeconds - durationSeconds) > 0.5) reasons.push(`duration is ${durationSeconds.toFixed(2)}s, expected ${source.durationSeconds.toFixed(2)}s`);
  return { matches: reasons.length === 0, reasons };
}

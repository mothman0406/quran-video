export const EPHEMERAL_TRANSMUX_PREFIX = "quran-video-transmux-";
export const EPHEMERAL_TRANSMUX_NAME_PATTERN = /^quran-video-transmux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/u;

export function isEphemeralOpfsName(name: string): boolean {
  return EPHEMERAL_TRANSMUX_NAME_PATTERN.test(name);
}

export type EphemeralOpfsFile = {
  directory: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
  name: string;
  ownerId?: string;
};

function createName() {
  const id = globalThis.crypto.randomUUID();
  return `${EPHEMERAL_TRANSMUX_PREFIX}${id}.mp4`;
}

export async function createEphemeralOpfsFile(
  directory: FileSystemDirectoryHandle,
  ownerId?: string,
): Promise<EphemeralOpfsFile> {
  const name = createName();
  const handle = await directory.getFileHandle(name, { create: true });
  return { directory, handle, name, ownerId };
}

export async function removeEphemeralOpfsFile(file: EphemeralOpfsFile | null): Promise<void> {
  if (!file) return;
  if (!isEphemeralOpfsName(file.name)) {
    throw new Error("Refusing to remove a file that is not app-owned ephemeral transmux media.");
  }
  try {
    await file.directory.removeEntry(file.name);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
  }
}

export async function replaceEphemeralOpfsFile(
  current: EphemeralOpfsFile | null,
  directory: FileSystemDirectoryHandle,
): Promise<EphemeralOpfsFile> {
  await removeEphemeralOpfsFile(current);
  return createEphemeralOpfsFile(directory);
}

export async function removeStaleEphemeralOpfsFiles(
  directory: FileSystemDirectoryHandle,
  options: { olderThanMs?: number; now?: number } = {},
): Promise<string[]> {
  const removed: string[] = [];
  const entries = directory as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name] of entries) {
    if (!isEphemeralOpfsName(name)) continue;
    if (options.olderThanMs !== undefined) {
      const file = await (await directory.getFileHandle(name)).getFile();
      if ((options.now ?? Date.now()) - file.lastModified < options.olderThanMs) continue;
    }
    await removeEphemeralOpfsFile({
      directory,
      handle: await directory.getFileHandle(name),
      name,
    });
    removed.push(name);
  }
  return removed;
}

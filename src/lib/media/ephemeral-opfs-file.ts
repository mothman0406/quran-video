export const EPHEMERAL_TRANSMUX_PREFIX = "quran-video-transmux-";

export type EphemeralOpfsFile = {
  directory: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
  name: string;
};

function createName() {
  const id = globalThis.crypto.randomUUID();
  return `${EPHEMERAL_TRANSMUX_PREFIX}${id}.mp4`;
}

export async function createEphemeralOpfsFile(
  directory: FileSystemDirectoryHandle,
): Promise<EphemeralOpfsFile> {
  const name = createName();
  const handle = await directory.getFileHandle(name, { create: true });
  return { directory, handle, name };
}

export async function removeEphemeralOpfsFile(file: EphemeralOpfsFile | null): Promise<void> {
  if (!file) return;
  if (!file.name.startsWith(EPHEMERAL_TRANSMUX_PREFIX)) {
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
): Promise<string[]> {
  const removed: string[] = [];
  const entries = directory as unknown as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [name] of entries) {
    if (!name.startsWith(EPHEMERAL_TRANSMUX_PREFIX)) continue;
    await removeEphemeralOpfsFile({
      directory,
      handle: await directory.getFileHandle(name),
      name,
    });
    removed.push(name);
  }
  return removed;
}

export type RecognitionAudioPreparationState =
  | "inspecting"
  | "preparing-audio"
  | "compatibility-fallback"
  | "ready"
  | "failed";

export type RecognitionAudioPreparationRoute = "webcodecs" | "ffmpeg";

export type RecognitionAudioPreparationResult<T> = {
  value: T;
  route: RecognitionAudioPreparationRoute;
  fallbackUsed: boolean;
};

type RouterOptions<T> = {
  preferredSupported: boolean;
  preparePreferred(signal?: AbortSignal): Promise<T>;
  prepareFallback(signal?: AbortSignal): Promise<T>;
  signal?: AbortSignal;
  onState?(state: RecognitionAudioPreparationState): void;
};

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Executes a capability decision once. A supported preferred path gets one
 * attempt, then a single compatibility attempt; an unsupported preferred path
 * goes directly to that same compatibility attempt. No path can cycle.
 */
export async function runDeterministicRecognitionAudioRouter<T>(
  options: RouterOptions<T>,
): Promise<RecognitionAudioPreparationResult<T>> {
  const { signal, onState } = options;
  if (signal?.aborted) throw new DOMException("Media preparation cancelled.", "AbortError");

  if (options.preferredSupported) {
    onState?.("preparing-audio");
    try {
      const value = await options.preparePreferred(signal);
      onState?.("ready");
      return { value, route: "webcodecs", fallbackUsed: false };
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw error;
    }
  }

  onState?.("compatibility-fallback");
  try {
    const value = await options.prepareFallback(signal);
    onState?.("ready");
    return { value, route: "ffmpeg", fallbackUsed: true };
  } catch (error) {
    onState?.("failed");
    throw error;
  }
}

export class MediaPreparationTimeoutError extends Error {
  readonly operation: string;

  constructor(operation: string) {
    super(`${operation} stopped responding.`);
    this.name = "MediaPreparationTimeoutError";
    this.operation = operation;
  }
}

/** A bounded wait used at browser/library boundaries that may otherwise never settle. */
export async function withMediaPreparationTimeout<T>(
  operation: string,
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort(new MediaPreparationTimeoutError(operation));
          reject(new MediaPreparationTimeoutError(operation));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

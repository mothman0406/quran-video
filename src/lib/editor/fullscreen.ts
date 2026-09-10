export type FullscreenTarget = {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

export type FullscreenDocument = {
  fullscreenEnabled?: boolean;
  webkitFullscreenEnabled?: boolean;
  fullscreenElement?: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void> | void;
  webkitExitFullscreen?: () => Promise<void> | void;
};

const activeFullscreenElement = (documentLike: FullscreenDocument): Element | null =>
  documentLike.fullscreenElement ?? documentLike.webkitFullscreenElement ?? null;

/**
 * Keeps fullscreen scoped to the composed preview. It deliberately never
 * falls back to a media-element fullscreen API: captions are siblings of the
 * media element and must remain in the fullscreen subtree.
 */
export function isComposedPreviewFullscreen(target: Element | null, documentLike: FullscreenDocument): boolean {
  return target !== null && activeFullscreenElement(documentLike) === target;
}

/**
 * Checks the actual composed-preview container, not the raw media element.
 * `undefined` capability flags are treated as legacy-browser unknowns: the
 * callable prefixed API is the authoritative signal in that case.
 */
export function canFullscreenComposedPreview(target: FullscreenTarget | null, documentLike: FullscreenDocument | null): boolean {
  if (!target || !documentLike) return false;

  const standardSupported = typeof target.requestFullscreen === "function" && documentLike.fullscreenEnabled !== false;
  const webkitSupported = typeof target.webkitRequestFullscreen === "function" && documentLike.webkitFullscreenEnabled !== false;
  return standardSupported || webkitSupported;
}

export async function toggleComposedPreviewFullscreen(target: FullscreenTarget & Element, documentLike: FullscreenDocument): Promise<"entered" | "exited" | "unsupported"> {
  if (isComposedPreviewFullscreen(target, documentLike)) {
    const exit = documentLike.exitFullscreen ?? documentLike.webkitExitFullscreen;
    if (!exit) return "unsupported";
    await exit.call(documentLike);
    return "exited";
  }

  const request = typeof target.requestFullscreen === "function" && documentLike.fullscreenEnabled !== false
    ? target.requestFullscreen
    : typeof target.webkitRequestFullscreen === "function" && documentLike.webkitFullscreenEnabled !== false
      ? target.webkitRequestFullscreen
      : undefined;
  if (!request) return "unsupported";
  await request.call(target);
  return "entered";
}

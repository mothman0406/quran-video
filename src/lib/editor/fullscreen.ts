type FullscreenTarget = {
  requestFullscreen?: () => Promise<void> | void;
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = {
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

export async function toggleComposedPreviewFullscreen(target: FullscreenTarget & Element, documentLike: FullscreenDocument): Promise<"entered" | "exited" | "unsupported"> {
  if (isComposedPreviewFullscreen(target, documentLike)) {
    const exit = documentLike.exitFullscreen ?? documentLike.webkitExitFullscreen;
    if (!exit) return "unsupported";
    await exit.call(documentLike);
    return "exited";
  }

  const request = target.requestFullscreen ?? target.webkitRequestFullscreen;
  if (!request) return "unsupported";
  await request.call(target);
  return "entered";
}

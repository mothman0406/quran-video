/** A playhead scrub exists only for the pointer that started it. */
export type TimelineScrubSession = Readonly<{ pointerId: number }>;

/** Only a primary-pointer press may begin a playhead scrub. */
export function beginTimelineScrub(pointerId: number, button: number): TimelineScrubSession | null {
  return button === 0 ? { pointerId } : null;
}

/**
 * Pointer movement is meaningful only while its initiating primary button is
 * still held. This is defensive cleanup; pointerup/cancel remain authoritative.
 */
export function isActiveTimelineScrubMove(
  session: TimelineScrubSession | null,
  pointerId: number,
  buttons: number,
): boolean {
  return session?.pointerId === pointerId && (buttons & 1) === 1;
}

/** A pointer-specific exit cannot end another pointer's scrub session. */
export function endTimelineScrub(
  session: TimelineScrubSession | null,
  pointerId?: number,
): TimelineScrubSession | null {
  if (!session || pointerId === undefined || session.pointerId === pointerId) return null;
  return session;
}

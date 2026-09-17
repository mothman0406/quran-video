const DEFAULT_TIMELINE_TOLERANCE_SECONDS = 0.05;
const ZERO_START_TOLERANCE_SECONDS = 1e-9;

export function isTransmuxDurationAccepted(
  browserDuration: number,
  packetTimelineDuration: number,
  toleranceSeconds = DEFAULT_TIMELINE_TOLERANCE_SECONDS,
) {
  return Number.isFinite(browserDuration)
    && Number.isFinite(packetTimelineDuration)
    && Math.abs(browserDuration - packetTimelineDuration) <= toleranceSeconds;
}

export function editListStartsAtPresentationZero(
  rawFirstTimestamp: number,
  editMediaTime: number,
) {
  return Math.abs(rawFirstTimestamp + editMediaTime) <= ZERO_START_TOLERANCE_SECONDS;
}

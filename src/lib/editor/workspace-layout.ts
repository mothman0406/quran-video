/**
 * Editor workspace dimensions are browser-local presentation state. They are
 * deliberately separate from the persisted Quran project and editor history.
 */
export const WORKSPACE_LAYOUT_DEFAULTS = {
  leftPanelWidth: 238,
  rightPanelWidth: 286,
  timelineHeight: 300,
  collapsedRailWidth: 40,
  panelDividerWidth: 10,
  minimumCenterWidth: 440,
  leftPanel: { min: 220, max: 500 },
  rightPanel: { min: 280, max: 600 },
  timeline: { min: 180, minimumPreviewHeight: 150 },
} as const;

export type WorkspacePanel = "left" | "right";

export function clampWorkspacePanelWidth(
  panel: WorkspacePanel,
  requestedWidth: number,
  viewportWidth: number,
  oppositePanelWidth: number,
  oppositePanelCollapsed: boolean,
): number {
  const limits = panel === "left" ? WORKSPACE_LAYOUT_DEFAULTS.leftPanel : WORKSPACE_LAYOUT_DEFAULTS.rightPanel;
  const oppositeWidth = oppositePanelCollapsed
    ? WORKSPACE_LAYOUT_DEFAULTS.collapsedRailWidth
    : Math.max(0, oppositePanelWidth);
  const availableWidth = Math.max(
    limits.min,
    Math.floor(viewportWidth) - WORKSPACE_LAYOUT_DEFAULTS.minimumCenterWidth - oppositeWidth,
  );
  const maximum = Math.min(limits.max, availableWidth);
  const safeRequested = Number.isFinite(requestedWidth) ? Math.round(requestedWidth) : limits.min;
  return Math.max(limits.min, Math.min(maximum, safeRequested));
}

export function clampWorkspaceTimelineHeight(requestedHeight: number, viewportHeight: number): number {
  const maximum = Math.max(
    WORKSPACE_LAYOUT_DEFAULTS.timeline.min,
    Math.floor(viewportHeight) - WORKSPACE_LAYOUT_DEFAULTS.timeline.minimumPreviewHeight,
  );
  const safeRequested = Number.isFinite(requestedHeight) ? Math.round(requestedHeight) : WORKSPACE_LAYOUT_DEFAULTS.timeline.min;
  return Math.max(WORKSPACE_LAYOUT_DEFAULTS.timeline.min, Math.min(maximum, safeRequested));
}

/** A center-only timeline has exactly this horizontal span, regardless of side panel sizes. */
export function workspaceCenterRect(
  viewportWidth: number,
  leftPanelWidth: number,
  rightPanelWidth: number,
  leftCollapsed: boolean,
  rightCollapsed: boolean,
): { left: number; width: number; right: number } {
  const left = leftCollapsed ? WORKSPACE_LAYOUT_DEFAULTS.collapsedRailWidth : leftPanelWidth;
  const right = rightCollapsed ? WORKSPACE_LAYOUT_DEFAULTS.collapsedRailWidth : rightPanelWidth;
  const leftDivider = leftCollapsed ? 0 : WORKSPACE_LAYOUT_DEFAULTS.panelDividerWidth;
  const rightDivider = rightCollapsed ? 0 : WORKSPACE_LAYOUT_DEFAULTS.panelDividerWidth;
  const timelineLeft = left + leftDivider;
  const width = Math.max(0, Math.floor(viewportWidth) - left - right - leftDivider - rightDivider);
  return { left: timelineLeft, width, right: timelineLeft + width };
}

/**
 * A deliberately small development-only marker for support traces. Keep this
 * independent of runtime git access so it describes the code bundled into the
 * browser, and do not expose repository metadata in production.
 */
export const DEV_BUILD_VERSION = process.env.NODE_ENV === "production"
  ? null
  : "5d2706d+editor-timing-flow";

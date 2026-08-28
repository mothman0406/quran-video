import { SAFE_AREA_OVERLAY_METADATA, safeAreaGuidesForFormat } from "@/lib/editor/formats";
import type { ProjectFormat } from "@/lib/schemas/project";

type SafeAreaOverlayProps = { format: ProjectFormat };

export default function SafeAreaOverlay({ format }: SafeAreaOverlayProps) {
  return <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
    data-editor-only={String(SAFE_AREA_OVERLAY_METADATA.editorOnly)}
    data-export={String(SAFE_AREA_OVERLAY_METADATA.exportable)}
    data-safe-area-overlay
  >
    {safeAreaGuidesForFormat(format).map((guide) => guide.kind === "region" ? <div
      key={guide.id}
      className={`absolute border border-dashed ${guide.tone === "avoid" ? "border-[#f7a27b]/75" : "border-[#f7d88b]/80"}`}
      style={{ left: `${guide.left * 100}%`, top: `${guide.top * 100}%`, right: `${guide.right * 100}%`, bottom: `${guide.bottom * 100}%` }}
    >
      <span className="absolute left-2 top-2 rounded bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.16em] text-[#f7d88b]">{guide.label}</span>
    </div> : <div
      key={guide.id}
      className={`absolute ${guide.axis === "vertical" ? "inset-y-0 left-1/2 w-px -translate-x-1/2" : "inset-x-0 top-1/2 h-px -translate-y-1/2"} bg-[#f7d88b]/65`}
    />)}
  </div>;
}

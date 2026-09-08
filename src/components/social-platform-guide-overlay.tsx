import { socialPlatformGuide, type SocialPlatformId } from "@/lib/editor/social-platform-guides";

type SocialPlatformGuideOverlayProps = { platform: SocialPlatformId };

/** Canvas-registered editor chrome. It is deliberately not used by export. */
export default function SocialPlatformGuideOverlay({ platform }: SocialPlatformGuideOverlayProps) {
  const guide = socialPlatformGuide(platform);
  if (!guide) return null;
  return <div className="social-platform-guide-overlay pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true" data-editor-only="true" data-export="false" data-social-platform-guide={guide.id}>
    {guide.obstructionZones.map((zone) => <div key={zone.id} className="social-platform-obstruction" data-platform-obstruction={zone.id} style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.width * 100}%`, height: `${zone.height * 100}%` }}>
      <span>{zone.label}</span>
    </div>)}
    <div className="social-platform-safe-area" data-platform-safe-area style={{ left: `${guide.safeArea.x * 100}%`, top: `${guide.safeArea.y * 100}%`, width: `${guide.safeArea.width * 100}%`, height: `${guide.safeArea.height * 100}%` }}>
      <span>Safe content area</span>
    </div>
  </div>;
}

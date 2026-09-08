import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SOCIAL_PLATFORM_PREVIEW,
  SOCIAL_PLATFORM_GUIDES,
  moveRectToSafeArea,
  platformCaptionCollisions,
  scaleNormalizedRect,
  socialPlatformGuide,
  type CaptionCanvasBounds,
} from "../src/lib/editor/social-platform-guides.ts";

test("platform preview defaults to None and each platform has normalized canvas geometry", () => {
  assert.equal(DEFAULT_SOCIAL_PLATFORM_PREVIEW, "none");
  assert.equal(socialPlatformGuide("none"), null);
  for (const guide of Object.values(SOCIAL_PLATFORM_GUIDES)) {
    assert.equal(guide.recommendedAspectRatio, 9 / 16);
    assert.ok(guide.obstructionZones.length >= 4);
    for (const rect of [...guide.obstructionZones, guide.safeArea]) {
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0);
      assert.ok(rect.x + rect.width <= 1 && rect.y + rect.height <= 1);
    }
  }
});

test("normalized platform geometry remains registered as the preview canvas scales", () => {
  const zone = SOCIAL_PLATFORM_GUIDES.tiktok.obstructionZones[1]!;
  assert.deepEqual(scaleNormalizedRect(zone, 360, 640), { x: zone.x * 360, y: zone.y * 640, width: zone.width * 360, height: zone.height * 640 });
  assert.deepEqual(scaleNormalizedRect(zone, 720, 1280), { x: zone.x * 720, y: zone.y * 1280, width: zone.width * 720, height: zone.height * 1280 });
});

test("Arabic and translation collisions use their actual canvas rectangles", () => {
  const bounds: CaptionCanvasBounds[] = [
    { segmentId: "active", kind: "arabic", linked: true, x: 0.82, y: 0.4, width: 0.1, height: 0.08 },
    { segmentId: "active", kind: "translation", linked: true, x: 0.2, y: 0.72, width: 0.4, height: 0.08 },
    { segmentId: "safe", kind: "arabic", linked: false, x: 0.3, y: 0.3, width: 0.2, height: 0.08 },
  ];
  const collisions = platformCaptionCollisions("instagram-reels", bounds);
  assert.ok(collisions.some((collision) => collision.kind === "arabic" && collision.obstructionId === "actions"));
  assert.ok(collisions.some((collision) => collision.kind === "translation" && collision.obstructionId === "profile-caption"));
  assert.equal(collisions.some((collision) => collision.segmentId === "safe"), false);
});

test("move to safe area makes the smallest bounded placement adjustment", () => {
  const safeArea = SOCIAL_PLATFORM_GUIDES.tiktok.safeArea;
  const before = { x: 0.2, y: 0.77, width: 0.3, height: 0.1 };
  const movement = moveRectToSafeArea(before, safeArea);
  const after = { ...before, x: before.x + movement.dx, y: before.y + movement.dy };
  assert.equal(after.x, before.x);
  assert.ok(after.y >= safeArea.y && after.y + after.height <= safeArea.y + safeArea.height);
  assert.ok(after.x >= 0 && after.y >= 0 && after.x + after.width <= 1 && after.y + after.height <= 1);
});

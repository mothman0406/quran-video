import type { TikTokCreatorInfo, TikTokPostInitialization, TikTokPublishStatus } from "./types";

/** Deterministic test double. It is intentionally never selected by production routes. */
export class MockTikTokService {
  private statusIndex = 0;
  readonly creator: TikTokCreatorInfo = { username: "test_creator", nickname: "TikTok Test Creator", avatarUrl: null, privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"], commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxVideoPostDurationSeconds: 600 };
  initialize(): TikTokPostInitialization { return { publishId: "mock-publish-1", uploadUrl: "https://upload.example.test/tiktok/mock-publish-1" }; }
  nextStatus(): TikTokPublishStatus {
    const states: TikTokPublishStatus[] = [
      { status: "PROCESSING_UPLOAD", uploadedBytes: 5_000_000, failureReason: null, publiclyAvailablePostIds: [] },
      { status: "PUBLISH_COMPLETE", uploadedBytes: 10_000_000, failureReason: null, publiclyAvailablePostIds: ["123"] },
    ];
    return states[Math.min(this.statusIndex++, states.length - 1)]!;
  }
}

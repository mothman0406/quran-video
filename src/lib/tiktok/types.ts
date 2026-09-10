export type TikTokCreatorInfo = {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  privacyLevelOptions: TikTokPrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSeconds: number;
};

export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY";

export type TikTokMediaDescriptor = {
  mimeType: string;
  fileSizeBytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  fps: number;
  videoCodec: "avc" | "hevc" | "vp8" | "vp9" | null;
};

export type TikTokUploadPlan = {
  chunkSize: number;
  totalChunkCount: number;
};

export type TikTokPostInitialization = {
  publishId: string;
  uploadUrl: string;
};

export type TikTokPublishStatus = {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED" | "UNKNOWN";
  uploadedBytes: number | null;
  failureReason: string | null;
  publiclyAvailablePostIds: string[];
};

export type TikTokConnectionState = {
  configured: boolean;
  connected: boolean;
  directPostAudited: boolean;
};

export type TikTokInitRequest = {
  title: string;
  privacyLevel: TikTokPrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  brandContentToggle: boolean;
  brandOrganicToggle: boolean;
  userConsent: boolean;
  media: TikTokMediaDescriptor;
  upload: TikTokUploadPlan;
};

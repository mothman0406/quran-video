export type OutputProfile = {
  container: "mp4" | "webm";
  videoCodec: "avc" | "vp9";
  audioCodec: "aac" | "opus" | null;
  extension: ".mp4" | ".webm";
  mimeType: string;
  videoBitrate: number;
  audioBitrate: number;
};

export function sourceAudioRequiresOutput(sourceHasAudio: boolean): boolean { return sourceHasAudio; }

export function selectOutputProfile(capabilities: { canEncodeAvc: boolean; canEncodeAac: boolean; canEncodeVp9: boolean; canEncodeOpus: boolean }, sourceHasAudio: boolean, bitrates = { videoBitrate: 8_000_000, audioBitrate: 160_000 }): OutputProfile | null {
  if (capabilities.canEncodeAvc && (!sourceHasAudio || capabilities.canEncodeAac)) {
    return { ...bitrates, container: "mp4", videoCodec: "avc", audioCodec: sourceHasAudio ? "aac" : null, extension: ".mp4", mimeType: sourceHasAudio ? "video/mp4;codecs=avc1,mp4a.40.2" : "video/mp4;codecs=avc1" };
  }
  if (capabilities.canEncodeVp9 && (!sourceHasAudio || capabilities.canEncodeOpus)) {
    return { ...bitrates, container: "webm", videoCodec: "vp9", audioCodec: sourceHasAudio ? "opus" : null, extension: ".webm", mimeType: sourceHasAudio ? "video/webm;codecs=vp9,opus" : "video/webm;codecs=vp9" };
  }
  return null;
}

export function audioOutputIsValid(sourceHasAudio: boolean, outputHasAudio: boolean): boolean {
  return !sourceAudioRequiresOutput(sourceHasAudio) || outputHasAudio;
}

export type ThreeWayAction = "take-remote" | "publish-local" | "unchanged" | "kept-local" | "conflict" | "unmanaged";

export interface ThreeWaySkill {
  id: string;
  baseSha256: string | null;
  localSha256: string | null;
  remoteSha256: string;
  action: ThreeWayAction;
}

/** Pure three-way classification. It never chooses an overwrite for unknown local state. */
export function classifyThreeWaySkill(
  id: string,
  baseSha256: string | null,
  localSha256: string | null,
  remoteSha256: string,
  keptRemoteSha256?: string | null,
): ThreeWaySkill {
  if (keptRemoteSha256 && localSha256 !== null && localSha256 !== remoteSha256) {
    return {
      id,
      baseSha256,
      localSha256,
      remoteSha256,
      action: keptRemoteSha256 === remoteSha256 ? "kept-local" : "conflict",
    };
  }
  if (baseSha256 === null) {
    const action: ThreeWayAction =
      localSha256 === null ? "take-remote" : localSha256 === remoteSha256 ? "unchanged" : "unmanaged";
    return { id, baseSha256, localSha256, remoteSha256, action };
  }
  const localChanged = localSha256 !== baseSha256;
  const remoteChanged = remoteSha256 !== baseSha256;
  let action: ThreeWayAction;
  if (!localChanged && !remoteChanged) action = "unchanged";
  else if (!localChanged && remoteChanged) action = "take-remote";
  else if (localChanged && !remoteChanged) action = "publish-local";
  else if (localSha256 === remoteSha256) action = "unchanged";
  else action = "conflict";
  return { id, baseSha256, localSha256, remoteSha256, action };
}

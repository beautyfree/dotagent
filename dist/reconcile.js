/** Pure three-way classification. It never chooses an overwrite for unknown local state. */
export function classifyThreeWaySkill(id, baseSha256, localSha256, remoteSha256, keptRemoteSha256) {
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
        const action = localSha256 === null ? "take-remote" : localSha256 === remoteSha256 ? "unchanged" : "unmanaged";
        return { id, baseSha256, localSha256, remoteSha256, action };
    }
    const localChanged = localSha256 !== baseSha256;
    const remoteChanged = remoteSha256 !== baseSha256;
    let action;
    if (!localChanged && !remoteChanged)
        action = "unchanged";
    else if (!localChanged && remoteChanged)
        action = "take-remote";
    else if (localChanged && !remoteChanged)
        action = "publish-local";
    else if (localSha256 === remoteSha256)
        action = "unchanged";
    else
        action = "conflict";
    return { id, baseSha256, localSha256, remoteSha256, action };
}
//# sourceMappingURL=reconcile.js.map
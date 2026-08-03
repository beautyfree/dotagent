export type ThreeWayAction = "take-remote" | "publish-local" | "unchanged" | "kept-local" | "conflict" | "unmanaged";
export interface ThreeWaySkill {
    id: string;
    baseSha256: string | null;
    localSha256: string | null;
    remoteSha256: string;
    action: ThreeWayAction;
}
/** Pure three-way classification. It never chooses an overwrite for unknown local state. */
export declare function classifyThreeWaySkill(id: string, baseSha256: string | null, localSha256: string | null, remoteSha256: string, keptRemoteSha256?: string | null): ThreeWaySkill;
//# sourceMappingURL=reconcile.d.ts.map
import { lstat, readlink } from "node:fs/promises";
import path from "node:path";
import { scanOwnedSkill } from "./inventory.js";
import { readMaterializationState } from "./materialize-apply.js";
async function pathKind(filePath) {
    try {
        const metadata = await lstat(filePath);
        if (metadata.isSymbolicLink())
            return "link";
        if (metadata.isDirectory())
            return "directory";
        return "other";
    }
    catch (error) {
        if (error.code === "ENOENT")
            return "missing";
        throw error;
    }
}
/** Reads only dotagent-owned ledger entries; unmanaged filesystem targets are discovered by machine planning. */
export async function getMaterializationStatus(libraryRoot) {
    const root = path.resolve(libraryRoot);
    const state = await readMaterializationState(root);
    const targets = [];
    const byAgent = {};
    for (const [target, managed] of Object.entries(state.targets).sort(([left], [right]) => left.localeCompare(right, "en"))) {
        const kind = await pathKind(target);
        let health;
        let currentIntegrity = null;
        let existing;
        if (kind === "missing") {
            health = "missing";
            existing = { state: "absent" };
        }
        else if (managed.mode === "copy" && kind === "directory") {
            const scanned = await scanOwnedSkill(path.dirname(target), path.basename(target));
            if (!scanned.ok) {
                health = "invalid";
                existing = { state: "unmanaged" };
            }
            else {
                currentIntegrity = scanned.value.integrity;
                health = currentIntegrity === managed.sourceIntegrity ? "current" : "locally-modified";
                existing = { state: "managed-copy", integrity: currentIntegrity, baseIntegrity: managed.sourceIntegrity };
            }
        }
        else if ((managed.mode === "symlink" || managed.mode === "junction") && kind === "link") {
            const actual = path.resolve(path.dirname(target), await readlink(target));
            health = actual === path.resolve(managed.source) ? "current" : "link-changed";
            existing = { state: "managed-link", source: actual };
        }
        else {
            health = "invalid";
            existing = { state: "unmanaged" };
        }
        (byAgent[managed.agent] ??= {})[managed.skill] = existing;
        targets.push({ target, agent: managed.agent, skill: managed.skill, mode: managed.mode, health, source: managed.source, sourceIntegrity: managed.sourceIntegrity, currentIntegrity });
    }
    return { library: root, targets, byAgent };
}
//# sourceMappingURL=status.js.map
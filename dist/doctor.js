import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseLocalConfig, parsePortableConfig } from "./config.js";
import { scanLibrary } from "./inventory.js";
import { loadLibrary } from "./library.js";
import { scanMachineAgents } from "./machine.js";
import { normalizeGitIdentity } from "./sources.js";
async function readOptional(filePath) {
    try {
        return await readFile(filePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
function issue(code, severity, message, remediation, filePath) {
    return { code, severity, message, remediation, ...(filePath ? { path: filePath } : {}) };
}
function inspectLock(loaded) {
    const issues = [];
    const dependencies = loaded.manifest.dependencies;
    if (Object.keys(dependencies).length > 0 && !loaded.lock) {
        issues.push(issue("lockfile-missing", "warning", "Dependencies are not pinned by skills.lock.", "Run beautyfree-dotagent resolve, review the plan, then rerun with --write."));
        return issues;
    }
    if (!loaded.lock)
        return issues;
    for (const [name, dependency] of Object.entries(dependencies)) {
        const resolved = loaded.lock.resolved[name];
        if (!resolved) {
            issues.push(issue("lockfile-stale", "error", `Dependency ${name} is missing from skills.lock.`, "Resolve dependencies again and review the lockfile change."));
            continue;
        }
        let sameSource = false;
        try {
            sameSource = normalizeGitIdentity(resolved.url) === normalizeGitIdentity(dependency.url);
        }
        catch {
            // The manifest/lock parser already reports invalid URL shapes elsewhere.
        }
        const selectedPaths = dependency.select ? [...dependency.select].sort() : null;
        const lockedPaths = resolved.skills.map((skill) => skill.path).sort();
        const sameSelection = selectedPaths === null || JSON.stringify(selectedPaths) === JSON.stringify(lockedPaths);
        if (!sameSource || resolved.requested_ref !== dependency.ref || !sameSelection) {
            issues.push(issue("lockfile-stale", "error", `Dependency ${name} no longer matches its locked source, ref, or selected skill paths.`, "Resolve dependencies again; do not materialize the stale lock."));
        }
    }
    for (const name of Object.keys(loaded.lock.resolved)) {
        if (!(name in dependencies))
            issues.push(issue("lockfile-stale", "warning", `skills.lock still contains removed dependency ${name}.`, "Resolve dependencies again to remove the stale lock entry."));
    }
    return issues;
}
async function inspectConfiguration(root) {
    const issues = [];
    const portablePath = path.join(root, "dotagent.yaml");
    const localPath = path.join(root, "dotagent.local.yaml");
    const portable = await readOptional(portablePath);
    const local = await readOptional(localPath);
    if (portable !== null) {
        try {
            parsePortableConfig(portable);
        }
        catch (error) {
            issues.push(issue("invalid-config", "error", error instanceof Error ? error.message : "Invalid dotagent.yaml", "Fix the portable configuration before syncing.", portablePath));
        }
    }
    if (local !== null) {
        try {
            parseLocalConfig(local);
        }
        catch (error) {
            issues.push(issue("invalid-config", "error", error instanceof Error ? error.message : "Invalid dotagent.local.yaml", "Keep only machine-local paths and environment references in the local configuration.", localPath));
        }
    }
    const gitignorePath = path.join(root, ".gitignore");
    const gitignore = await readOptional(gitignorePath);
    const lines = new Set((gitignore ?? "").split(/\r?\n/).map((line) => line.trim().replace(/^\//, "")));
    if (!lines.has("dotagent.local.yaml") || !lines.has(".dotagent/")) {
        issues.push(issue("local-state-not-ignored", "error", "Machine-local dotagent state is not fully ignored by Git.", "Add dotagent.local.yaml and .dotagent/ to the repository .gitignore before publishing.", gitignorePath));
    }
    return issues;
}
/** Read-only health report suitable for both CLI JSON and Skiller tRPC mapping. */
export async function doctorLibrary(options) {
    const root = path.resolve(options.root);
    const issues = [];
    const scanned = await scanLibrary(root);
    const library = scanned.ok ? scanned.value : null;
    if (!scanned.ok)
        issues.push(...scanned.issues.map((entry) => ({ ...entry, severity: entry.severity ?? "error" })));
    const loaded = await loadLibrary(root);
    if (loaded.ok)
        issues.push(...inspectLock(loaded.value));
    if (loaded.ok)
        issues.push(...(await inspectConfiguration(root)));
    let machine = null;
    if (options.descriptors && options.platform && options.home) {
        machine = await scanMachineAgents(options.descriptors, {
            platform: options.platform,
            home: options.home,
            ...(options.machinePort ? { port: options.machinePort } : {}),
        });
    }
    return { ok: !issues.some((entry) => entry.severity === "error"), root, library, machine, issues };
}
//# sourceMappingURL=doctor.js.map
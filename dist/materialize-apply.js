import { lstat, mkdir, open, readFile, readlink, readdir, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { scanOwnedSkill } from "./inventory.js";
import { computePlanId } from "./plan.js";
export const MATERIALIZATION_STATE_VERSION = 1;
export const MATERIALIZATION_JOURNAL_VERSION = 1;
const COPY_MARKER = ".dotagent-managed.json";
function metadataRoot(libraryRoot) { return path.join(libraryRoot, ".dotagent"); }
function statePath(libraryRoot) { return path.join(metadataRoot(libraryRoot), "materialization-state.json"); }
function journalPath(libraryRoot) { return path.join(metadataRoot(libraryRoot), "journal.json"); }
async function exists(filePath) {
    try {
        await lstat(filePath);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
async function writeAtomic(filePath, value) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
}
export async function readMaterializationState(libraryRoot) {
    try {
        const parsed = JSON.parse(await readFile(statePath(libraryRoot), "utf8"));
        if (parsed.schemaVersion !== MATERIALIZATION_STATE_VERSION || !parsed.targets || typeof parsed.targets !== "object")
            throw new Error("Unsupported materialization state");
        return parsed;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return { schemaVersion: MATERIALIZATION_STATE_VERSION, targets: {} };
        throw error;
    }
}
async function sourceIntegrity(operation) {
    const scanned = await scanOwnedSkill(path.dirname(operation.source), path.basename(operation.source));
    if (!scanned.ok)
        throw new Error(scanned.issues.map((entry) => entry.message).join("; "));
    return scanned.value.integrity;
}
function assertSafeTarget(target) {
    const resolved = path.resolve(target);
    if (resolved === path.parse(resolved).root || path.basename(resolved) === "." || path.basename(resolved) === "..") {
        throw new Error(`Refusing broad materialization target: ${target}`);
    }
}
async function copyDirectory(source, destination) {
    await mkdir(destination, { recursive: false });
    for (const entry of await readdir(source, { withFileTypes: true })) {
        if (entry.name === COPY_MARKER || entry.name === ".git" || entry.name === "node_modules")
            continue;
        const from = path.join(source, entry.name);
        const to = path.join(destination, entry.name);
        if (entry.isSymbolicLink())
            throw new Error(`Refusing linked source during copy: ${from}`);
        if (entry.isDirectory())
            await copyDirectory(from, to);
        else if (entry.isFile()) {
            const sourceHandle = await open(from, "r");
            const targetHandle = await open(to, "wx");
            try {
                await targetHandle.writeFile(await sourceHandle.readFile());
            }
            finally {
                await sourceHandle.close();
                await targetHandle.close();
            }
        }
    }
}
function backupPath(operation, planId) {
    return `${operation.target}.dotagent-backup-${planId}`;
}
function stagePath(operation, planId) {
    return `${operation.target}.dotagent-stage-${planId}`;
}
async function writeCopyMarker(destination, planId, operation) {
    await writeFile(path.join(destination, COPY_MARKER), `${JSON.stringify({
        schemaVersion: 1,
        planId,
        agent: operation.agent,
        skill: operation.skill,
        source: operation.source,
        sourceIntegrity: operation.sourceIntegrity,
    }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}
async function markerMatches(target, planId) {
    try {
        const parsed = JSON.parse(await readFile(path.join(target, COPY_MARKER), "utf8"));
        return parsed.schemaVersion === 1 && (planId === undefined || parsed.planId === planId);
    }
    catch {
        return false;
    }
}
async function validatePrecondition(operation, state) {
    if (!operation.target)
        return;
    assertSafeTarget(operation.target);
    const present = await exists(operation.target);
    if (operation.expectedTarget.state === "absent") {
        if (present)
            throw new Error(`Target appeared after review: ${operation.target}`);
        return;
    }
    if (!present)
        throw new Error(`Target disappeared after review: ${operation.target}`);
    if (operation.expectedTarget.state === "unmanaged")
        throw new Error(`Refusing unmanaged target: ${operation.target}`);
    const managed = state.targets[path.resolve(operation.target)];
    if (!managed)
        throw new Error(`Target is not recorded as managed: ${operation.target}`);
    if (operation.expectedTarget.state === "managed-link") {
        const actual = await readlink(operation.target);
        if (path.resolve(path.dirname(operation.target), actual) !== path.resolve(operation.expectedTarget.source))
            throw new Error(`Managed link changed after review: ${operation.target}`);
    }
    else {
        const scanned = await scanOwnedSkill(path.dirname(operation.target), path.basename(operation.target));
        if (!scanned.ok || scanned.value.integrity !== operation.expectedTarget.integrity)
            throw new Error(`Managed copy changed after review: ${operation.target}`);
        if (!await markerMatches(operation.target))
            throw new Error(`Managed copy marker is missing: ${operation.target}`);
    }
}
async function applyOperation(operation, planId) {
    if (!operation.target)
        return;
    await mkdir(path.dirname(operation.target), { recursive: true });
    if (operation.action === "create-symlink" || operation.action === "create-junction") {
        await symlink(operation.source, operation.target, operation.action === "create-junction" ? "junction" : "dir");
        return;
    }
    if (operation.action === "create-copy" || operation.action === "update-copy") {
        const stage = stagePath(operation, planId);
        await rm(stage, { recursive: true, force: true });
        await copyDirectory(operation.source, stage);
        await writeCopyMarker(stage, planId, operation);
        if (operation.action === "update-copy")
            await rename(operation.target, backupPath(operation, planId));
        await rename(stage, operation.target);
    }
}
async function rollbackJournal(libraryRoot, journal) {
    journal.phase = "rolling-back";
    await writeAtomic(journalPath(libraryRoot), journal);
    for (const entry of [...journal.operations].reverse()) {
        const operation = entry.operation;
        if (!operation.target)
            continue;
        const backup = backupPath(operation, journal.planId);
        const stage = stagePath(operation, journal.planId);
        await rm(stage, { recursive: true, force: true });
        if (operation.action === "create-symlink" || operation.action === "create-junction") {
            try {
                const actual = await readlink(operation.target);
                if (path.resolve(path.dirname(operation.target), actual) === path.resolve(operation.source))
                    await unlink(operation.target);
            }
            catch { /* Target was not created or is no longer our link. */ }
        }
        else if (operation.action === "create-copy") {
            if (await markerMatches(operation.target, journal.planId))
                await rm(operation.target, { recursive: true, force: true });
        }
        else if (operation.action === "update-copy") {
            if (await markerMatches(operation.target, journal.planId))
                await rm(operation.target, { recursive: true, force: true });
            if (await exists(backup) && !await exists(operation.target))
                await rename(backup, operation.target);
        }
    }
    await writeAtomic(statePath(libraryRoot), journal.previousState);
    await rm(journalPath(libraryRoot), { force: true });
}
export async function recoverMaterialization(libraryRoot) {
    try {
        const parsed = JSON.parse(await readFile(journalPath(libraryRoot), "utf8"));
        if (parsed.schemaVersion !== MATERIALIZATION_JOURNAL_VERSION || !Array.isArray(parsed.operations))
            throw new Error("Unsupported materialization journal");
        await rollbackJournal(libraryRoot, parsed);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
export async function applyMaterializationPlan(plan, options = {}) {
    const { planId, ...payload } = plan;
    if (computePlanId(payload) !== planId)
        throw new Error("Materialization plan is stale or modified");
    if (plan.hasConflicts || plan.operations.some((operation) => operation.action === "conflict"))
        throw new Error("Materialization plan contains conflicts");
    if (await exists(journalPath(plan.library)))
        throw new Error("An unfinished materialization journal requires recovery first");
    const state = await readMaterializationState(plan.library);
    const mutations = plan.operations.filter((operation) => ["create-symlink", "create-junction", "create-copy", "update-copy"].includes(operation.action));
    for (const operation of mutations) {
        if (await sourceIntegrity(operation) !== operation.sourceIntegrity)
            throw new Error(`Source changed after review: ${operation.skill}`);
        await validatePrecondition(operation, state);
    }
    const journal = {
        schemaVersion: MATERIALIZATION_JOURNAL_VERSION,
        planId,
        phase: "applying",
        previousState: structuredClone(state),
        operations: mutations.map((operation) => ({ operation, status: "pending" })),
    };
    await writeAtomic(journalPath(plan.library), journal);
    try {
        for (const [index, entry] of journal.operations.entries()) {
            await options.beforeOperation?.(entry.operation, index);
            await applyOperation(entry.operation, planId);
            entry.status = "applied";
            await writeAtomic(journalPath(plan.library), journal);
            if (entry.operation.target) {
                state.targets[path.resolve(entry.operation.target)] = {
                    agent: entry.operation.agent,
                    skill: entry.operation.skill,
                    mode: entry.operation.action === "create-symlink" ? "symlink" : entry.operation.action === "create-junction" ? "junction" : "copy",
                    source: entry.operation.source,
                    sourceIntegrity: entry.operation.sourceIntegrity,
                };
            }
        }
        await writeAtomic(statePath(plan.library), state);
        for (const entry of journal.operations) {
            if (entry.operation.target) {
                await rm(backupPath(entry.operation, planId), { recursive: true, force: true });
                await rm(stagePath(entry.operation, planId), { recursive: true, force: true });
            }
        }
        await rm(journalPath(plan.library), { force: true });
        return { planId, applied: mutations.length, unchanged: plan.operations.length - mutations.length };
    }
    catch (error) {
        await rollbackJournal(plan.library, journal);
        throw error;
    }
}
//# sourceMappingURL=materialize-apply.js.map
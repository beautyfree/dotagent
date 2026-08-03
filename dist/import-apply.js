import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import { scanSkillForSecrets } from "./audit.js";
import { DOTAGENT_CONFIG_FILE } from "./config.js";
import { scanOwnedSkill } from "./inventory.js";
import { computePlanId } from "./plan.js";
export const IMPORT_JOURNAL_VERSION = 1;
function hashText(value) {
    return createHash("sha256").update(value).digest("hex");
}
function metadataRoot(library) {
    return path.join(library, ".dotagent");
}
function journalPath(library) {
    return path.join(metadataRoot(library), "import-journal.json");
}
function stageRoot(library, planId) {
    return path.join(metadataRoot(library), "import-stage", planId);
}
function stagePath(library, planId, skill) {
    return path.join(stageRoot(library, planId), skill);
}
async function exists(value) {
    try {
        await lstat(value);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
function manifestText(plan) {
    return `${JSON.stringify(plan.nextManifest, null, 2)}\n`;
}
function configText(plan) {
    return stringify(plan.nextConfig, { lineWidth: 0 });
}
async function writeAtomic(filePath, content) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const temporary = `${filePath}.dotagent-tmp-${suffix}`;
    const backup = `${filePath}.dotagent-backup-${suffix}`;
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    const hadPrevious = await exists(filePath);
    if (hadPrevious)
        await rename(filePath, backup);
    try {
        await rename(temporary, filePath);
        if (hadPrevious)
            await rm(backup, { force: true });
    }
    catch (error) {
        await rm(temporary, { force: true });
        if (hadPrevious && (await exists(backup)) && !(await exists(filePath)))
            await rename(backup, filePath);
        throw error;
    }
}
async function writeJournal(journal) {
    await writeAtomic(journalPath(journal.library), `${JSON.stringify(journal, null, 2)}\n`);
}
async function copyDirectory(source, target) {
    await mkdir(target, { recursive: false });
    const entries = await readdir(source, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".dotagent-managed.json")
            continue;
        const from = path.join(source, entry.name);
        const to = path.join(target, entry.name);
        if (entry.isSymbolicLink())
            throw new Error(`Refusing linked import content: ${from}`);
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
async function assertOperationSource(operation) {
    if ((operation.action !== "copy-owned" && operation.action !== "copy-vendored") ||
        !operation.source ||
        !operation.sourceIntegrity)
        return;
    const scanned = await scanOwnedSkill(path.dirname(operation.source), path.basename(operation.source));
    if (!scanned.ok || scanned.value.integrity !== operation.sourceIntegrity)
        throw new Error(`Import source changed after review: ${operation.skill}`);
    if ((await scanSkillForSecrets(operation.source)).length > 0)
        throw new Error(`Import source now contains possible secrets: ${operation.skill}`);
}
async function assertCopiedIntegrity(operation, root) {
    if (!operation.sourceIntegrity)
        throw new Error(`Missing source integrity for ${operation.skill}`);
    const scanned = await scanOwnedSkill(path.dirname(root), path.basename(root));
    if (!scanned.ok || scanned.value.integrity !== operation.sourceIntegrity)
        throw new Error(`Imported content changed for ${operation.skill}`);
}
async function rollbackJournal(journal) {
    journal.phase = "rolling-back";
    await writeJournal(journal);
    const manifest = path.join(journal.library, "skills.json");
    const config = path.join(journal.library, DOTAGENT_CONFIG_FILE);
    const currentManifest = await readFile(manifest, "utf8");
    const currentConfig = await readFile(config, "utf8");
    const allowedManifest = new Set([hashText(journal.baseManifestText), hashText(journal.nextManifestText)]);
    const allowedConfig = new Set([hashText(journal.baseConfigText), hashText(journal.nextConfigText)]);
    if (!allowedManifest.has(hashText(currentManifest)) || !allowedConfig.has(hashText(currentConfig))) {
        throw new Error("Portable library files changed after the interrupted import; refusing automatic rollback");
    }
    for (const entry of [...journal.operations].reverse()) {
        if ((entry.status !== "committing" && entry.status !== "applied") ||
            (entry.operation.action !== "copy-owned" && entry.operation.action !== "copy-vendored") ||
            !entry.operation.target ||
            !(await exists(entry.operation.target)))
            continue;
        await assertCopiedIntegrity(entry.operation, entry.operation.target);
    }
    for (const entry of [...journal.operations].reverse()) {
        if ((entry.status === "committing" || entry.status === "applied") &&
            (entry.operation.action === "copy-owned" || entry.operation.action === "copy-vendored") &&
            entry.operation.target &&
            (await exists(entry.operation.target))) {
            await rm(entry.operation.target, { recursive: true, force: true });
        }
    }
    await writeAtomic(manifest, journal.baseManifestText);
    await writeAtomic(config, journal.baseConfigText);
    await rm(stageRoot(journal.library, journal.planId), { recursive: true, force: true });
    await rm(journalPath(journal.library), { force: true });
}
/** Recovers only content still byte-identical to the interrupted reviewed plan. */
export async function recoverImport(libraryRoot) {
    const library = path.resolve(libraryRoot);
    let journal;
    try {
        journal = JSON.parse(await readFile(journalPath(library), "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return "none";
        throw error;
    }
    if (journal.schemaVersion !== IMPORT_JOURNAL_VERSION || journal.library !== library)
        throw new Error("Unsupported or misplaced import journal");
    const [currentManifest, currentConfig] = await Promise.all([
        readFile(path.join(library, "skills.json"), "utf8"),
        readFile(path.join(library, DOTAGENT_CONFIG_FILE), "utf8"),
    ]);
    const complete = hashText(currentManifest) === hashText(journal.nextManifestText) &&
        hashText(currentConfig) === hashText(journal.nextConfigText) &&
        journal.operations.every((entry) => entry.operation.action !== "copy-owned" || entry.status === "applied");
    if (complete) {
        for (const entry of journal.operations) {
            if ((entry.operation.action === "copy-owned" || entry.operation.action === "copy-vendored") &&
                entry.operation.target)
                await assertCopiedIntegrity(entry.operation, entry.operation.target);
        }
        await rm(stageRoot(library, journal.planId), { recursive: true, force: true });
        await rm(journalPath(library), { force: true });
        return "completed";
    }
    await rollbackJournal(journal);
    return "rolled-back";
}
export async function applyImportPlan(plan, options = {}) {
    const { planId, ...payload } = plan;
    if (computePlanId(payload) !== planId)
        throw new Error("Import plan is stale or modified");
    if (plan.hasConflicts || plan.operations.some((operation) => operation.action === "conflict"))
        throw new Error("Import plan contains conflicts");
    if (plan.secretFindings.length > 0)
        throw new Error(`Import is blocked by ${plan.secretFindings.length} possible secret finding(s)`);
    if (await exists(journalPath(plan.library)))
        throw new Error("An unfinished import journal requires recovery first");
    const manifestPath = path.join(plan.library, "skills.json");
    const configPath = path.join(plan.library, DOTAGENT_CONFIG_FILE);
    const [baseManifestText, baseConfigText] = await Promise.all([
        readFile(manifestPath, "utf8"),
        readFile(configPath, "utf8"),
    ]);
    if (hashText(baseManifestText) !== plan.baseManifestHash || hashText(baseConfigText) !== plan.baseConfigHash) {
        throw new Error("Portable library files changed after review; rebuild the import plan");
    }
    const mutations = plan.operations.filter((operation) => operation.action === "copy-owned" || operation.action === "copy-vendored");
    for (const operation of mutations) {
        await assertOperationSource(operation);
        if (!operation.target)
            throw new Error(`Missing import target for ${operation.skill}`);
        if (await exists(operation.target))
            throw new Error(`Import target appeared after review: ${operation.target}`);
    }
    const journal = {
        schemaVersion: IMPORT_JOURNAL_VERSION,
        planId,
        library: plan.library,
        phase: "applying",
        baseManifestText,
        baseConfigText,
        nextManifestText: manifestText(plan),
        nextConfigText: configText(plan),
        operations: mutations.map((operation) => ({ operation, status: "pending" })),
    };
    await writeJournal(journal);
    try {
        for (const [index, entry] of journal.operations.entries()) {
            await options.beforeOperation?.(entry.operation, index);
            const { source, target } = entry.operation;
            if (!source || !target)
                throw new Error(`Import operation is incomplete for ${entry.operation.skill}`);
            const staged = stagePath(plan.library, planId, entry.operation.skill);
            await rm(staged, { recursive: true, force: true });
            await mkdir(path.dirname(staged), { recursive: true });
            await copyDirectory(source, staged);
            await assertCopiedIntegrity(entry.operation, staged);
            entry.status = "staged";
            await writeJournal(journal);
            await mkdir(path.dirname(target), { recursive: true });
            entry.status = "committing";
            await writeJournal(journal);
            await rename(staged, target);
            entry.status = "applied";
            await writeJournal(journal);
        }
        await writeAtomic(manifestPath, journal.nextManifestText);
        await writeAtomic(configPath, journal.nextConfigText);
        await rm(stageRoot(plan.library, planId), { recursive: true, force: true });
        await rm(journalPath(plan.library), { force: true });
        return {
            planId,
            copied: mutations.length,
            dependenciesRecorded: plan.operations.filter((operation) => operation.action === "record-dependency").length,
            unchanged: plan.operations.filter((operation) => operation.action === "unchanged").length,
            requiresResolve: plan.requiresResolve,
        };
    }
    catch (error) {
        await rollbackJournal(journal);
        throw error;
    }
}
//# sourceMappingURL=import-apply.js.map
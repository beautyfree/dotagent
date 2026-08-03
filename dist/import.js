import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { scanSkillForSecrets } from "./audit.js";
import { DOTAGENT_CONFIG_FILE, parsePortableConfig } from "./config.js";
import { declaredSkillName, scanOwnedSkill } from "./inventory.js";
import { DotagentError } from "./issues.js";
import { loadLibrary } from "./library.js";
import { computePlanId } from "./plan.js";
import { libraryManifestSchema } from "./schema.js";
import { normalizeGitIdentity } from "./sources.js";
const stableSkillName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function hashText(value) {
    return createHash("sha256").update(value).digest("hex");
}
async function pathExists(value) {
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
function assertName(value, field) {
    if (!stableSkillName.test(value))
        throw new Error(`${field} must be a lowercase kebab-case identifier: ${value}`);
}
function normalizeAgents(agents) {
    if (!agents?.length)
        return undefined;
    const normalized = [...new Set(agents)].sort((left, right) => left.localeCompare(right, "en"));
    for (const agent of normalized) {
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(agent))
            throw new Error(`Invalid agent slug: ${agent}`);
    }
    return normalized;
}
function importIssue(message, remediation, issuePath) {
    return {
        code: "invalid-manifest",
        severity: "error",
        message,
        remediation,
        ...(issuePath ? { path: issuePath } : {}),
    };
}
function mergeDependency(dependencies, candidate) {
    const existing = dependencies[candidate.package];
    const selected = candidate.skillPath === "." ? "." : candidate.skillPath.replaceAll("\\", "/");
    if (!existing) {
        dependencies[candidate.package] = { url: candidate.url, ref: candidate.ref, select: [selected] };
        return { changed: true };
    }
    let sameIdentity = false;
    try {
        sameIdentity = normalizeGitIdentity(existing.url) === normalizeGitIdentity(candidate.url);
    }
    catch {
        return { changed: false, conflict: `Dependency ${candidate.package} has an invalid existing Git identity` };
    }
    if (!sameIdentity || existing.ref !== candidate.ref) {
        return { changed: false, conflict: `Dependency ${candidate.package} already points to a different source or ref` };
    }
    if (!existing.select)
        return { changed: false };
    if (existing.select.includes(selected))
        return { changed: false };
    existing.select = [...existing.select, selected].sort((left, right) => left.localeCompare(right, "en"));
    return { changed: true };
}
/**
 * Builds the exact portable mutation from reviewed candidates. It reads and
 * hashes local sources but performs no writes, Git fetches, or script execution.
 */
export async function planImport(libraryRoot, candidates) {
    const library = path.resolve(libraryRoot);
    const loaded = await loadLibrary(library);
    if (!loaded.ok)
        throw new DotagentError("Cannot import into an invalid dotagent library", loaded.issues);
    let manifestText;
    let configText;
    try {
        [manifestText, configText] = await Promise.all([
            readFile(path.join(library, "skills.json"), "utf8"),
            readFile(path.join(library, DOTAGENT_CONFIG_FILE), "utf8"),
        ]);
    }
    catch (error) {
        throw new DotagentError("Cannot read the portable library files", [
            importIssue("The library manifest or portable config could not be read.", "Run doctor, restore skills.json and dotagent.yaml, then retry.", error instanceof Error ? error.message : undefined),
        ]);
    }
    const config = parsePortableConfig(configText);
    const nextManifest = structuredClone(loaded.value.manifest);
    const nextConfig = structuredClone(config);
    const operations = [];
    const secretFindings = [];
    const claimedNames = new Map();
    const existingOwned = new Map(nextManifest.skills.map((skillPath) => [path.posix.basename(skillPath).toLocaleLowerCase("en-US"), skillPath]));
    for (const [dependencyName, resolved] of Object.entries(loaded.value.lock?.resolved ?? {})) {
        for (const skill of resolved.skills)
            claimedNames.set(skill.name.toLocaleLowerCase("en-US"), `dependency ${dependencyName}`);
    }
    for (const [name, skillPath] of existingOwned)
        claimedNames.set(name, `owned ${skillPath}`);
    const sorted = [...candidates].sort((left, right) => left.skill.localeCompare(right.skill, "en"));
    let requiresResolve = false;
    for (const candidate of sorted) {
        assertName(candidate.skill, "Skill name");
        const folded = candidate.skill.toLocaleLowerCase("en-US");
        const alreadyClaimed = claimedNames.get(folded);
        if (candidate.kind === "local-only" || candidate.kind === "excluded") {
            operations.push({
                skill: candidate.skill,
                action: candidate.kind === "local-only" ? "leave-local" : "exclude",
                sourceKind: candidate.kind,
                ...(candidate.sourcePath ? { source: path.resolve(candidate.sourcePath) } : {}),
                reason: candidate.reason,
            });
            continue;
        }
        if (candidate.kind === "dependency") {
            assertName(candidate.package, "Dependency package name");
            if (alreadyClaimed && !alreadyClaimed.startsWith(`dependency ${candidate.package}`)) {
                operations.push({
                    skill: candidate.skill,
                    action: "conflict",
                    sourceKind: candidate.kind,
                    package: candidate.package,
                    reason: `${candidate.skill} is already provided by ${alreadyClaimed}`,
                });
                continue;
            }
            const merged = mergeDependency(nextManifest.dependencies, candidate);
            if (merged.conflict) {
                operations.push({
                    skill: candidate.skill,
                    action: "conflict",
                    sourceKind: candidate.kind,
                    package: candidate.package,
                    reason: merged.conflict,
                });
                continue;
            }
            claimedNames.set(folded, `dependency ${candidate.package}`);
            const agents = normalizeAgents(candidate.agents);
            nextConfig.skills[candidate.skill] = {
                include: true,
                distribution: "dependency",
                ...(agents ? { agents } : {}),
            };
            operations.push({
                skill: candidate.skill,
                action: merged.changed ? "record-dependency" : "unchanged",
                sourceKind: candidate.kind,
                source: candidate.url,
                package: candidate.package,
            });
            requiresResolve ||= merged.changed || !(candidate.package in (loaded.value.lock?.resolved ?? {}));
            continue;
        }
        if (candidate.kind !== "owned")
            throw new Error(`Unsupported import disposition: ${candidate.kind}`);
        const source = path.resolve(candidate.sourcePath);
        const scanned = await scanOwnedSkill(path.dirname(source), path.basename(source));
        if (!scanned.ok)
            throw new DotagentError(`Cannot import ${candidate.skill}`, scanned.issues);
        const declaredName = declaredSkillName(await readFile(path.join(source, "SKILL.md"), "utf8"));
        if (declaredName !== candidate.skill) {
            throw new DotagentError(`Cannot import ${candidate.skill}`, [
                {
                    code: "missing-skill-metadata",
                    severity: "error",
                    message: `${candidate.skill}/SKILL.md must declare name: ${candidate.skill}.`,
                    remediation: "Choose the declared skill name or update SKILL.md before importing.",
                    path: path.join(source, "SKILL.md"),
                },
            ]);
        }
        const targetPath = `skills/${candidate.skill}`;
        const target = path.join(library, "skills", candidate.skill);
        const existingPath = existingOwned.get(folded);
        if (alreadyClaimed && existingPath !== targetPath) {
            operations.push({
                skill: candidate.skill,
                action: "conflict",
                sourceKind: candidate.kind,
                source,
                sourceIntegrity: scanned.value.integrity,
                target,
                reason: `${candidate.skill} is already provided by ${alreadyClaimed}`,
            });
            continue;
        }
        const targetPresent = await pathExists(target);
        if (existingPath === targetPath && targetPresent) {
            const current = await scanOwnedSkill(library, targetPath);
            if (current.ok && current.value.integrity === scanned.value.integrity) {
                operations.push({
                    skill: candidate.skill,
                    action: "unchanged",
                    sourceKind: candidate.kind,
                    source,
                    sourceIntegrity: scanned.value.integrity,
                    target,
                });
            }
            else {
                operations.push({
                    skill: candidate.skill,
                    action: "conflict",
                    sourceKind: candidate.kind,
                    source,
                    sourceIntegrity: scanned.value.integrity,
                    target,
                    reason: "The library already contains a different version of this owned skill",
                });
            }
            continue;
        }
        if (targetPresent || existingPath) {
            operations.push({
                skill: candidate.skill,
                action: "conflict",
                sourceKind: candidate.kind,
                source,
                sourceIntegrity: scanned.value.integrity,
                target,
                reason: targetPresent
                    ? "The target folder already exists but is not managed by the manifest"
                    : "The manifest points this name to a different path",
            });
            continue;
        }
        for (const finding of await scanSkillForSecrets(source))
            secretFindings.push({ ...finding, skill: candidate.skill });
        nextManifest.skills.push(targetPath);
        nextManifest.skills.sort((left, right) => left.localeCompare(right, "en"));
        const agents = normalizeAgents(candidate.agents);
        nextConfig.skills[candidate.skill] = { include: true, ...(agents ? { agents } : {}) };
        claimedNames.set(folded, `owned ${targetPath}`);
        existingOwned.set(folded, targetPath);
        operations.push({
            skill: candidate.skill,
            action: "copy-owned",
            sourceKind: candidate.kind,
            source,
            sourceIntegrity: scanned.value.integrity,
            target,
        });
    }
    const validatedManifest = libraryManifestSchema.parse(nextManifest);
    const payload = {
        kind: "import",
        schemaVersion: 1,
        library,
        baseManifestHash: hashText(manifestText),
        baseConfigHash: hashText(configText),
        nextManifest: validatedManifest,
        nextConfig,
        operations,
        secretFindings,
        hasConflicts: operations.some((operation) => operation.action === "conflict"),
        requiresResolve,
    };
    return { ...payload, planId: computePlanId(payload) };
}
//# sourceMappingURL=import.js.map
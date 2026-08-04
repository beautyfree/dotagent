import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { scanOwnedSkill } from "./inventory.js";
export const DEFAULT_DISCOVERY_LIMITS = { maxDepth: 8, maxDirectories: 20_000 };
function metadata(text) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text.replace(/^\uFEFF/, ""));
    if (!match)
        return { name: null, description: null, whenToUse: null };
    try {
        const value = parse(match[1] ?? "");
        const string = (key) => typeof value?.[key] === "string" && value[key].trim() ? value[key].trim() : null;
        return { name: string("name"), description: string("description"), whenToUse: string("when_to_use") };
    }
    catch {
        return { name: null, description: null, whenToUse: null };
    }
}
function portableKey(name) {
    return (name
        .toLocaleLowerCase("en-US")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "skill");
}
function integritySuffix(integrity) {
    return createHash("sha256").update(integrity).digest("hex").slice(0, 8);
}
function issue(code, message, remediation, issuePath) {
    return { code, severity: "warning", message, remediation, path: issuePath };
}
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
async function internalSkillMarkdownAlias(skillRoot, discoveryRoot) {
    try {
        const skillMd = path.join(skillRoot, "SKILL.md");
        if (!(await lstat(skillMd)).isSymbolicLink())
            return false;
        const [target, root] = await Promise.all([realpath(skillMd), realpath(discoveryRoot)]);
        const relative = path.relative(root, target);
        return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
    }
    catch {
        return false;
    }
}
async function collectRoots(root, limits) {
    const paths = [];
    const issues = [];
    let aliases = 0;
    let visited = 0;
    const visit = async (directory, depth) => {
        if (depth > limits.maxDepth)
            return;
        visited += 1;
        if (visited > limits.maxDirectories)
            throw new Error(`Discovery root exceeds ${limits.maxDirectories} directories`);
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        }
        catch {
            issues.push(issue("io-error", "A skill directory could not be read safely.", "Check its permissions or leave it local.", directory));
            return;
        }
        entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".dotagents")
                continue;
            const candidate = path.join(directory, entry.name);
            let directoryLike = entry.isDirectory();
            if (entry.isSymbolicLink()) {
                try {
                    directoryLike = (await stat(candidate)).isDirectory();
                }
                catch {
                    issues.push(issue("unsafe-link", "A dangling linked skill folder was left untouched.", "Repair or remove the link before importing it.", candidate));
                    continue;
                }
            }
            if (!directoryLike)
                continue;
            if (await exists(path.join(candidate, "SKILL.md"))) {
                if (await internalSkillMarkdownAlias(candidate, root.path))
                    aliases += 1;
                else
                    paths.push(candidate);
            }
            else if (!entry.isSymbolicLink())
                await visit(candidate, depth + 1);
        }
    };
    if (await exists(path.join(root.path, "SKILL.md")))
        paths.push(root.path);
    await visit(root.path, 0);
    return { paths, aliases, issues };
}
/**
 * Read-only cross-agent discovery. Byte-identical aliases are one skill with
 * multiple locations; same-name content differences remain explicit conflicts.
 */
export async function discoverSkills(roots, limits = DEFAULT_DISCOVERY_LIMITS) {
    const byIntegrity = new Map();
    const issues = [];
    let linkedAliases = 0;
    const sortedRoots = [...roots].sort((left, right) => `${left.kind}:${left.agent ?? ""}:${left.path}`.localeCompare(`${right.kind}:${right.agent ?? ""}:${right.path}`, "en"));
    for (const root of sortedRoots) {
        if (!(await exists(root.path)))
            continue;
        let collected;
        try {
            collected = await collectRoots(root, limits);
        }
        catch (error) {
            issues.push(issue("limit-exceeded", error instanceof Error ? error.message : "Discovery limit exceeded.", "Narrow this discovery root or remove generated directories.", root.path));
            continue;
        }
        linkedAliases += collected.aliases;
        issues.push(...collected.issues);
        for (const candidate of collected.paths) {
            let actual;
            try {
                actual = await realpath(candidate);
            }
            catch {
                issues.push(issue("file-not-found", "A discovered skill path no longer resolves.", "Refresh discovery after repairing the path.", candidate));
                continue;
            }
            const scanned = await scanOwnedSkill(path.dirname(actual), path.basename(actual));
            if (!scanned.ok) {
                issues.push(...scanned.issues.map((entry) => ({ ...entry, severity: "warning" })));
                continue;
            }
            const frontmatter = metadata(await readFile(path.join(actual, "SKILL.md"), "utf8"));
            const name = frontmatter.name?.trim() || path.basename(actual);
            const validName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
            const existing = byIntegrity.get(scanned.value.integrity);
            const location = { kind: root.kind, ...(root.agent ? { agent: root.agent } : {}) };
            if (existing) {
                if (!existing.locations.some((entry) => entry.kind === location.kind && entry.agent === location.agent))
                    existing.locations.push(location);
                continue;
            }
            byIntegrity.set(scanned.value.integrity, {
                candidateKey: portableKey(name),
                name,
                description: frontmatter.description,
                whenToUse: frontmatter.whenToUse,
                integrity: scanned.value.integrity,
                fileCount: scanned.value.fileCount,
                bytes: scanned.value.bytes,
                sourcePath: actual,
                locations: [location],
                metadataValid: validName && frontmatter.name === name,
            });
        }
    }
    const skills = [...byIntegrity.values()].sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const skill of skills)
        skill.locations.sort((left, right) => `${left.kind}:${left.agent ?? ""}`.localeCompare(`${right.kind}:${right.agent ?? ""}`, "en"));
    const names = new Map();
    for (const skill of skills) {
        const folded = skill.name.toLocaleLowerCase("en-US");
        names.set(folded, [...(names.get(folded) ?? []), skill]);
    }
    const collisions = [...names.values()]
        .filter((group) => group.length > 1)
        .map((group) => {
        const first = group[0];
        if (!first)
            throw new Error("Collision group cannot be empty");
        for (const skill of group)
            skill.candidateKey = `${portableKey(skill.name)}-${integritySuffix(skill.integrity)}`;
        return { name: first.name, candidateKeys: group.map((skill) => skill.candidateKey) };
    });
    return { skills, collisions, issues, linkedAliases };
}
/** Produces conservative defaults: verified provenance is referenced; everything else is owned. */
export function suggestImportCandidates(report, provenance = []) {
    const conflicting = new Set(report.collisions.flatMap((collision) => collision.candidateKeys));
    return report.skills.map((skill) => {
        if (conflicting.has(skill.candidateKey) || !skill.metadataValid) {
            return {
                kind: "local-only",
                skill: portableKey(skill.name),
                sourcePath: skill.sourcePath,
                reason: conflicting.has(skill.candidateKey)
                    ? "Same-name content conflict requires a decision"
                    : "SKILL.md metadata needs review",
            };
        }
        const source = provenance.find((entry) => entry.skill === skill.name && (!entry.integrity || entry.integrity === skill.integrity));
        const agents = [...new Set(skill.locations.flatMap((location) => (location.agent ? [location.agent] : [])))].sort();
        if (source)
            return {
                kind: "dependency",
                skill: skill.name,
                package: source.package,
                url: source.url,
                ref: source.ref,
                skillPath: source.skillPath,
                ...(source.source ? { source: source.source } : {}),
                ...(agents.length ? { agents } : {}),
            };
        return { kind: "owned", skill: skill.name, sourcePath: skill.sourcePath, ...(agents.length ? { agents } : {}) };
    });
}
//# sourceMappingURL=discovery.js.map
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { computeSkillIntegrity } from "./integrity.js";
import { scanOwnedSkill } from "./inventory.js";
import { parseLibraryManifest } from "./library.js";
import { discoverSkillPaths, planWildcardSelection } from "./selection.js";
import { DENY_ALL_SOURCE_SECURITY_POLICY, parseSourceSecurityPolicy, requireMinimumReleaseAge, requireTrustedSource, } from "./source-policy.js";
import { normalizeGitIdentity } from "./sources.js";
const execFileAsync = promisify(execFile);
export class NodeGitRunner {
    #timeoutMs;
    constructor(timeoutMs = 45_000) {
        this.#timeoutMs = timeoutMs;
    }
    async run(args, cwd) {
        const result = await execFileAsync("git", args, {
            cwd,
            maxBuffer: 10 * 1024 * 1024,
            encoding: "utf8",
            timeout: this.#timeoutMs,
            env: {
                ...process.env,
                GIT_TERMINAL_PROMPT: "0",
                GIT_SSH_COMMAND: "ssh -o BatchMode=yes -o ConnectTimeout=10",
            },
        });
        return result.stdout.trim();
    }
}
export class GitDependencyResolver {
    sourcePolicy;
    #git;
    #temporaryRoot;
    #cacheRoot;
    #limits;
    #now;
    #cacheWork = new Map();
    constructor(options = {}) {
        this.#git = options.git ?? new NodeGitRunner(options.gitTimeoutMs);
        this.#temporaryRoot = options.temporaryRoot ?? tmpdir();
        this.#cacheRoot = options.cacheRoot;
        this.#limits = options.limits;
        this.sourcePolicy = options.sourcePolicy
            ? parseSourceSecurityPolicy(options.sourcePolicy)
            : DENY_ALL_SOURCE_SECURITY_POLICY;
        this.#now = options.now ?? (() => new Date());
    }
    async #exists(filePath) {
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
    async #prepareMirror(url) {
        const cacheRoot = this.#cacheRoot;
        if (!cacheRoot)
            return null;
        const identity = normalizeGitIdentity(url);
        const key = createHash("sha256").update(identity).digest("hex").slice(0, 32);
        const existing = this.#cacheWork.get(key);
        if (existing)
            return existing;
        const work = (async () => {
            await mkdir(cacheRoot, { recursive: true });
            const mirror = path.join(cacheRoot, `${key}.git`);
            if (!(await this.#exists(mirror))) {
                const temporary = `${mirror}.tmp-${process.pid}-${Date.now()}`;
                try {
                    await this.#git.run([
                        "clone",
                        "--mirror",
                        "--filter=blob:none",
                        "--depth=1",
                        "--no-tags",
                        "--",
                        url,
                        temporary,
                    ]);
                    try {
                        await rename(temporary, mirror);
                    }
                    catch (error) {
                        if (!(await this.#exists(mirror)))
                            throw error;
                        await rm(temporary, { recursive: true, force: true });
                    }
                }
                catch (error) {
                    await rm(temporary, { recursive: true, force: true });
                    throw error;
                }
            }
            return mirror;
        })();
        this.#cacheWork.set(key, work);
        try {
            return await work;
        }
        finally {
            this.#cacheWork.delete(key);
        }
    }
    #mirrorPath(url) {
        if (!this.#cacheRoot)
            return null;
        const identity = normalizeGitIdentity(url);
        const key = createHash("sha256").update(identity).digest("hex").slice(0, 32);
        return path.join(this.#cacheRoot, `${key}.git`);
    }
    async #scanPackage(checkout, selected) {
        const skills = [];
        const integrityInputs = [];
        for (const skillPath of [...selected].sort((left, right) => left.localeCompare(right, "en"))) {
            const scanned = await scanOwnedSkill(checkout, skillPath, this.#limits);
            if (!scanned.ok)
                throw new Error(scanned.issues.map((entry) => entry.message).join("; "));
            skills.push({ name: scanned.value.name, path: scanned.value.path });
            integrityInputs.push({
                path: scanned.value.path === "." ? `root/${scanned.value.name}` : scanned.value.path,
                content: Buffer.from(scanned.value.integrity, "utf8"),
            });
        }
        return { skills, integrity: computeSkillIntegrity(integrityInputs) };
    }
    async #verifyAge(checkout, commit, source) {
        const committedAt = await this.#git.run(["show", "-s", "--format=%cI", commit], checkout);
        return requireMinimumReleaseAge(source, committedAt, this.sourcePolicy, this.#now()).committedAt;
    }
    async #selection(checkout, dependency, source, revision) {
        if (!dependency.include)
            return { selected: dependency.select };
        const subtree = dependency.subtree ?? ".";
        const discovered = (await discoverSkillPaths(checkout)).filter((entry) => subtree === "." || entry === subtree || entry.startsWith(`${subtree}/`));
        const plan = planWildcardSelection({
            source,
            revision,
            subtree,
            available: discovered,
            include: dependency.include,
            ...(dependency.exclude ? { exclude: dependency.exclude } : {}),
        });
        if (plan.selected.length === 0)
            throw new Error(`Wildcard selection for ${source} did not match any skills`);
        return {
            selected: plan.selected,
            evidence: {
                subtree: plan.subtree,
                include: plan.include,
                exclude: plan.exclude,
                index_integrity: plan.indexIntegrity,
                excluded: plan.entries
                    .filter((entry) => !entry.selected)
                    .map((entry) => ({
                    path: entry.path,
                    reason: entry.reason,
                    ...(entry.matchedPattern ? { matched_pattern: entry.matchedPattern } : {}),
                })),
            },
        };
    }
    async resolve(_name, dependency) {
        requireTrustedSource(dependency.url, this.sourcePolicy);
        const workspace = await mkdtemp(path.join(this.#temporaryRoot, "dotagents-resolve-"));
        const checkout = path.join(workspace, "repository");
        try {
            const mirror = await this.#prepareMirror(dependency.url);
            await this.#git.run([
                "clone",
                "--no-checkout",
                "--filter=blob:none",
                "--depth=1",
                "--no-tags",
                ...(mirror ? ["--reference-if-able", mirror] : []),
                "--",
                dependency.url,
                checkout,
            ]);
            await this.#git.run(["fetch", "--depth=1", "origin", dependency.ref], checkout);
            const commit = await this.#git.run(["rev-parse", "FETCH_HEAD^{commit}"], checkout);
            if (!/^[a-f0-9]{40}$/.test(commit))
                throw new Error(`Git returned an invalid commit for ${dependency.url}#${dependency.ref}`);
            await this.#git.run(["checkout", "--detach", commit], checkout);
            const committedAt = await this.#verifyAge(checkout, commit, dependency.url);
            let sourceManifest = null;
            try {
                const manifest = parseLibraryManifest(await readFile(path.join(checkout, "skills.json"), "utf8"));
                if (manifest.ok)
                    sourceManifest = manifest.value;
            }
            catch (error) {
                if (error.code !== "ENOENT")
                    throw error;
            }
            const selection = await this.#selection(checkout, dependency, dependency.url, commit);
            let selected = selection.selected;
            if (!selected) {
                if (!sourceManifest)
                    throw new Error(`Dependency ${dependency.url} has no compatible skills.json`);
                selected = sourceManifest.skills;
            }
            const scanned = await this.#scanPackage(checkout, selected);
            return {
                url: normalizeGitIdentity(dependency.url),
                requested_ref: dependency.ref,
                commit,
                committed_at: committedAt,
                integrity: scanned.integrity,
                ...(sourceManifest?.license ? { license: sourceManifest.license } : {}),
                ...(selection.evidence ? { selection: selection.evidence } : {}),
                skills: scanned.skills,
            };
        }
        finally {
            await rm(workspace, { recursive: true, force: true });
        }
    }
    /**
     * Materializes only an already locked immutable commit into a disposable
     * machine cache and re-verifies the complete package before returning it.
     */
    async prepareLocked(name, dependency, locked, checkoutRoot) {
        requireTrustedSource(dependency.url, this.sourcePolicy);
        if (normalizeGitIdentity(dependency.url) !== normalizeGitIdentity(locked.url) ||
            dependency.ref !== locked.requested_ref) {
            throw new Error(`Lock entry for ${name} does not match skills.json`);
        }
        const requestedPaths = dependency.select ? [...dependency.select].sort() : null;
        const lockedPaths = locked.skills.map((skill) => skill.path).sort();
        if (requestedPaths && JSON.stringify(requestedPaths) !== JSON.stringify(lockedPaths))
            throw new Error(`Lock entry for ${name} does not match selected skill paths`);
        if (dependency.include) {
            if (!locked.selection ||
                JSON.stringify([...dependency.include].sort()) !== JSON.stringify(locked.selection.include) ||
                JSON.stringify([...(dependency.exclude ?? [])].sort()) !== JSON.stringify(locked.selection.exclude) ||
                (dependency.subtree ?? ".") !== locked.selection.subtree) {
                throw new Error(`Lock entry for ${name} does not match wildcard selection`);
            }
        }
        else if (locked.selection) {
            throw new Error(`Lock entry for ${name} contains an unexpected wildcard selection`);
        }
        // Keep Git worktrees comfortably below classic Windows MAX_PATH. Full
        // source identity, commit, and package integrity are still revalidated.
        const sourceKey = createHash("sha256").update(normalizeGitIdentity(dependency.url)).digest("hex").slice(0, 20);
        const target = path.join(path.resolve(checkoutRoot), `${sourceKey}-${locked.commit.slice(0, 20)}`);
        const canonicalSkills = (skills) => JSON.stringify([...skills].sort((left, right) => `${left.path}:${left.name}`.localeCompare(`${right.path}:${right.name}`, "en")));
        const verify = async (root) => {
            try {
                if (dependency.include) {
                    const current = await this.#selection(root, dependency, dependency.url, locked.commit);
                    if (!current.evidence ||
                        current.evidence.index_integrity !== locked.selection?.index_integrity ||
                        JSON.stringify(current.selected) !== JSON.stringify(lockedPaths)) {
                        return false;
                    }
                }
                const scanned = await this.#scanPackage(root, locked.skills.map((skill) => skill.path));
                return (scanned.integrity === locked.integrity && canonicalSkills(scanned.skills) === canonicalSkills(locked.skills));
            }
            catch {
                return false;
            }
        };
        if ((await this.#exists(target)) && (await verify(target))) {
            await this.#verifyAge(target, locked.commit, dependency.url);
            return {
                dependency: name,
                root: target,
                commit: locked.commit,
                integrity: locked.integrity,
                skills: locked.skills,
            };
        }
        if (await this.#exists(target))
            await rm(target, { recursive: true, force: true });
        let mirror = this.#mirrorPath(dependency.url);
        if (!mirror || !(await this.#exists(mirror)))
            mirror = await this.#prepareMirror(dependency.url);
        const parent = path.dirname(target);
        await mkdir(parent, { recursive: true });
        const staging = `${target}.tmp-${process.pid}`;
        try {
            await this.#git.run(["clone", "--no-checkout", "--", mirror ?? dependency.url, staging]);
            await this.#git.run(["checkout", "--detach", locked.commit], staging);
            if ((await this.#git.run(["rev-parse", "HEAD"], staging)) !== locked.commit)
                throw new Error(`Locked dependency ${name} checked out an unexpected commit`);
            await this.#verifyAge(staging, locked.commit, dependency.url);
            if (!(await verify(staging)))
                throw new Error(`Locked dependency ${name} failed integrity verification`);
            try {
                await rename(staging, target);
            }
            catch (error) {
                if (!(await this.#exists(target)) || !(await verify(target)))
                    throw error;
                await rm(staging, { recursive: true, force: true });
            }
            return {
                dependency: name,
                root: target,
                commit: locked.commit,
                integrity: locked.integrity,
                skills: locked.skills,
            };
        }
        catch (error) {
            await rm(staging, { recursive: true, force: true });
            throw error;
        }
    }
}
//# sourceMappingURL=git-resolver.js.map
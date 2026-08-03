import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { auditLibrary, scanTextForSecrets } from "./audit.js";
import { normalizeGitIdentity } from "./git-identity.js";
import { loadLibrary } from "./library.js";
import { normalizePortablePath } from "./paths.js";
import { computePlanId } from "./plan.js";
const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";
const GIT_NAME = "dotagent library";
const GIT_EMAIL = "library@dotagent.local";
export class NodeWorkspaceGitPort {
    async run(args, cwd, options = {}) {
        const result = await execFileAsync("git", args, {
            cwd,
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
            env: options.nonInteractive
                ? { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" }
                : process.env,
        });
        // Porcelain `-z` records can legitimately start with a space (for example
        // " M file"). Trimming those records corrupts both the status and path.
        return options.raw ? result.stdout : result.stdout.trim();
    }
}
function withPlanId(payload) {
    return { ...payload, planId: computePlanId(payload) };
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
async function ensureLibrary(root) {
    const resolved = path.resolve(root);
    const loaded = await loadLibrary(resolved);
    if (!loaded.ok)
        throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
    return resolved;
}
async function gitHead(root, git) {
    try {
        return await git.run(["rev-parse", "--verify", "HEAD"], root);
    }
    catch {
        return null;
    }
}
async function gitBranch(root, git) {
    try {
        return await git.run(["symbolic-ref", "--short", "HEAD"], root);
    }
    catch {
        return DEFAULT_BRANCH;
    }
}
function parseChangedPaths(output) {
    if (!output)
        return [];
    const records = output.split("\0");
    const paths = new Set();
    for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (!record || record.length < 4)
            continue;
        const status = record.slice(0, 2);
        paths.add(record.slice(3).replaceAll("\\", "/"));
        const renamedPath = records[index + 1];
        if (/[RC]/.test(status) && renamedPath) {
            paths.add(renamedPath.replaceAll("\\", "/"));
            index += 1;
        }
    }
    return [...paths].sort((left, right) => left.localeCompare(right, "en"));
}
function parseNullPaths(output) {
    return output
        ? output
            .split("\0")
            .filter(Boolean)
            .map((entry) => entry.replaceAll("\\", "/"))
            .sort((left, right) => left.localeCompare(right, "en"))
        : [];
}
function isMachineLocalIgnoredPath(filePath) {
    const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
    return normalized === "dotagent.local.yaml" || normalized === ".dotagent" || normalized.startsWith(".dotagent/");
}
async function changedLibraryPaths(root, git) {
    const [status, ignored] = await Promise.all([
        git.run(["status", "--porcelain=v1", "-z", "--untracked-files=all"], root, { raw: true }),
        git.run(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"], root, { raw: true }),
    ]);
    return {
        changed: parseChangedPaths(status),
        // Local config and journals are intentionally excluded. Any other ignored
        // content is surfaced so a reviewed snapshot never silently omits it.
        ignored: parseNullPaths(ignored).filter((filePath) => !isMachineLocalIgnoredPath(filePath)),
    };
}
function portableGitPath(filePath) {
    const normalized = normalizePortablePath(filePath);
    if (!normalized)
        return null;
    const allowedFile = /^(?:skills\.json|skills\.lock|dotagent\.yaml|README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?|\.gitignore)$/i.test(normalized);
    const allowedTree = /^(?:skills|docs|assets|examples)\//.test(normalized);
    return allowedFile || allowedTree ? normalized : null;
}
async function snapshotFiles(root, files) {
    const snapshots = [];
    const unsafePaths = [];
    const secretFindings = [];
    let totalBytes = 0;
    for (const input of files) {
        const portable = portableGitPath(input);
        if (!portable) {
            unsafePaths.push(input);
            continue;
        }
        const absolute = path.join(root, ...portable.split("/"));
        if (!(await exists(absolute))) {
            snapshots.push({ path: portable, hash: null });
            continue;
        }
        const metadata = await lstat(absolute);
        if (metadata.isSymbolicLink() || !metadata.isFile() || metadata.size > 10 * 1024 * 1024) {
            unsafePaths.push(portable);
            continue;
        }
        totalBytes += metadata.size;
        if (totalBytes > 100 * 1024 * 1024) {
            unsafePaths.push(portable);
            continue;
        }
        const content = await readFile(absolute);
        snapshots.push({ path: portable, hash: createHash("sha256").update(content).digest("hex") });
        if (!content.subarray(0, Math.min(content.length, 8_192)).includes(0)) {
            for (const finding of scanTextForSecrets(content.toString("utf8")))
                secretFindings.push({ file: portable, ...finding });
        }
    }
    return { snapshots, unsafePaths, secretFindings };
}
function auditErrors(report) {
    return report.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => ({
        code: issue.code,
        message: issue.message,
        remediation: issue.remediation,
        ...(issue.field ? { field: issue.field } : {}),
    }));
}
function assertPlanId(plan) {
    const { planId, ...payload } = plan;
    if (computePlanId(payload) !== planId)
        throw new Error("Git plan is stale or modified");
}
function credentialFreeGitRemote(remote) {
    const value = remote.trim();
    if (!value || /[\r\n\0]/.test(value))
        throw new Error("Git URL must be a single non-empty value");
    const identity = normalizeGitIdentity(value);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        const parsed = new URL(value.replace(/^git\+/, ""));
        if (parsed.search || parsed.hash)
            throw new Error("Git URL must not contain query parameters or fragments");
    }
    return { remote: value, identity };
}
export async function initializeLibraryGit(root, remote, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    if (!(await exists(path.join(library, ".git")))) {
        await git.run(["init", "--initial-branch", DEFAULT_BRANCH], library);
        await git.run(["config", "user.name", GIT_NAME], library);
        await git.run(["config", "user.email", GIT_EMAIL], library);
    }
    if (remote)
        await setLibraryRemote(library, remote, git);
}
export async function setLibraryRemote(root, remote, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const validated = credentialFreeGitRemote(remote);
    try {
        await git.run(["remote", "get-url", "origin"], library);
        await git.run(["remote", "set-url", "origin", validated.remote], library);
    }
    catch {
        await git.run(["remote", "add", "origin", validated.remote], library);
    }
}
export async function planLibraryGitInitialization(root, remote, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const repositoryPresent = await exists(path.join(library, ".git"));
    let currentRemoteIdentity = null;
    if (repositoryPresent) {
        try {
            currentRemoteIdentity = normalizeGitIdentity(await git.run(["remote", "get-url", "origin"], library));
        }
        catch {
            /* no origin */
        }
    }
    const validated = remote ? credentialFreeGitRemote(remote) : null;
    return withPlanId({
        kind: "git-initialize",
        schemaVersion: 1,
        library,
        remote: validated?.remote ?? null,
        remoteIdentity: validated?.identity ?? null,
        repositoryPresent,
        currentRemoteIdentity,
    });
}
export async function applyLibraryGitInitialization(plan, git = new NodeWorkspaceGitPort()) {
    assertPlanId(plan);
    const current = await planLibraryGitInitialization(plan.library, plan.remote ?? undefined, git);
    if (current.planId !== plan.planId)
        throw new Error("Git repository or remote changed after the preview");
    await initializeLibraryGit(plan.library, plan.remote ?? undefined, git);
}
export async function cloneLibrary(remote, target, git = new NodeWorkspaceGitPort()) {
    const plan = await planLibraryClone(remote, target);
    await applyLibraryClone(plan, git);
}
export async function planLibraryClone(remote, target) {
    const validated = credentialFreeGitRemote(remote);
    const destination = path.resolve(target);
    if (await exists(destination))
        throw new Error("Clone destination must not already exist");
    return withPlanId({
        kind: "git-clone",
        schemaVersion: 1,
        remote: validated.remote,
        remoteIdentity: validated.identity,
        destination,
    });
}
export async function applyLibraryClone(plan, git = new NodeWorkspaceGitPort()) {
    assertPlanId(plan);
    const current = await planLibraryClone(plan.remote, plan.destination);
    if (current.planId !== plan.planId)
        throw new Error("Clone destination or remote changed after the preview");
    const destination = plan.destination;
    await mkdir(path.dirname(destination), { recursive: true });
    const staging = await mkdtemp(path.join(path.dirname(destination), `.${path.basename(destination)}.dotagent-clone-`));
    try {
        await rm(staging, { recursive: true, force: true });
        await git.run(["clone", "--", plan.remote, staging], path.dirname(destination));
        await ensureLibrary(staging);
        await git.run(["config", "user.name", GIT_NAME], staging);
        await git.run(["config", "user.email", GIT_EMAIL], staging);
        if (await exists(destination))
            throw new Error("Clone destination appeared after the preview");
        await rename(staging, destination);
    }
    catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
    }
}
export async function getLibraryGitStatus(root, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const [branch, head, paths] = await Promise.all([
        gitBranch(library, git),
        gitHead(library, git),
        changedLibraryPaths(library, git),
    ]);
    let remoteIdentity = null;
    try {
        remoteIdentity = normalizeGitIdentity(await git.run(["remote", "get-url", "origin"], library));
    }
    catch {
        /* no remote */
    }
    let ahead = 0;
    let behind = 0;
    try {
        const counts = (await git.run(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], library))
            .split(/\s+/)
            .map(Number);
        ahead = counts[0] ?? 0;
        behind = counts[1] ?? 0;
    }
    catch {
        /* no upstream yet */
    }
    return { branch, changed: paths.changed.length > 0 || paths.ignored.length > 0, ahead, behind, remoteIdentity, head };
}
export async function planLibraryCommit(root, message, visibility = "private", git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const commitMessage = message.trim();
    if (!commitMessage || commitMessage.length > 200 || /[\r\n\0]/.test(commitMessage))
        throw new Error("Commit message must be one line between 1 and 200 characters");
    const paths = await changedLibraryPaths(library, git);
    const [snapshot, report, baseHead] = await Promise.all([
        snapshotFiles(library, paths.changed),
        auditLibrary({ root: library, visibility }),
        gitHead(library, git),
    ]);
    const errors = auditErrors(report);
    const payload = {
        kind: "git-commit",
        schemaVersion: 1,
        library,
        visibility,
        message: commitMessage,
        baseHead,
        files: snapshot.snapshots,
        secretFindings: snapshot.secretFindings,
        unsafePaths: [...new Set([...snapshot.unsafePaths, ...paths.ignored])].sort(),
        auditErrors: errors,
        hasBlockers: snapshot.secretFindings.length > 0 ||
            snapshot.unsafePaths.length > 0 ||
            paths.ignored.length > 0 ||
            errors.length > 0,
    };
    return withPlanId(payload);
}
export async function applyLibraryCommit(plan, git = new NodeWorkspaceGitPort()) {
    assertPlanId(plan);
    const current = await planLibraryCommit(plan.library, plan.message, plan.visibility, git);
    if (current.planId !== plan.planId)
        throw new Error("Library changed after the commit preview");
    if (plan.hasBlockers)
        throw new Error("Commit plan contains security or portability blockers");
    if (plan.files.length === 0)
        return null;
    await git.run(["add", "-A", "--", ...plan.files.map((file) => file.path)], plan.library);
    await git.run(["commit", "-m", plan.message], plan.library);
    return gitHead(plan.library, git);
}
export async function fetchLibrary(root, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    await git.run(["-c", "credential.interactive=false", "fetch", "origin", "--prune", "--no-tags"], library, {
        nonInteractive: true,
    });
}
export async function planLibraryPull(root, visibility = "private", git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const before = await getLibraryGitStatus(library, git);
    if (before.changed)
        throw new Error("Library has uncommitted changes; commit or discard them before pull review");
    if (!before.head)
        throw new Error("Library has no local commit to fast-forward");
    await fetchLibrary(library, git);
    const branch = before.branch || DEFAULT_BRANCH;
    const remoteHead = await git.run(["rev-parse", `refs/remotes/origin/${branch}`], library);
    const ancestry = await git.run(["merge-base", "--is-ancestor", before.head, remoteHead], library).then(() => true, () => false);
    if (!ancestry)
        throw new Error("Remote history is not a fast-forward; reconcile it explicitly");
    const files = before.head === remoteHead
        ? []
        : parseNullPaths(await git.run(["diff", "--name-only", "-z", `${before.head}..${remoteHead}`], library, { raw: true }));
    const worktreeParent = await mkdtemp(path.join(tmpdir(), "dotagent-pull-review-"));
    const worktree = path.join(worktreeParent, "checkout");
    let snapshot = { snapshots: [], unsafePaths: [], secretFindings: [] };
    let errors = [];
    try {
        await git.run(["worktree", "add", "--detach", worktree, remoteHead], library);
        snapshot = await snapshotFiles(worktree, files);
        errors = auditErrors(await auditLibrary({ root: worktree, visibility }));
    }
    finally {
        try {
            await git.run(["worktree", "remove", "--force", worktree], library);
        }
        catch {
            await rm(worktree, { recursive: true, force: true });
        }
        await rm(worktreeParent, { recursive: true, force: true });
    }
    const payload = {
        kind: "git-pull",
        schemaVersion: 1,
        library,
        visibility,
        branch,
        baseHead: before.head,
        remoteHead,
        files,
        secretFindings: snapshot.secretFindings,
        unsafePaths: snapshot.unsafePaths,
        auditErrors: errors,
        hasBlockers: snapshot.secretFindings.length > 0 || snapshot.unsafePaths.length > 0 || errors.length > 0,
    };
    return withPlanId(payload);
}
export async function applyLibraryPull(plan, git = new NodeWorkspaceGitPort()) {
    assertPlanId(plan);
    const current = await planLibraryPull(plan.library, plan.visibility, git);
    if (current.planId !== plan.planId)
        throw new Error("Remote or local library changed after the pull preview");
    if (plan.hasBlockers)
        throw new Error("Pull plan contains security or portability blockers");
    if (plan.baseHead !== plan.remoteHead)
        await git.run(["merge", "--ff-only", plan.remoteHead], plan.library);
    const head = await gitHead(plan.library, git);
    if (!head)
        throw new Error("Pull completed without a readable Git HEAD");
    return head;
}
export async function planLibraryPush(root, git = new NodeWorkspaceGitPort()) {
    const library = await ensureLibrary(root);
    const status = await getLibraryGitStatus(library, git);
    if (status.changed)
        throw new Error("Library has uncommitted changes; review and commit them before push");
    if (!status.head)
        throw new Error("Library has no commit to push");
    if (!status.remoteIdentity)
        throw new Error("Library has no origin remote");
    const payload = {
        kind: "git-push",
        schemaVersion: 1,
        library,
        branch: status.branch || DEFAULT_BRANCH,
        head: status.head,
        remoteIdentity: status.remoteIdentity,
        ahead: status.ahead,
    };
    return withPlanId(payload);
}
export async function applyLibraryPush(plan, git = new NodeWorkspaceGitPort()) {
    assertPlanId(plan);
    const current = await planLibraryPush(plan.library, git);
    if (current.planId !== plan.planId)
        throw new Error("Library changed after the push preview");
    await git.run(["push", "-u", "origin", `HEAD:${plan.branch}`], plan.library);
}
//# sourceMappingURL=git-workspace.js.map
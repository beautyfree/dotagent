import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { auditLibrary, scanTextForSecrets } from "./audit.js";
import { loadLibrary } from "./library.js";
import { computePlanId } from "./plan.js";
import { normalizePortablePath } from "./paths.js";
import { normalizeGitIdentity } from "./sources.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BRANCH = "main";
const GIT_NAME = "dotagent library";
const GIT_EMAIL = "library@dotagent.local";

export interface WorkspaceGitPort {
  run(args: string[], cwd: string, options?: { nonInteractive?: boolean; raw?: boolean }): Promise<string>;
}

export class NodeWorkspaceGitPort implements WorkspaceGitPort {
  async run(args: string[], cwd: string, options: { nonInteractive?: boolean; raw?: boolean } = {}): Promise<string> {
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

export interface GitWorkspaceStatus {
  branch: string;
  changed: boolean;
  ahead: number;
  behind: number;
  remoteIdentity: string | null;
  head: string | null;
}

export type GitWorkspaceSecretFinding = {
  file: string;
  rule: ReturnType<typeof scanTextForSecrets>[number]["rule"];
  line: number;
  column: number;
};

export interface GitCommitPlan {
  kind: "git-commit";
  schemaVersion: 1;
  planId: string;
  library: string;
  visibility: "private" | "team" | "public";
  message: string;
  baseHead: string | null;
  files: { path: string; hash: string | null }[];
  secretFindings: GitWorkspaceSecretFinding[];
  unsafePaths: string[];
  auditErrors: { code: string; message: string; remediation: string; field?: string }[];
  hasBlockers: boolean;
}

export interface GitPullPlan {
  kind: "git-pull";
  schemaVersion: 1;
  planId: string;
  library: string;
  visibility: "private" | "team" | "public";
  branch: string;
  baseHead: string;
  remoteHead: string;
  files: string[];
  secretFindings: GitWorkspaceSecretFinding[];
  unsafePaths: string[];
  auditErrors: { code: string; message: string; remediation: string; field?: string }[];
  hasBlockers: boolean;
}

export interface GitPushPlan {
  kind: "git-push";
  schemaVersion: 1;
  planId: string;
  library: string;
  branch: string;
  head: string;
  remoteIdentity: string;
  ahead: number;
}

type AnyGitPlan = GitCommitPlan | GitPullPlan | GitPushPlan;

function withPlanId<T extends Omit<AnyGitPlan, "planId">>(payload: T): T & { planId: string } {
  return { ...payload, planId: computePlanId(payload) };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function ensureLibrary(root: string): Promise<string> {
  const resolved = path.resolve(root);
  const loaded = await loadLibrary(resolved);
  if (!loaded.ok) throw new Error(loaded.issues.map((issue) => issue.message).join("; "));
  return resolved;
}

async function gitHead(root: string, git: WorkspaceGitPort): Promise<string | null> {
  try {
    return await git.run(["rev-parse", "--verify", "HEAD"], root);
  } catch {
    return null;
  }
}

async function gitBranch(root: string, git: WorkspaceGitPort): Promise<string> {
  try {
    return await git.run(["symbolic-ref", "--short", "HEAD"], root);
  } catch {
    return DEFAULT_BRANCH;
  }
}

function parseChangedPaths(output: string): string[] {
  if (!output) return [];
  const records = output.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record || record.length < 4) continue;
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

function parseNullPaths(output: string): string[] {
  return output
    ? output
        .split("\0")
        .filter(Boolean)
        .map((entry) => entry.replaceAll("\\", "/"))
        .sort((left, right) => left.localeCompare(right, "en"))
    : [];
}

function isMachineLocalIgnoredPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized === "dotagent.local.yaml" || normalized === ".dotagent" || normalized.startsWith(".dotagent/");
}

async function changedLibraryPaths(
  root: string,
  git: WorkspaceGitPort,
): Promise<{ changed: string[]; ignored: string[] }> {
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

function portableGitPath(filePath: string): string | null {
  const normalized = normalizePortablePath(filePath);
  if (!normalized) return null;
  const allowedFile =
    /^(?:skills\.json|skills\.lock|dotagent\.yaml|README(?:\.[^/]+)?|LICENSE(?:\.[^/]+)?|NOTICE(?:\.[^/]+)?|\.gitignore)$/i.test(
      normalized,
    );
  const allowedTree = /^(?:skills|docs|assets|examples)\//.test(normalized);
  return allowedFile || allowedTree ? normalized : null;
}

async function snapshotFiles(
  root: string,
  files: string[],
): Promise<{
  snapshots: { path: string; hash: string | null }[];
  unsafePaths: string[];
  secretFindings: GitWorkspaceSecretFinding[];
}> {
  const snapshots: { path: string; hash: string | null }[] = [];
  const unsafePaths: string[] = [];
  const secretFindings: GitWorkspaceSecretFinding[] = [];
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

function auditErrors(report: Awaited<ReturnType<typeof auditLibrary>>): GitCommitPlan["auditErrors"] {
  return report.issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => ({
      code: issue.code,
      message: issue.message,
      remediation: issue.remediation,
      ...(issue.field ? { field: issue.field } : {}),
    }));
}

function assertPlanId(plan: AnyGitPlan): void {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Git plan is stale or modified");
}

export async function initializeLibraryGit(
  root: string,
  remote?: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<void> {
  const library = await ensureLibrary(root);
  if (!(await exists(path.join(library, ".git")))) {
    await git.run(["init", "--initial-branch", DEFAULT_BRANCH], library);
    await git.run(["config", "user.name", GIT_NAME], library);
    await git.run(["config", "user.email", GIT_EMAIL], library);
  }
  if (remote) await setLibraryRemote(library, remote, git);
}

export async function setLibraryRemote(
  root: string,
  remote: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<void> {
  const library = await ensureLibrary(root);
  normalizeGitIdentity(remote);
  try {
    await git.run(["remote", "get-url", "origin"], library);
    await git.run(["remote", "set-url", "origin", remote], library);
  } catch {
    await git.run(["remote", "add", "origin", remote], library);
  }
}

export async function cloneLibrary(
  remote: string,
  target: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<void> {
  normalizeGitIdentity(remote);
  const destination = path.resolve(target);
  if (await exists(destination)) throw new Error("Clone destination must not already exist");
  await mkdir(path.dirname(destination), { recursive: true });
  const staging = `${destination}.dotagent-clone-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  try {
    await git.run(["clone", "--", remote, staging], path.dirname(destination));
    await ensureLibrary(staging);
    await git.run(["config", "user.name", GIT_NAME], staging);
    await git.run(["config", "user.email", GIT_EMAIL], staging);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

export async function getLibraryGitStatus(
  root: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<GitWorkspaceStatus> {
  const library = await ensureLibrary(root);
  const [branch, head, paths] = await Promise.all([
    gitBranch(library, git),
    gitHead(library, git),
    changedLibraryPaths(library, git),
  ]);
  let remoteIdentity: string | null = null;
  try {
    remoteIdentity = normalizeGitIdentity(await git.run(["remote", "get-url", "origin"], library));
  } catch {
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
  } catch {
    /* no upstream yet */
  }
  return { branch, changed: paths.changed.length > 0 || paths.ignored.length > 0, ahead, behind, remoteIdentity, head };
}

export async function planLibraryCommit(
  root: string,
  message: string,
  visibility: GitCommitPlan["visibility"] = "private",
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<GitCommitPlan> {
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
    kind: "git-commit" as const,
    schemaVersion: 1 as const,
    library,
    visibility,
    message: commitMessage,
    baseHead,
    files: snapshot.snapshots,
    secretFindings: snapshot.secretFindings,
    unsafePaths: [...new Set([...snapshot.unsafePaths, ...paths.ignored])].sort(),
    auditErrors: errors,
    hasBlockers:
      snapshot.secretFindings.length > 0 ||
      snapshot.unsafePaths.length > 0 ||
      paths.ignored.length > 0 ||
      errors.length > 0,
  };
  return withPlanId(payload);
}

export async function applyLibraryCommit(
  plan: GitCommitPlan,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<string | null> {
  assertPlanId(plan);
  const current = await planLibraryCommit(plan.library, plan.message, plan.visibility, git);
  if (current.planId !== plan.planId) throw new Error("Library changed after the commit preview");
  if (plan.hasBlockers) throw new Error("Commit plan contains security or portability blockers");
  if (plan.files.length === 0) return null;
  await git.run(["add", "-A", "--", ...plan.files.map((file) => file.path)], plan.library);
  await git.run(["commit", "-m", plan.message], plan.library);
  return gitHead(plan.library, git);
}

export async function fetchLibrary(root: string, git: WorkspaceGitPort = new NodeWorkspaceGitPort()): Promise<void> {
  const library = await ensureLibrary(root);
  await git.run(["-c", "credential.interactive=false", "fetch", "origin", "--prune", "--no-tags"], library, {
    nonInteractive: true,
  });
}

export async function planLibraryPull(
  root: string,
  visibility: GitPullPlan["visibility"] = "private",
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<GitPullPlan> {
  const library = await ensureLibrary(root);
  const before = await getLibraryGitStatus(library, git);
  if (before.changed) throw new Error("Library has uncommitted changes; commit or discard them before pull review");
  if (!before.head) throw new Error("Library has no local commit to fast-forward");
  await fetchLibrary(library, git);
  const branch = before.branch || DEFAULT_BRANCH;
  const remoteHead = await git.run(["rev-parse", `refs/remotes/origin/${branch}`], library);
  const ancestry = await git.run(["merge-base", "--is-ancestor", before.head, remoteHead], library).then(
    () => true,
    () => false,
  );
  if (!ancestry) throw new Error("Remote history is not a fast-forward; reconcile it explicitly");
  const files =
    before.head === remoteHead
      ? []
      : parseNullPaths(
          await git.run(["diff", "--name-only", "-z", `${before.head}..${remoteHead}`], library, { raw: true }),
        );
  const worktreeParent = await mkdtemp(path.join(tmpdir(), "dotagent-pull-review-"));
  const worktree = path.join(worktreeParent, "checkout");
  let snapshot: Awaited<ReturnType<typeof snapshotFiles>> = { snapshots: [], unsafePaths: [], secretFindings: [] };
  let errors: GitPullPlan["auditErrors"] = [];
  try {
    await git.run(["worktree", "add", "--detach", worktree, remoteHead], library);
    snapshot = await snapshotFiles(worktree, files);
    errors = auditErrors(await auditLibrary({ root: worktree, visibility }));
  } finally {
    try {
      await git.run(["worktree", "remove", "--force", worktree], library);
    } catch {
      await rm(worktree, { recursive: true, force: true });
    }
    await rm(worktreeParent, { recursive: true, force: true });
  }
  const payload = {
    kind: "git-pull" as const,
    schemaVersion: 1 as const,
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

export async function applyLibraryPull(
  plan: GitPullPlan,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<string> {
  assertPlanId(plan);
  const current = await planLibraryPull(plan.library, plan.visibility, git);
  if (current.planId !== plan.planId) throw new Error("Remote or local library changed after the pull preview");
  if (plan.hasBlockers) throw new Error("Pull plan contains security or portability blockers");
  if (plan.baseHead !== plan.remoteHead) await git.run(["merge", "--ff-only", plan.remoteHead], plan.library);
  const head = await gitHead(plan.library, git);
  if (!head) throw new Error("Pull completed without a readable Git HEAD");
  return head;
}

export async function planLibraryPush(
  root: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<GitPushPlan> {
  const library = await ensureLibrary(root);
  const status = await getLibraryGitStatus(library, git);
  if (status.changed) throw new Error("Library has uncommitted changes; review and commit them before push");
  if (!status.head) throw new Error("Library has no commit to push");
  if (!status.remoteIdentity) throw new Error("Library has no origin remote");
  const payload = {
    kind: "git-push" as const,
    schemaVersion: 1 as const,
    library,
    branch: status.branch || DEFAULT_BRANCH,
    head: status.head,
    remoteIdentity: status.remoteIdentity,
    ahead: status.ahead,
  };
  return withPlanId(payload);
}

export async function applyLibraryPush(
  plan: GitPushPlan,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<void> {
  assertPlanId(plan);
  const current = await planLibraryPush(plan.library, git);
  if (current.planId !== plan.planId) throw new Error("Library changed after the push preview");
  await git.run(["push", "-u", "origin", `HEAD:${plan.branch}`], plan.library);
}

import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeWorkspaceGitPort, type WorkspaceGitPort } from "./git-workspace.js";
import { computePlanId } from "./plan.js";

export interface GitFastForwardPlan {
  kind: "git-fast-forward";
  schemaVersion: 1;
  planId: string;
  workspace: string;
  branch: string;
  baseHead: string;
  remoteHead: string;
  files: string[];
}

function parseNullPaths(value: string): string[] {
  return value
    .split("\0")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function assertPlanId(plan: GitFastForwardPlan): void {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Git fast-forward plan is stale or modified");
}

/**
 * Fetches remote-tracking metadata and describes a clean fast-forward without
 * changing the checked-out files. Credentials remain delegated to Git.
 */
export async function planGitFastForward(
  root: string,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<GitFastForwardPlan> {
  const workspace = await realpath(path.resolve(root));
  const topLevel = await realpath(path.resolve(await git.run(["rev-parse", "--show-toplevel"], workspace)));
  if (topLevel !== workspace) throw new Error("Git fast-forward root must be the repository worktree root");
  const changed = await git.run(["status", "--porcelain=v1", "-z"], workspace, { raw: true });
  if (changed.length > 0) throw new Error("Git workspace has uncommitted changes; resolve them before review");
  const branch = await git.run(["symbolic-ref", "--quiet", "--short", "HEAD"], workspace);
  if (!branch) throw new Error("Git workspace must have a checked-out branch");
  await git.run(["remote", "get-url", "origin"], workspace);
  const baseHead = await git.run(["rev-parse", "HEAD"], workspace);
  await git.run(["-c", "credential.interactive=false", "fetch", "origin", "--prune", "--no-tags"], workspace, {
    nonInteractive: true,
  });
  const remoteHead = await git.run(["rev-parse", `refs/remotes/origin/${branch}`], workspace);
  const fastForward = await git.run(["merge-base", "--is-ancestor", baseHead, remoteHead], workspace).then(
    () => true,
    () => false,
  );
  if (!fastForward) throw new Error("Remote history is not a fast-forward; reconcile it explicitly");
  const files =
    baseHead === remoteHead
      ? []
      : parseNullPaths(
          await git.run(["diff", "--name-only", "-z", `${baseHead}..${remoteHead}`], workspace, { raw: true }),
        );
  const payload = {
    kind: "git-fast-forward" as const,
    schemaVersion: 1 as const,
    workspace,
    branch,
    baseHead,
    remoteHead,
    files,
  };
  return { ...payload, planId: computePlanId(payload) };
}

/** Runs a callback against an ephemeral checkout of the exact reviewed remote commit. */
export async function inspectGitFastForwardPlan<T>(
  plan: GitFastForwardPlan,
  inspect: (checkout: string) => T | Promise<T>,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<T> {
  assertPlanId(plan);
  const current = await planGitFastForward(plan.workspace, git);
  if (current.planId !== plan.planId) throw new Error("Remote or local Git state changed after review");
  const parent = await mkdtemp(path.join(tmpdir(), "dotagent-fast-forward-review-"));
  const checkout = path.join(parent, "checkout");
  try {
    await git.run(["worktree", "add", "--detach", checkout, plan.remoteHead], plan.workspace);
    return await inspect(checkout);
  } finally {
    try {
      await git.run(["worktree", "remove", "--force", checkout], plan.workspace);
    } catch {
      await rm(checkout, { recursive: true, force: true });
    }
    await rm(parent, { recursive: true, force: true });
  }
}

/** Applies only the exact fast-forward that was previously reviewed. */
export async function applyGitFastForwardPlan(
  plan: GitFastForwardPlan,
  git: WorkspaceGitPort = new NodeWorkspaceGitPort(),
): Promise<string> {
  assertPlanId(plan);
  const current = await planGitFastForward(plan.workspace, git);
  if (current.planId !== plan.planId) throw new Error("Remote or local Git state changed after review");
  if (plan.baseHead !== plan.remoteHead) await git.run(["merge", "--ff-only", plan.remoteHead], plan.workspace);
  return git.run(["rev-parse", "HEAD"], plan.workspace);
}

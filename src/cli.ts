#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { AgentDescriptor, Platform, SkillDelivery } from "./agents.js";
import { auditLibrary } from "./audit.js";
import { parseOwnedImportSpec, validateImportCandidates } from "./cli-import.js";
import { parseMaterializationTargetSpec } from "./cli-target.js";
import { doctorLibrary } from "./doctor.js";
import { GitDependencyResolver } from "./git-resolver.js";
import {
  applyLibraryClone,
  applyLibraryCommit,
  applyLibraryGitInitialization,
  applyLibraryPull,
  applyLibraryPush,
  type GitClonePlan,
  type GitCommitPlan,
  type GitInitializePlan,
  type GitPullPlan,
  type GitPushPlan,
  getLibraryGitStatus,
  planLibraryClone,
  planLibraryCommit,
  planLibraryGitInitialization,
  planLibraryPull,
  planLibraryPush,
} from "./git-workspace.js";
import { type ImportCandidate, type ImportPlan, planImport } from "./import.js";
import { applyImportPlan, recoverImport } from "./import-apply.js";
import { applyInitializeLibraryPlan, type InitializeLibraryPlan, planInitializeLibrary } from "./init.js";
import { scanLibrary } from "./inventory.js";
import { type MaterializationPlan, planMaterialization } from "./materialize.js";
import { applyMaterializationPlan, recoverMaterialization } from "./materialize-apply.js";
import { prepareMaterializationInventory } from "./prepared-library.js";
import { applyLibraryResolutionPlan, type LibraryResolutionPlan, planLibraryResolution } from "./sources.js";
import { existingTargetsForPlan, getMaterializationStatus } from "./status.js";

type ApplicablePlan =
  | InitializeLibraryPlan
  | MaterializationPlan
  | ImportPlan
  | LibraryResolutionPlan
  | GitClonePlan
  | GitInitializePlan
  | GitCommitPlan
  | GitPullPlan
  | GitPushPlan;

async function emitPlan(plan: ApplicablePlan, output: string | undefined, json: boolean, label: string): Promise<void> {
  if (output)
    await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  if (json || !output) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else
    process.stdout.write(
      `${label} plan ${plan.planId} written to ${path.resolve(output)}. Review it, then run apply with --yes.\n`,
    );
}

async function main(): Promise<number> {
  const [command = "help", ...args] = process.argv.slice(2);
  const valueOptions = new Set(["--name", "--out", "--target", "--owned", "--candidate-file", "--remote", "--message"]);
  const optionValues = (name: string): string[] =>
    args.flatMap((argument, index) => {
      const value = args[index + 1];
      return argument === name && value ? [value] : [];
    });
  const optionValue = (name: string): string | undefined => optionValues(name)[0];
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (valueOptions.has(argument)) {
      index += 1;
      continue;
    }
    if (!argument.startsWith("--")) positional.push(argument);
  }
  const directory = positional[0] ?? ".";
  const json = args.includes("--json");
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(
      "beautyfree-dotagent init [library-directory] [--name package-name] [--out plan.json] [--json]\nbeautyfree-dotagent inspect [library-directory] [--json]\nbeautyfree-dotagent import [library-directory] --owned skill=path [--candidate-file candidates.json] [--out plan.json] [--json]\nbeautyfree-dotagent resolve [library-directory] [--out plan.json] [--json]\nbeautyfree-dotagent doctor [library-directory] [--json]\nbeautyfree-dotagent audit [library-directory] [--public] [--json]\nbeautyfree-dotagent git-init [library-directory] [--remote git-url] [--out plan.json] [--json]\nbeautyfree-dotagent clone <git-url> <library-directory> [--out plan.json] [--json]\nbeautyfree-dotagent commit [library-directory] --message text [--public|--team] [--out plan.json] [--json]\nbeautyfree-dotagent sync [library-directory] [--pull|--push] [--public|--team] [--out plan.json] [--json]\nbeautyfree-dotagent status [library-directory] [--json]\nbeautyfree-dotagent plan [library-directory] --target slug=mode=path [--out plan.json] [--json]\nbeautyfree-dotagent apply <plan.json> --yes [--json]\nbeautyfree-dotagent recover [library-directory] --yes [--json]\n",
    );
    return 0;
  }
  if (command === "init") {
    const root = path.resolve(directory);
    const requestedName = optionValue("--name");
    const plan = planInitializeLibrary(root, requestedName);
    await emitPlan(plan, optionValue("--out"), json, "Initialize");
    return 0;
  }
  if (command === "resolve") {
    const root = path.resolve(directory);
    const plan = await planLibraryResolution(
      root,
      new GitDependencyResolver({ cacheRoot: path.join(root, ".dotagent", "cache", "git") }),
    );
    await emitPlan(plan, optionValue("--out"), json, "Dependency resolution");
    return 0;
  }
  if (command === "import") {
    const root = path.resolve(directory);
    const candidates: ImportCandidate[] = optionValues("--owned").map((spec) => parseOwnedImportSpec(spec));
    for (const candidateFile of optionValues("--candidate-file")) {
      const absoluteFile = path.resolve(candidateFile);
      const parsed = validateImportCandidates(JSON.parse(await readFile(absoluteFile, "utf8")));
      for (const candidate of parsed) {
        if (
          (candidate.kind === "owned" ||
            candidate.kind === "vendored" ||
            candidate.kind === "local-only" ||
            candidate.kind === "excluded") &&
          candidate.sourcePath
        ) {
          candidate.sourcePath = path.resolve(path.dirname(absoluteFile), candidate.sourcePath);
        }
        candidates.push(candidate);
      }
    }
    if (candidates.length === 0) throw new Error("Import requires at least one --owned skill=path or --candidate-file");
    const plan = await planImport(root, candidates);
    const output = optionValue("--out");
    if (output)
      await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (json || !output) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    else
      process.stdout.write(
        `Import plan ${plan.planId} written to ${path.resolve(output)}. Review it, then run apply with --yes.\n`,
      );
    return plan.hasConflicts || plan.secretFindings.length > 0 ? 1 : 0;
  }
  if (command === "doctor") {
    const report = await doctorLibrary({ root: path.resolve(directory) });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (report.issues.length === 0)
      process.stdout.write(`Library ${report.library?.name ?? report.root} is healthy.\n`);
    else
      for (const entry of report.issues)
        process.stdout.write(`${entry.severity?.toUpperCase()}: ${entry.message}\nNext: ${entry.remediation}\n`);
    return report.ok ? 0 : 1;
  }
  if (command === "audit") {
    const report = await auditLibrary({
      root: path.resolve(directory),
      visibility: args.includes("--public") ? "public" : "private",
    });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (report.issues.length === 0) process.stdout.write("No structural or licensing issues found.\n");
    else
      for (const entry of report.issues)
        process.stdout.write(`${entry.severity?.toUpperCase()}: ${entry.message}\nNext: ${entry.remediation}\n`);
    return report.ok ? 0 : 1;
  }
  if (command === "git-init") {
    const root = path.resolve(directory);
    const plan = await planLibraryGitInitialization(root, optionValue("--remote"));
    await emitPlan(plan, optionValue("--out"), json, "Git initialize");
    return 0;
  }
  if (command === "clone") {
    const remote = positional[0];
    const target = positional[1];
    if (!remote || !target) throw new Error("Clone requires a Git URL and a new library directory");
    const plan = await planLibraryClone(remote, path.resolve(target));
    await emitPlan(plan, optionValue("--out"), json, "Clone");
    return 0;
  }
  if (command === "commit") {
    const message = optionValue("--message");
    if (!message) throw new Error("Commit preview requires --message");
    const visibility = args.includes("--public") ? "public" : args.includes("--team") ? "team" : "private";
    const commitPlan = await planLibraryCommit(path.resolve(directory), message, visibility);
    await emitPlan(commitPlan, optionValue("--out"), json, "Commit");
    return commitPlan.hasBlockers ? 1 : 0;
  }
  if (command === "sync") {
    const root = path.resolve(directory);
    if (args.includes("--pull") && args.includes("--push"))
      throw new Error("Choose either --pull or --push for one reviewed operation");
    if (args.includes("--pull")) {
      const visibility = args.includes("--public") ? "public" : args.includes("--team") ? "team" : "private";
      const pullPlan = await planLibraryPull(root, visibility);
      await emitPlan(pullPlan, optionValue("--out"), json, "Pull");
      return pullPlan.hasBlockers ? 1 : 0;
    }
    if (args.includes("--push")) {
      const pushPlan = await planLibraryPush(root);
      await emitPlan(pushPlan, optionValue("--out"), json, "Push");
      return 0;
    }
    const gitStatus = await getLibraryGitStatus(root);
    process.stdout.write(
      json
        ? `${JSON.stringify(gitStatus, null, 2)}\n`
        : `${gitStatus.branch}: ${gitStatus.changed ? "uncommitted changes" : "clean"}, ${gitStatus.ahead} ahead, ${gitStatus.behind} behind.\n`,
    );
    return 0;
  }
  if (command === "status") {
    const status = await getMaterializationStatus(path.resolve(directory));
    if (json) process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    else if (status.targets.length === 0) process.stdout.write("No materialized targets are managed yet.\n");
    else
      for (const target of status.targets) process.stdout.write(`${target.agent}/${target.skill}: ${target.health}\n`);
    return status.targets.some((target) => target.health === "invalid") ? 1 : 0;
  }
  if (command === "plan") {
    const root = path.resolve(directory);
    const inventory = await prepareMaterializationInventory({ root });
    const targetSpecs = optionValues("--target").map(parseMaterializationTargetSpec);
    if (targetSpecs.length === 0) throw new Error("At least one explicit --target slug=mode=path is required");
    const platform = process.platform as Platform;
    if (!["darwin", "linux", "win32"].includes(platform)) throw new Error(`Unsupported platform: ${process.platform}`);
    const targets = await Promise.all(
      targetSpecs.map(async (spec) => {
        const root = spec.root;
        const delivery: SkillDelivery =
          spec.mode === "native"
            ? { kind: "native-shared" }
            : spec.mode === "copy"
              ? { kind: "copy-only", roots: [root ?? ""] }
              : { kind: "per-skill-link", roots: [root ?? ""] };
        const descriptor: AgentDescriptor = {
          slug: spec.slug,
          displayName: spec.slug,
          platforms: [platform],
          detection: [],
          skills: [delivery],
        };
        return {
          descriptor,
          platform,
          detected: true,
          mode: spec.mode,
          ...(root ? { root: path.resolve(root) } : {}),
          existing: root
            ? await existingTargetsForPlan(
                root,
                spec.slug,
                path.resolve(root),
                inventory.ownedSkills.map((skill) => skill.name),
              )
            : {},
        };
      }),
    );
    const plan = planMaterialization(inventory, targets);
    const output = optionValue("--out");
    if (output)
      await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (json || !output) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    else
      process.stdout.write(
        `Plan ${plan.planId} written to ${path.resolve(output)} with ${plan.operations.length} operations.\n`,
      );
    return plan.hasConflicts ? 1 : 0;
  }
  if (command === "apply") {
    if (!args.includes("--yes")) throw new Error("Refusing to apply without explicit --yes confirmation");
    const plan = JSON.parse(await readFile(path.resolve(directory), "utf8")) as ApplicablePlan;
    if (plan.kind === "initialize-library") {
      await applyInitializeLibraryPlan(plan);
      const result = {
        ok: true,
        root: plan.root,
        plan_id: plan.planId,
        created: plan.files.map((file) => file.path),
      };
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `Created the library at ${plan.root}.\n`);
    } else if (plan.kind === "resolve-library-dependencies") {
      await applyLibraryResolutionPlan(plan);
      process.stdout.write(
        json
          ? `${JSON.stringify({ ok: true, root: plan.library, plan_id: plan.planId, changes: plan.changes }, null, 2)}\n`
          : `Wrote ${plan.lock.resolved ? Object.keys(plan.lock.resolved).length : 0} immutable dependencies to ${plan.library}.\n`,
      );
    } else if (plan.kind === "import") {
      const result = await applyImportPlan(plan);
      process.stdout.write(
        json
          ? `${JSON.stringify(result, null, 2)}\n`
          : `Imported ${result.copied} owned skills and recorded ${result.dependenciesRecorded} dependencies from plan ${result.planId}.\n`,
      );
    } else if (plan.kind === "materialize") {
      const result = await applyMaterializationPlan(plan);
      process.stdout.write(
        json
          ? `${JSON.stringify(result, null, 2)}\n`
          : `Applied ${result.applied} operations from plan ${result.planId}.\n`,
      );
    } else if (plan.kind === "git-initialize") {
      await applyLibraryGitInitialization(plan);
      const status = await getLibraryGitStatus(plan.library);
      process.stdout.write(
        json
          ? `${JSON.stringify({ ok: true, root: plan.library, plan_id: plan.planId, ...status }, null, 2)}\n`
          : `Git workspace initialized on ${status.branch}${status.remoteIdentity ? ` with ${status.remoteIdentity}` : ""}.\n`,
      );
    } else if (plan.kind === "git-clone") {
      await applyLibraryClone(plan);
      const status = await getLibraryGitStatus(plan.destination);
      process.stdout.write(
        json
          ? `${JSON.stringify({ ok: true, root: plan.destination, plan_id: plan.planId, ...status }, null, 2)}\n`
          : `Cloned the library to ${plan.destination}.\n`,
      );
    } else if (plan.kind === "git-commit") {
      const head = await applyLibraryCommit(plan);
      process.stdout.write(
        json
          ? `${JSON.stringify({ ok: true, head }, null, 2)}\n`
          : head
            ? `Created commit ${head}.\n`
            : "No portable changes to commit.\n",
      );
    } else if (plan.kind === "git-pull") {
      const head = await applyLibraryPull(plan);
      process.stdout.write(
        json ? `${JSON.stringify({ ok: true, head }, null, 2)}\n` : `Fast-forwarded the library to ${head}.\n`,
      );
    } else if (plan.kind === "git-push") {
      await applyLibraryPush(plan);
      process.stdout.write(
        json
          ? `${JSON.stringify({ ok: true, head: plan.head }, null, 2)}\n`
          : `Pushed ${plan.head} to ${plan.remoteIdentity}.\n`,
      );
    } else {
      throw new Error("Unsupported plan kind");
    }
    return 0;
  }
  if (command === "recover") {
    if (!args.includes("--yes")) throw new Error("Refusing recovery without explicit --yes confirmation");
    const root = path.resolve(directory);
    const imported = await recoverImport(root);
    const materialized = await recoverMaterialization(root);
    const recovered = imported !== "none" || materialized;
    const result = { recovered, import: imported, materialization: materialized };
    process.stdout.write(
      json
        ? `${JSON.stringify(result, null, 2)}\n`
        : recovered
          ? "Recovered unfinished dotagent operations.\n"
          : "No unfinished operation found.\n",
    );
    return 0;
  }
  if (command !== "inspect") {
    process.stderr.write(`Unknown command: ${command}\nRun beautyfree-dotagent --help.\n`);
    return 2;
  }
  const root = path.resolve(directory);
  const result = await scanLibrary(root);
  if (!result.ok) {
    if (json) process.stdout.write(`${JSON.stringify({ ok: false, issues: result.issues }, null, 2)}\n`);
    else for (const issue of result.issues) process.stderr.write(`${issue.message}\nNext: ${issue.remediation}\n`);
    return 1;
  }
  const summary = {
    ok: true,
    root: result.value.root,
    name: result.value.name,
    version: result.value.version,
    owned_skills: result.value.ownedSkills.length,
    owned_files: result.value.ownedSkills.reduce((sum, skill) => sum + skill.fileCount, 0),
    owned_bytes: result.value.ownedSkills.reduce((sum, skill) => sum + skill.bytes, 0),
    dependencies: result.value.dependencyCount,
    lockfile: result.value.locked,
  };
  process.stdout.write(
    json
      ? `${JSON.stringify(summary, null, 2)}\n`
      : `${summary.name}@${summary.version}: ${summary.owned_skills} owned skills, ${summary.dependencies} dependencies${summary.lockfile ? ", locked" : ", no lockfile"}\n`,
  );
  return 0;
}

process.exitCode = await main();

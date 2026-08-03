#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "./init.js";
import { scanLibrary } from "./inventory.js";
import { loadLibrary } from "./library.js";
import { GitDependencyResolver } from "./git-resolver.js";
import { applyResolutionPlan, planResolveDependencies } from "./sources.js";
import { doctorLibrary } from "./doctor.js";
import { getMaterializationStatus } from "./status.js";

async function main(): Promise<number> {
  const [command = "help", ...args] = process.argv.slice(2);
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const positional = args.filter((argument, index) => !argument.startsWith("--") && args[index - 1] !== "--name");
  const directory = positional[0] ?? ".";
  const json = args.includes("--json");
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write("beautyfree-dotagent init [library-directory] [--name package-name] [--json]\nbeautyfree-dotagent inspect [library-directory] [--json]\nbeautyfree-dotagent resolve [library-directory] [--write] [--json]\nbeautyfree-dotagent doctor [library-directory] [--json]\nbeautyfree-dotagent status [library-directory] [--json]\n");
    return 0;
  }
  if (command === "init") {
    const root = path.resolve(directory);
    const requestedName = optionValue("--name");
    const plan = planInitializeLibrary(root, requestedName);
    await applyInitializeLibraryPlan(plan);
    const result = { ok: true, root, plan_id: plan.planId, created: plan.files.map((file) => file.path) };
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `Created ${requestedName ?? path.basename(root)} at ${root}.\n`);
    return 0;
  }
  if (command === "resolve") {
    const root = path.resolve(directory);
    const loaded = await loadLibrary(root);
    if (!loaded.ok) {
      if (json) process.stdout.write(`${JSON.stringify({ ok: false, issues: loaded.issues }, null, 2)}\n`);
      else for (const issue of loaded.issues) process.stderr.write(`${issue.message}\nNext: ${issue.remediation}\n`);
      return 1;
    }
    const plan = await planResolveDependencies(loaded.value.manifest, new GitDependencyResolver(), loaded.value.lock);
    if (args.includes("--write")) await applyResolutionPlan(root, plan);
    const result = { ok: true, root, plan_id: plan.planId, written: args.includes("--write"), changes: plan.changes, lock: plan.lock };
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${plan.changes.length} dependency changes planned${args.includes("--write") ? " and written" : " (preview only; pass --write to save)"}.\n`);
    return 0;
  }
  if (command === "doctor") {
    const report = await doctorLibrary({ root: path.resolve(directory) });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (report.issues.length === 0) process.stdout.write(`Library ${report.library?.name ?? report.root} is healthy.\n`);
    else for (const entry of report.issues) process.stdout.write(`${entry.severity?.toUpperCase()}: ${entry.message}\nNext: ${entry.remediation}\n`);
    return report.ok ? 0 : 1;
  }
  if (command === "status") {
    const status = await getMaterializationStatus(path.resolve(directory));
    if (json) process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    else if (status.targets.length === 0) process.stdout.write("No materialized targets are managed yet.\n");
    else for (const target of status.targets) process.stdout.write(`${target.agent}/${target.skill}: ${target.health}\n`);
    return status.targets.some((target) => target.health === "invalid") ? 1 : 0;
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
  process.stdout.write(json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.name}@${summary.version}: ${summary.owned_skills} owned skills, ${summary.dependencies} dependencies${summary.lockfile ? ", locked" : ", no lockfile"}\n`);
  return 0;
}

process.exitCode = await main();

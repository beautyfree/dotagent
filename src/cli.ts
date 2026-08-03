#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "./init.js";
import { scanLibrary } from "./inventory.js";
import { loadLibrary } from "./library.js";
import { GitDependencyResolver } from "./git-resolver.js";
import { applyResolutionPlan, planResolveDependencies } from "./sources.js";
import { doctorLibrary } from "./doctor.js";
import { auditLibrary } from "./audit.js";
import { getMaterializationStatus } from "./status.js";
import { existingTargetsForPlan } from "./status.js";
import { parseMaterializationTargetSpec } from "./cli-target.js";
import { planMaterialization, type MaterializationPlan } from "./materialize.js";
import { applyMaterializationPlan, recoverMaterialization } from "./materialize-apply.js";
import type { AgentDescriptor, Platform, SkillDelivery } from "./agents.js";
import { planImport, type ImportCandidate, type ImportPlan } from "./import.js";
import { applyImportPlan, recoverImport } from "./import-apply.js";
import { parseOwnedImportSpec, validateImportCandidates } from "./cli-import.js";

async function main(): Promise<number> {
  const [command = "help", ...args] = process.argv.slice(2);
  const valueOptions = new Set(["--name", "--out", "--target", "--owned", "--candidate-file"]);
  const optionValues = (name: string): string[] => args.flatMap((argument, index) => argument === name && args[index + 1] ? [args[index + 1]!] : []);
  const optionValue = (name: string): string | undefined => optionValues(name)[0];
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (valueOptions.has(argument)) { index += 1; continue; }
    if (!argument.startsWith("--")) positional.push(argument);
  }
  const directory = positional[0] ?? ".";
  const json = args.includes("--json");
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write("beautyfree-dotagent init [library-directory] [--name package-name] [--json]\nbeautyfree-dotagent inspect [library-directory] [--json]\nbeautyfree-dotagent import [library-directory] --owned skill=path [--candidate-file candidates.json] [--out plan.json] [--json]\nbeautyfree-dotagent resolve [library-directory] [--write] [--json]\nbeautyfree-dotagent doctor [library-directory] [--json]\nbeautyfree-dotagent audit [library-directory] [--public] [--json]\nbeautyfree-dotagent status [library-directory] [--json]\nbeautyfree-dotagent plan [library-directory] --target slug=mode=path [--out plan.json] [--json]\nbeautyfree-dotagent apply <plan.json> --yes [--json]\nbeautyfree-dotagent recover [library-directory] --yes [--json]\n");
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
    const plan = await planResolveDependencies(loaded.value.manifest, new GitDependencyResolver({ cacheRoot: path.join(root, ".dotagent", "cache", "git") }), loaded.value.lock);
    if (args.includes("--write")) await applyResolutionPlan(root, plan);
    const result = { ok: true, root, plan_id: plan.planId, written: args.includes("--write"), changes: plan.changes, lock: plan.lock };
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${plan.changes.length} dependency changes planned${args.includes("--write") ? " and written" : " (preview only; pass --write to save)"}.\n`);
    return 0;
  }
  if (command === "import") {
    const root = path.resolve(directory);
    const candidates: ImportCandidate[] = optionValues("--owned").map((spec) => parseOwnedImportSpec(spec));
    for (const candidateFile of optionValues("--candidate-file")) {
      const absoluteFile = path.resolve(candidateFile);
      const parsed = validateImportCandidates(JSON.parse(await readFile(absoluteFile, "utf8")));
      for (const candidate of parsed) {
        if ((candidate.kind === "owned" || candidate.kind === "local-only" || candidate.kind === "excluded") && candidate.sourcePath) {
          candidate.sourcePath = path.resolve(path.dirname(absoluteFile), candidate.sourcePath);
        }
        candidates.push(candidate);
      }
    }
    if (candidates.length === 0) throw new Error("Import requires at least one --owned skill=path or --candidate-file");
    const plan = await planImport(root, candidates);
    const output = optionValue("--out");
    if (output) await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (json || !output) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    else process.stdout.write(`Import plan ${plan.planId} written to ${path.resolve(output)}. Review it, then run apply with --yes.\n`);
    return plan.hasConflicts || plan.secretFindings.length > 0 ? 1 : 0;
  }
  if (command === "doctor") {
    const report = await doctorLibrary({ root: path.resolve(directory) });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (report.issues.length === 0) process.stdout.write(`Library ${report.library?.name ?? report.root} is healthy.\n`);
    else for (const entry of report.issues) process.stdout.write(`${entry.severity?.toUpperCase()}: ${entry.message}\nNext: ${entry.remediation}\n`);
    return report.ok ? 0 : 1;
  }
  if (command === "audit") {
    const report = await auditLibrary({ root: path.resolve(directory), visibility: args.includes("--public") ? "public" : "private" });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else if (report.issues.length === 0) process.stdout.write("No structural or licensing issues found.\n");
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
  if (command === "plan") {
    const root = path.resolve(directory);
    const scanned = await scanLibrary(root);
    if (!scanned.ok) throw new Error(scanned.issues.map((issue) => issue.message).join("; "));
    const targetSpecs = optionValues("--target").map(parseMaterializationTargetSpec);
    if (targetSpecs.length === 0) throw new Error("At least one explicit --target slug=mode=path is required");
    const platform = process.platform as Platform;
    if (!["darwin", "linux", "win32"].includes(platform)) throw new Error(`Unsupported platform: ${process.platform}`);
    const targets = await Promise.all(targetSpecs.map(async (spec) => {
      const delivery: SkillDelivery = spec.mode === "native"
        ? { kind: "native-shared" }
        : spec.mode === "copy"
          ? { kind: "copy-only", roots: [spec.root!] }
          : { kind: "per-skill-link", roots: [spec.root!] };
      const descriptor: AgentDescriptor = { slug: spec.slug, displayName: spec.slug, platforms: [platform], detection: [], skills: [delivery] };
      return {
        descriptor,
        platform,
        detected: true,
        mode: spec.mode,
        ...(spec.root ? { root: path.resolve(spec.root) } : {}),
        existing: spec.root
          ? await existingTargetsForPlan(root, spec.slug, path.resolve(spec.root), scanned.value.ownedSkills.map((skill) => skill.name))
          : {},
      };
    }));
    const plan = planMaterialization(scanned.value, targets);
    const output = optionValue("--out");
    if (output) await writeFile(path.resolve(output), `${JSON.stringify(plan, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (json || !output) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    else process.stdout.write(`Plan ${plan.planId} written to ${path.resolve(output)} with ${plan.operations.length} operations.\n`);
    return plan.hasConflicts ? 1 : 0;
  }
  if (command === "apply") {
    if (!args.includes("--yes")) throw new Error("Refusing to apply without explicit --yes confirmation");
    const plan = JSON.parse(await readFile(path.resolve(directory), "utf8")) as MaterializationPlan | ImportPlan;
    if (plan.kind === "import") {
      const result = await applyImportPlan(plan);
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `Imported ${result.copied} owned skills and recorded ${result.dependenciesRecorded} dependencies from plan ${result.planId}.\n`);
    } else {
      const result = await applyMaterializationPlan(plan);
      process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `Applied ${result.applied} operations from plan ${result.planId}.\n`);
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
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : recovered ? "Recovered unfinished dotagent operations.\n" : "No unfinished operation found.\n");
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
  process.stdout.write(json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.name}@${summary.version}: ${summary.owned_skills} owned skills, ${summary.dependencies} dependencies${summary.lockfile ? ", locked" : ", no lockfile"}\n`);
  return 0;
}

process.exitCode = await main();

#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { applyInitializeLibraryPlan, planInitializeLibrary } from "./init.js";
import { scanLibrary } from "./inventory.js";

async function main(): Promise<number> {
  const [command = "help", directory = "."] = process.argv.slice(2);
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write("beautyfree-dotagent init [library-directory] [--name package-name] [--json]\nbeautyfree-dotagent inspect [library-directory] [--json]\n");
    return 0;
  }
  if (command === "init") {
    const root = path.resolve(directory === "--json" ? "." : directory);
    const nameFlag = process.argv.indexOf("--name");
    const requestedName = nameFlag >= 0 ? process.argv[nameFlag + 1] : undefined;
    const plan = planInitializeLibrary(root, requestedName);
    await applyInitializeLibraryPlan(plan);
    const result = { ok: true, root, plan_id: plan.planId, created: plan.files.map((file) => file.path) };
    process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify(result, null, 2)}\n` : `Created ${requestedName ?? path.basename(root)} at ${root}.\n`);
    return 0;
  }
  if (command !== "inspect") {
    process.stderr.write(`Unknown command: ${command}\nRun beautyfree-dotagent --help.\n`);
    return 2;
  }
  const root = path.resolve(directory === "--json" ? "." : directory);
  const json = process.argv.includes("--json");
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

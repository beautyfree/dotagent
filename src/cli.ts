#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { loadLibrary } from "./library.js";

async function main(): Promise<number> {
  const [command = "help", directory = "."] = process.argv.slice(2);
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write("beautyfree-dotagent inspect [library-directory] [--json]\n");
    return 0;
  }
  if (command !== "inspect") {
    process.stderr.write(`Unknown command: ${command}\nRun beautyfree-dotagent --help.\n`);
    return 2;
  }
  const root = path.resolve(directory === "--json" ? "." : directory);
  const json = process.argv.includes("--json");
  const result = await loadLibrary(root);
  if (!result.ok) {
    if (json) process.stdout.write(`${JSON.stringify({ ok: false, issues: result.issues }, null, 2)}\n`);
    else for (const issue of result.issues) process.stderr.write(`${issue.message}\nNext: ${issue.remediation}\n`);
    return 1;
  }
  const summary = {
    ok: true,
    root: result.value.root,
    name: result.value.manifest.name,
    version: result.value.manifest.version,
    owned_skills: result.value.manifest.skills.length,
    dependencies: Object.keys(result.value.manifest.dependencies).length,
    lockfile: result.value.lock !== null,
  };
  process.stdout.write(json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.name}@${summary.version}: ${summary.owned_skills} owned skills, ${summary.dependencies} dependencies${summary.lockfile ? ", locked" : ", no lockfile"}\n`);
  return 0;
}

process.exitCode = await main();

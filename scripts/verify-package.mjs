import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, npm_config_ignore_scripts: "true" },
}));
const files = new Set(packed[0]?.files?.map((entry) => entry.path) ?? []);
const required = ["package.json", "README.md", "LICENSE", "NOTICE.md", "dist/index.js", "dist/index.d.ts", "dist/cli.js"];
for (const file of required) {
  if (!files.has(file)) throw new Error(`Package is missing required file: ${file}`);
}
for (const file of files) {
  if (file.startsWith("src/") || file.startsWith("test/") || file.startsWith(".github/") || file === "biome.json") {
    throw new Error(`Development-only file leaked into package: ${file}`);
  }
}
const cli = readFileSync(new URL("dist/cli.js", root), "utf8");
if (!cli.startsWith("#!/usr/bin/env node")) throw new Error("Published CLI is missing its Node shebang");
for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
  for (const field of ["types", "import"]) {
    const relative = target?.[field]?.replace(/^\.\//, "");
    if (!relative || !files.has(relative)) throw new Error(`Export ${subpath} has no packaged ${field} target`);
  }
}
process.stdout.write(`Verified ${files.size} package files and ${Object.keys(manifest.exports).length} export paths.\n`);

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
const required = [
  "package.json",
  "CHANGELOG.md",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "docs/README.md",
  "docs/rfc-210-compatibility.md",
  "docs/migrating-from-skiller.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/cli.js",
  "schemas/skills.schema.json",
  "schemas/skills-lock.schema.json",
  "schemas/dotagents.schema.json",
];
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
  if (typeof target === "string") {
    const relative = target.replace(/^\.\//, "");
    if (!files.has(relative)) throw new Error(`Export ${subpath} has no packaged target`);
    continue;
  }
  for (const field of ["types", "import"]) {
    const relative = target?.[field]?.replace(/^\.\//, "");
    if (!relative || !files.has(relative)) throw new Error(`Export ${subpath} has no packaged ${field} target`);
  }
}
process.stdout.write(`Verified ${files.size} package files and ${Object.keys(manifest.exports).length} export paths.\n`);

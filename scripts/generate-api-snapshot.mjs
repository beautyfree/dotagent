import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const outputPath = path.join(root, "api-snapshot.json");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");

if (write === check) throw new Error("Choose exactly one of --write or --check");

const entries = [];
for (const [subpath, target] of Object.entries(packageJson.exports ?? {}).sort(([left], [right]) =>
  left.localeCompare(right, "en"),
)) {
  if (!target || typeof target !== "object" || Array.isArray(target) || typeof target.types !== "string") continue;
  const declaration = await readFile(path.join(root, target.types), "utf8");
  entries.push({
    subpath,
    types: target.types,
    sha256: createHash("sha256").update(declaration).digest("hex"),
  });
}

const snapshot = `${JSON.stringify(
  {
    schema_version: 1,
    package: packageJson.name,
    note: "Update deliberately after reviewing the generated declaration diff.",
    exports: entries,
  },
  null,
  2,
)}\n`;

if (write) {
  await writeFile(outputPath, snapshot, "utf8");
  console.log(`Wrote ${path.relative(root, outputPath)} for ${entries.length} typed exports.`);
} else {
  let committed = "";
  try {
    committed = await readFile(outputPath, "utf8");
  } catch {
    throw new Error("api-snapshot.json is missing; run bun run api:generate and review it");
  }
  if (committed !== snapshot) {
    throw new Error("Public declaration surface changed; run bun run api:generate and review the declaration diff");
  }
  console.log(`Verified API snapshot for ${entries.length} typed exports.`);
}

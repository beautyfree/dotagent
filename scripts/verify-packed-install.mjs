import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const scratch = mkdtempSync(join(tmpdir(), "dotagents-pack-"));

function run(file, args, options = {}) {
  return execFileSync(file, args, {
    cwd: options.cwd ?? scratch,
    encoding: "utf8",
    env: { ...process.env, npm_config_ignore_scripts: "true", ...options.env },
  });
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", scratch], { cwd: root }));
  const tarballName = basename(packed[0]?.filename ?? "");
  if (!tarballName.endsWith(".tgz")) throw new Error("npm pack did not produce a tarball");
  const tarball = join(scratch, tarballName);

  writeFileSync(
    join(scratch, "package.json"),
    `${JSON.stringify({ name: "dotagents-package-smoke", private: true, type: "module" })}\n`,
  );
  run("npm", ["install", "--ignore-scripts", "--no-package-lock", tarball]);

  run(process.execPath, [
    "--input-type=module",
    "--eval",
    "import { planInitializeLibrary } from 'dotagents'; if (typeof planInitializeLibrary !== 'function') process.exit(1);",
  ]);
  const cli = join(scratch, "node_modules", manifest.name, "dist", "cli.js");
  const help = run(process.execPath, [cli, "--help"]);
  if (!help.includes("dotagents init")) throw new Error("Installed CLI did not print its command help");

  process.stdout.write(`Installed and exercised ${manifest.name}@${manifest.version} from its packed tarball.\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

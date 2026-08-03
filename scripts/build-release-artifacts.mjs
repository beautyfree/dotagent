import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(root, process.argv[2] ?? "release-artifacts");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const packed = JSON.parse(execFileSync("npm", ["pack", "--json", "--pack-destination", output], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, npm_config_ignore_scripts: "true" },
}));
const filename = basename(packed[0]?.filename ?? "");
if (!filename.endsWith(".tgz")) throw new Error("npm pack did not produce a tarball");
const tarball = resolve(output, filename);
const sha256 = createHash("sha256").update(readFileSync(tarball)).digest("hex");
writeFileSync(resolve(output, `${filename}.sha256`), `${sha256}  ${filename}\n`);

const sbom = execFileSync("npm", ["sbom", "--sbom-format", "cyclonedx"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
JSON.parse(sbom);
writeFileSync(resolve(output, "dotagent.sbom.cdx.json"), `${sbom.trim()}\n`);
writeFileSync(resolve(output, "release-manifest.json"), `${JSON.stringify({
  package: manifest.name,
  version: manifest.version,
  tarball: filename,
  sha256,
  source_commit: process.env.GITHUB_SHA ?? null,
}, null, 2)}\n`);
process.stdout.write(`Built ${filename}, checksum, CycloneDX SBOM, and release manifest.\n`);

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { extractReleaseNotes } from "./release-notes.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const output = resolve(root, process.argv[2] ?? "release-artifacts");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceCommit = (process.env.GITHUB_SHA ?? currentHead).trim();
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("Release source commit must be an immutable Git SHA");
if (sourceCommit !== currentHead) throw new Error("Release source commit does not match the checked-out Git HEAD");
const sourceStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (sourceStatus) throw new Error("Release artifacts require a clean source checkout");

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function deterministicUuid(value) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
const sha256 = sha256File(tarball);
writeFileSync(resolve(output, `${filename}.sha256`), `${sha256}  ${filename}\n`);

const sbom = JSON.parse(execFileSync("npm", ["sbom", "--sbom-format", "cyclonedx"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
}));
const sourceTimestamp = execFileSync("git", ["show", "-s", "--format=%cI", sourceCommit], {
  cwd: root,
  encoding: "utf8",
}).trim();
sbom.serialNumber = `urn:uuid:${deterministicUuid(`${manifest.name}\0${manifest.version}\0${sourceCommit}\0${sha256}`)}`;
sbom.metadata = { ...sbom.metadata, timestamp: sourceTimestamp };
writeFileSync(resolve(output, "dotagents.sbom.cdx.json"), `${JSON.stringify(sbom, null, 2)}\n`);
const documentation = [
  { source: "CHANGELOG.md", target: "CHANGELOG.md" },
  { source: "docs/rfc-210-compatibility.md", target: "rfc-210-compatibility.md" },
];
for (const entry of documentation) copyFileSync(resolve(root, entry.source), resolve(output, entry.target));
const releaseNotes = extractReleaseNotes(readFileSync(resolve(root, "CHANGELOG.md"), "utf8"), manifest.version, {
  allowUnreleased: manifest.private === true || manifest.version === "0.0.0",
});
writeFileSync(resolve(output, "RELEASE_NOTES.md"), releaseNotes);
const releaseDocumentation = [...documentation.map((entry) => entry.target), "RELEASE_NOTES.md"];

const releaseManifest = {
  package: manifest.name,
  version: manifest.version,
  source_repository: manifest.repository?.url ?? null,
  source_commit: sourceCommit,
  node_engine: manifest.engines?.node ?? null,
  tarball: filename,
  tarball_sha256: sha256,
  npm_shasum: packed[0]?.shasum ?? null,
  npm_integrity: packed[0]?.integrity ?? null,
  package_files: packed[0]?.entryCount ?? packed[0]?.files?.length ?? null,
  package_size: packed[0]?.size ?? null,
  unpacked_size: packed[0]?.unpackedSize ?? null,
  sbom: {
    file: "dotagents.sbom.cdx.json",
    sha256: sha256File(resolve(output, "dotagents.sbom.cdx.json")),
  },
  documentation: releaseDocumentation.map((file) => ({
    file,
    sha256: sha256File(resolve(output, file)),
  })),
};
writeFileSync(resolve(output, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`);

const checksummed = [
  filename,
  "dotagents.sbom.cdx.json",
  ...releaseDocumentation,
  "release-manifest.json",
];
writeFileSync(
  resolve(output, "SHA256SUMS"),
  `${checksummed.map((file) => `${sha256File(resolve(output, file))}  ${file}`).join("\n")}\n`,
);
process.stdout.write(`Built ${filename}, checksums, CycloneDX SBOM, documentation, and release manifest.\n`);

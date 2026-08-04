import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { extractReleaseNotes } from "./release-notes.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const artifactRoot = resolve(root, process.argv[2] ?? "release-artifacts");
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(resolve(artifactRoot, "release-manifest.json"), "utf8"));

function sha(filePath, algorithm, encoding = "hex") {
  return createHash(algorithm).update(readFileSync(filePath)).digest(encoding);
}

function requireEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: ${String(actual)} != ${String(expected)}`);
}

requireEqual(releaseManifest.package, packageManifest.name, "Package name");
requireEqual(releaseManifest.version, packageManifest.version, "Package version");
requireEqual(releaseManifest.source_repository, packageManifest.repository?.url ?? null, "Source repository");
requireEqual(releaseManifest.node_engine, packageManifest.engines?.node ?? null, "Node engine");
if (!/^[a-f0-9]{40}$/.test(releaseManifest.source_commit)) throw new Error("Source commit is not immutable");
if (process.env.EXPECTED_SOURCE_COMMIT)
  requireEqual(releaseManifest.source_commit, process.env.EXPECTED_SOURCE_COMMIT, "Source commit");

const tarballName = basename(releaseManifest.tarball ?? "");
if (!tarballName.endsWith(".tgz") || tarballName !== releaseManifest.tarball)
  throw new Error("Release tarball name is unsafe or missing");
const tarball = resolve(artifactRoot, tarballName);
if (!existsSync(tarball)) throw new Error("Release tarball is missing");
const expectedArtifacts = new Set([
  tarballName,
  `${tarballName}.sha256`,
  "SHA256SUMS",
  "dotagents.sbom.cdx.json",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "migrating-from-skiller.md",
  "rfc-210-compatibility.md",
  "release-manifest.json",
]);
const actualArtifacts = readdirSync(artifactRoot);
for (const file of actualArtifacts) {
  if (!expectedArtifacts.delete(file)) throw new Error(`Unexpected release artifact: ${file}`);
  if (!statSync(resolve(artifactRoot, file)).isFile()) throw new Error(`Release artifact is not a file: ${file}`);
}
if (expectedArtifacts.size > 0) throw new Error(`Missing release artifacts: ${[...expectedArtifacts].join(", ")}`);
requireEqual(sha(tarball, "sha256"), releaseManifest.tarball_sha256, "Tarball SHA-256");
requireEqual(sha(tarball, "sha1"), releaseManifest.npm_shasum, "npm shasum");
requireEqual(`sha512-${sha(tarball, "sha512", "base64")}`, releaseManifest.npm_integrity, "npm integrity");
requireEqual(statSync(tarball).size, releaseManifest.package_size, "Tarball size");
requireEqual(
  readFileSync(resolve(artifactRoot, `${tarballName}.sha256`), "utf8"),
  `${releaseManifest.tarball_sha256}  ${tarballName}\n`,
  "Tarball checksum file",
);

const checksumLines = readFileSync(resolve(artifactRoot, "SHA256SUMS"), "utf8").trim().split("\n");
const requiredChecksums = new Set([
  tarballName,
  "dotagents.sbom.cdx.json",
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "migrating-from-skiller.md",
  "rfc-210-compatibility.md",
  "release-manifest.json",
]);
for (const line of checksumLines) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
  if (!match) throw new Error(`Invalid SHA256SUMS entry: ${line}`);
  const [, expected, file] = match;
  if (!requiredChecksums.delete(file)) throw new Error(`Unexpected or duplicate SHA256SUMS entry: ${file}`);
  requireEqual(sha(resolve(artifactRoot, file), "sha256"), expected, `SHA256SUMS ${file}`);
}
if (requiredChecksums.size > 0) throw new Error(`Missing SHA256SUMS entries: ${[...requiredChecksums].join(", ")}`);

const sbomName = releaseManifest.sbom?.file ?? "";
if (sbomName !== "dotagents.sbom.cdx.json") throw new Error("SBOM file name is missing or unsafe");
const sbomPath = resolve(artifactRoot, sbomName);
requireEqual(sha(sbomPath, "sha256"), releaseManifest.sbom?.sha256, "SBOM SHA-256");
const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
requireEqual(sbom.bomFormat, "CycloneDX", "SBOM format");
requireEqual(sbom.metadata?.component?.version, packageManifest.version, "SBOM package version");
if (!String(sbom.metadata?.component?.purl ?? "").includes("%40beautyfree/dotagents"))
  throw new Error("SBOM package identity is missing");

const requiredDocumentation = new Set([
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "migrating-from-skiller.md",
  "rfc-210-compatibility.md",
]);
for (const entry of releaseManifest.documentation ?? []) {
  if (!requiredDocumentation.delete(entry.file)) throw new Error(`Unexpected or duplicate release document: ${entry.file}`);
  requireEqual(sha(resolve(artifactRoot, entry.file), "sha256"), entry.sha256, `Documentation ${entry.file}`);
}
if (requiredDocumentation.size > 0)
  throw new Error(`Missing release documentation: ${[...requiredDocumentation].join(", ")}`);
requireEqual(
  readFileSync(resolve(artifactRoot, "RELEASE_NOTES.md"), "utf8"),
  extractReleaseNotes(readFileSync(resolve(root, "CHANGELOG.md"), "utf8"), packageManifest.version, {
    allowUnreleased: packageManifest.private === true || packageManifest.version === "0.0.0",
  }),
  "Release notes",
);

const packageEntries = new Set(
  execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n"),
);
requireEqual(packageEntries.size, releaseManifest.package_files, "Package file count");
for (const required of [
  "package/CHANGELOG.md",
  "package/docs/migrating-from-skiller.md",
  "package/docs/rfc-210-compatibility.md",
  "package/LICENSE",
  "package/schemas/skills.schema.json",
  "package/schemas/skills-lock.schema.json",
  "package/schemas/dotagents.schema.json",
]) {
  if (!packageEntries.has(required)) throw new Error(`Tarball is missing ${required}`);
}

process.stdout.write(
  `Verified ${tarballName} from ${releaseManifest.source_commit}, checksums, SBOM, and release documentation.\n`,
);

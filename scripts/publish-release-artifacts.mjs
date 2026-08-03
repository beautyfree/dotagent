import { spawnSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);

function defaultExec(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function commandFailure(label, result) {
  const detail = `${result.stderr ?? ""}\n${result.stdout ?? ""}`.trim().slice(0, 1200);
  throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
}

function parseJson(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch {
    commandFailure(`${label} returned invalid JSON`, result);
  }
}

function isNotFound(result) {
  return /\bE404\b|HTTP 404|404 Not Found|release not found|not found/i.test(
    `${result.stderr ?? ""}\n${result.stdout ?? ""}`,
  );
}

function repositorySlug(repositoryUrl) {
  const match = /github\.com[/:]([^/]+)\/([^/#]+?)(?:\.git)?$/.exec(repositoryUrl ?? "");
  if (!match) throw new Error("Package repository must be a GitHub repository URL");
  return `${match[1]}/${match[2]}`;
}

function releaseView(exec, repo, tag, env) {
  const result = exec(
    "gh",
    ["release", "view", tag, "--repo", repo, "--json", "isDraft,targetCommitish,url,assets"],
    { env },
  );
  if (result.status === 0) return parseJson(result, "GitHub release lookup");
  if (isNotFound(result)) return null;
  commandFailure("GitHub release lookup", result);
}

function githubApi(exec, endpoint, env) {
  const result = exec("gh", ["api", endpoint], { env });
  if (result.status === 0) return parseJson(result, `GitHub API ${endpoint}`);
  if (isNotFound(result)) return null;
  commandFailure(`GitHub API ${endpoint}`, result);
}

function resolveTagCommit(exec, repo, tag, env) {
  let object = githubApi(exec, `repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, env)?.object ?? null;
  for (let depth = 0; object?.type === "tag" && depth < 4; depth += 1) {
    object = githubApi(exec, `repos/${repo}/git/tags/${object.sha}`, env)?.object ?? null;
  }
  if (!object) return null;
  if (object.type !== "commit" || !/^[a-f0-9]{40}$/.test(object.sha ?? ""))
    throw new Error(`Git tag ${tag} does not resolve to an immutable commit`);
  return object.sha;
}

function packageRegistryIntegrity(exec, name, version, env) {
  const result = exec("npm", ["view", `${name}@${version}`, "dist.integrity", "--json"], { env });
  if (result.status === 0) {
    const value = parseJson(result, "npm registry lookup");
    if (typeof value !== "string" || !value.startsWith("sha512-"))
      throw new Error("npm registry returned an invalid package integrity");
    return value;
  }
  if (isNotFound(result)) return null;
  commandFailure("npm registry lookup", result);
}

function requireSuccess(label, result) {
  if (result.status !== 0) commandFailure(label, result);
}

export function publishReleaseArtifacts(options = {}) {
  const artifactRoot = resolve(options.artifactRoot ?? resolve(root, "release-artifacts"));
  const packageManifest =
    options.packageManifest ?? JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const releaseManifest =
    options.releaseManifest ?? JSON.parse(readFileSync(resolve(artifactRoot, "release-manifest.json"), "utf8"));
  const env = options.env ?? process.env;
  const exec = options.exec ?? defaultExec;
  const log = options.log ?? ((message) => process.stdout.write(`${message}\n`));

  if (packageManifest.private) throw new Error("Release package must set private:false in a reviewed commit");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageManifest.version) || packageManifest.version === "0.0.0")
    throw new Error("Release package must use a real semantic version");
  if (releaseManifest.package !== packageManifest.name || releaseManifest.version !== packageManifest.version)
    throw new Error("Release artifact identity does not match package.json");
  if (releaseManifest.source_commit !== env.GITHUB_SHA)
    throw new Error("Release artifact source commit does not match GITHUB_SHA");
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN is required for GitHub release publication");

  const repo = repositorySlug(packageManifest.repository?.url);
  if (env.GITHUB_REPOSITORY !== repo)
    throw new Error(`Release workflow repository mismatch: ${env.GITHUB_REPOSITORY ?? "missing"} != ${repo}`);
  const tag = `v${packageManifest.version}`;
  const tarballName = basename(releaseManifest.tarball ?? "");
  if (!tarballName.endsWith(".tgz") || tarballName !== releaseManifest.tarball)
    throw new Error("Release tarball name is unsafe or missing");
  const expectedAssets = [
    tarballName,
    `${tarballName}.sha256`,
    "SHA256SUMS",
    "dotagent.sbom.cdx.json",
    "CHANGELOG.md",
    "RELEASE_NOTES.md",
    "migrating-from-skiller.md",
    "rfc-210-compatibility.md",
    "release-manifest.json",
  ].sort();
  const assets = readdirSync(artifactRoot).sort();
  if (assets.length !== expectedAssets.length || assets.some((asset, index) => asset !== expectedAssets[index]))
    throw new Error("Release artifact directory does not match the verified allowlist");
  if (assets.some((file) => !statSync(resolve(artifactRoot, file)).isFile()))
    throw new Error("Release artifact allowlist contains a non-file entry");
  const commandEnv = { ...env, npm_config_ignore_scripts: "true" };
  const existingIntegrity = packageRegistryIntegrity(exec, packageManifest.name, packageManifest.version, commandEnv);
  if (existingIntegrity && existingIntegrity !== releaseManifest.npm_integrity)
    throw new Error(`npm ${packageManifest.name}@${packageManifest.version} already exists with different integrity`);

  const existingRelease = releaseView(exec, repo, tag, commandEnv);
  const existingTagCommit = resolveTagCommit(exec, repo, tag, commandEnv);
  if (existingTagCommit && existingTagCommit !== releaseManifest.source_commit)
    throw new Error(`Git tag ${tag} points to ${existingTagCommit}, not ${releaseManifest.source_commit}`);
  if (existingRelease && !existingTagCommit && existingRelease.targetCommitish !== releaseManifest.source_commit)
    throw new Error(`GitHub release ${tag} does not target the reviewed source commit`);

  const tarball = resolve(artifactRoot, tarballName);
  if (!existingIntegrity) {
    requireSuccess(
      "npm provenance publication",
      exec("npm", ["publish", tarball, "--access", "public", "--provenance"], { env: commandEnv }),
    );
    log(`Published ${packageManifest.name}@${packageManifest.version} to npm with provenance.`);
  } else {
    log(`npm already contains the verified ${packageManifest.name}@${packageManifest.version}; publication skipped.`);
  }

  if (!existingRelease) {
    requireSuccess(
      "GitHub draft release creation",
      exec(
        "gh",
        [
          "release",
          "create",
          tag,
          "--repo",
          repo,
          "--target",
          releaseManifest.source_commit,
          "--title",
          `${packageManifest.name} v${packageManifest.version}`,
          "--notes-file",
          resolve(artifactRoot, "RELEASE_NOTES.md"),
          "--draft",
        ],
        { env: commandEnv },
      ),
    );
  }

  requireSuccess(
    "GitHub release asset upload",
    exec("gh", ["release", "upload", tag, ...assets.map((file) => resolve(artifactRoot, file)), "--clobber", "--repo", repo], {
      env: commandEnv,
    }),
  );
  requireSuccess(
    "GitHub release publication",
    exec("gh", ["release", "edit", tag, "--repo", repo, "--draft=false", "--latest"], { env: commandEnv }),
  );

  const published = releaseView(exec, repo, tag, commandEnv);
  if (!published || published.isDraft) throw new Error(`GitHub release ${tag} is still missing or draft`);
  const publishedAssets = new Map((published.assets ?? []).map((asset) => [asset.name, asset.size]));
  const missingAssets = assets.filter((asset) => !publishedAssets.has(asset));
  if (missingAssets.length > 0) throw new Error(`GitHub release is missing assets: ${missingAssets.join(", ")}`);
  const wrongSizes = assets.filter((asset) => publishedAssets.get(asset) !== statSync(resolve(artifactRoot, asset)).size);
  if (wrongSizes.length > 0) throw new Error(`GitHub release asset sizes differ: ${wrongSizes.join(", ")}`);
  const publishedTagCommit = resolveTagCommit(exec, repo, tag, commandEnv);
  if (publishedTagCommit !== releaseManifest.source_commit)
    throw new Error(`Published Git tag ${tag} does not resolve to the reviewed source commit`);

  log(`Published permanent release artifacts at ${published.url}.`);
  return { package: packageManifest.name, version: packageManifest.version, tag, url: published.url };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publishReleaseArtifacts({ artifactRoot: process.argv[2] });
}

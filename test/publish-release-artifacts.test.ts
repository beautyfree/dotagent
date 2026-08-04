import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { publishReleaseArtifacts } from "../scripts/publish-release-artifacts.mjs";

const temporaryDirectories: string[] = [];
const sourceCommit = "a".repeat(40);
const integrity = `sha512-${Buffer.from("verified tarball").toString("base64")}`;
const packageManifest = {
  name: "dotagents",
  version: "0.1.0",
  private: false,
  repository: { url: "git+https://github.com/beautyfree/dotagents.git" },
};
const releaseManifest = {
  package: packageManifest.name,
  version: packageManifest.version,
  source_commit: sourceCommit,
  npm_integrity: integrity,
  tarball: "dotagents-0.1.0.tgz",
};
const releaseEnvironment = {
  GITHUB_SHA: sourceCommit,
  GITHUB_REPOSITORY: "beautyfree/dotagents",
  GH_TOKEN: "test-token",
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function artifactDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "dotagents-publish-test-"));
  temporaryDirectories.push(directory);
  writeFileSync(resolve(directory, releaseManifest.tarball), "verified tarball");
  writeFileSync(resolve(directory, `${releaseManifest.tarball}.sha256`), "checksum\n");
  writeFileSync(resolve(directory, "SHA256SUMS"), "checksums\n");
  writeFileSync(resolve(directory, "dotagents.sbom.cdx.json"), "{}\n");
  writeFileSync(resolve(directory, "CHANGELOG.md"), "# Changelog\n");
  writeFileSync(resolve(directory, "RELEASE_NOTES.md"), "## 0.1.0\n\nFirst release.\n");
  writeFileSync(resolve(directory, "rfc-210-compatibility.md"), "# RFC compatibility\n");
  writeFileSync(resolve(directory, "release-manifest.json"), JSON.stringify(releaseManifest));
  return directory;
}

function success(stdout = "") {
  return { status: 0, stdout, stderr: "" };
}

function notFound(kind: "npm" | "github") {
  return { status: 1, stdout: "", stderr: kind === "npm" ? "npm error code E404" : "gh: Not Found (HTTP 404)" };
}

describe("permanent release publication", () => {
  it("publishes npm first, then uploads a complete draft before making the GitHub release public", () => {
    const directory = artifactDirectory();
    const assets = readdirSync(directory).sort();
    const calls: string[] = [];
    let releaseExists = false;
    let published = false;
    const exec = (file: string, args: string[]) => {
      const command = `${file} ${args.join(" ")}`;
      calls.push(command);
      if (command.startsWith("npm view ")) return notFound("npm");
      if (command.startsWith("npm publish ")) return success();
      if (command.startsWith("gh release view ")) {
        if (!releaseExists) return notFound("github");
        return success(
          JSON.stringify({
            isDraft: !published,
            targetCommitish: sourceCommit,
            url: "https://github.com/beautyfree/dotagents/releases/tag/v0.1.0",
            assets: published ? assets.map((name) => ({ name, size: statSync(resolve(directory, name)).size })) : [],
          }),
        );
      }
      if (command.startsWith("gh api repos/beautyfree/dotagents/git/ref/tags/"))
        return published
          ? success(JSON.stringify({ object: { type: "commit", sha: sourceCommit } }))
          : notFound("github");
      if (command.startsWith("gh release create ")) {
        releaseExists = true;
        return success();
      }
      if (command.startsWith("gh release upload ")) return success();
      if (command.startsWith("gh release edit ")) {
        published = true;
        return success();
      }
      throw new Error(`Unexpected command: ${command}`);
    };

    const result = publishReleaseArtifacts({
      artifactRoot: directory,
      packageManifest,
      releaseManifest,
      env: releaseEnvironment,
      exec,
      log: () => {},
    });

    expect(result.tag).toBe("v0.1.0");
    expect(calls.findIndex((call) => call.startsWith("npm publish "))).toBeLessThan(
      calls.findIndex((call) => call.startsWith("gh release create ")),
    );
    expect(calls.some((call) => call.includes("gh release create v0.1.0") && call.includes("--draft"))).toBe(true);
    expect(calls.some((call) => call.includes("gh release upload v0.1.0") && call.includes("--clobber"))).toBe(true);
    expect(calls.some((call) => call.includes("gh release edit v0.1.0") && call.includes("--draft=false"))).toBe(true);
  });

  it("is retry-safe when npm already contains the same tarball integrity", () => {
    const directory = artifactDirectory();
    const assets = readdirSync(directory).sort();
    const calls: string[] = [];
    const exec = (file: string, args: string[]) => {
      const command = `${file} ${args.join(" ")}`;
      calls.push(command);
      if (command.startsWith("npm view ")) return success(JSON.stringify(integrity));
      if (command.startsWith("gh api repos/beautyfree/dotagents/git/ref/tags/"))
        return success(JSON.stringify({ object: { type: "commit", sha: sourceCommit } }));
      if (command.startsWith("gh release view "))
        return success(
          JSON.stringify({
            isDraft: false,
            targetCommitish: sourceCommit,
            url: "https://github.com/beautyfree/dotagents/releases/tag/v0.1.0",
            assets: assets.map((name) => ({ name, size: statSync(resolve(directory, name)).size })),
          }),
        );
      if (command.startsWith("gh release upload ") || command.startsWith("gh release edit ")) return success();
      throw new Error(`Unexpected command: ${command}`);
    };

    publishReleaseArtifacts({
      artifactRoot: directory,
      packageManifest,
      releaseManifest,
      env: releaseEnvironment,
      exec,
      log: () => {},
    });

    expect(calls.some((call) => call.startsWith("npm publish "))).toBe(false);
    expect(calls.some((call) => call.startsWith("gh release create "))).toBe(false);
    expect(calls.some((call) => call.startsWith("gh release upload "))).toBe(true);
  });

  it("refuses registry or tag collisions before mutating release state", () => {
    const directory = artifactDirectory();
    const mutationCalls: string[] = [];
    expect(() =>
      publishReleaseArtifacts({
        artifactRoot: directory,
        packageManifest,
        releaseManifest,
        env: releaseEnvironment,
        exec: (file: string, args: string[]) => {
          const command = `${file} ${args.join(" ")}`;
          if (command.startsWith("npm view ")) return success(JSON.stringify("sha512-different"));
          if (/publish|create|upload|edit/.test(command)) mutationCalls.push(command);
          return success();
        },
        log: () => {},
      }),
    ).toThrow("different integrity");
    expect(mutationCalls).toHaveLength(0);

    const tagMutations: string[] = [];
    expect(() =>
      publishReleaseArtifacts({
        artifactRoot: directory,
        packageManifest,
        releaseManifest,
        env: releaseEnvironment,
        exec: (file: string, args: string[]) => {
          const command = `${file} ${args.join(" ")}`;
          if (command.startsWith("npm view ")) return success(JSON.stringify(integrity));
          if (command.startsWith("gh release view ")) return notFound("github");
          if (command.startsWith("gh api repos/beautyfree/dotagents/git/ref/tags/"))
            return success(JSON.stringify({ object: { type: "commit", sha: "b".repeat(40) } }));
          if (/npm publish|gh release create|gh release upload|gh release edit/.test(command))
            tagMutations.push(command);
          return success();
        },
        log: () => {},
      }),
    ).toThrow("points to");
    expect(tagMutations).toHaveLength(0);
  });

  it("refuses an unverified extra release asset before any external command", () => {
    const directory = artifactDirectory();
    writeFileSync(resolve(directory, "unexpected.txt"), "must not be published");
    const calls: string[] = [];
    expect(() =>
      publishReleaseArtifacts({
        artifactRoot: directory,
        packageManifest,
        releaseManifest,
        env: releaseEnvironment,
        exec: (file: string, args: string[]) => {
          calls.push(`${file} ${args.join(" ")}`);
          return success();
        },
        log: () => {},
      }),
    ).toThrow("verified allowlist");
    expect(calls).toHaveLength(0);
  });
});

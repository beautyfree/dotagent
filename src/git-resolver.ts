import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { computeSkillIntegrity } from "./integrity.js";
import { scanOwnedSkill, type ScanLimits } from "./inventory.js";
import { parseLibraryManifest } from "./library.js";
import type { DependencyReference, ResolvedPackage } from "./schema.js";
import { normalizeGitIdentity, type DependencyResolver } from "./sources.js";

const execFileAsync = promisify(execFile);

export interface GitRunner {
  run(args: string[], cwd?: string): Promise<string>;
}

export class NodeGitRunner implements GitRunner {
  async run(args: string[], cwd?: string): Promise<string> {
    const result = await execFileAsync("git", args, { cwd, maxBuffer: 10 * 1024 * 1024, encoding: "utf8" });
    return result.stdout.trim();
  }
}

export interface GitDependencyResolverOptions {
  git?: GitRunner;
  temporaryRoot?: string;
  limits?: ScanLimits;
}

export class GitDependencyResolver implements DependencyResolver {
  readonly #git: GitRunner;
  readonly #temporaryRoot: string;
  readonly #limits: ScanLimits | undefined;

  constructor(options: GitDependencyResolverOptions = {}) {
    this.#git = options.git ?? new NodeGitRunner();
    this.#temporaryRoot = options.temporaryRoot ?? tmpdir();
    this.#limits = options.limits;
  }

  async resolve(_name: string, dependency: DependencyReference): Promise<ResolvedPackage> {
    normalizeGitIdentity(dependency.url);
    const workspace = await mkdtemp(path.join(this.#temporaryRoot, "dotagent-resolve-"));
    const checkout = path.join(workspace, "repository");
    try {
      await this.#git.run(["clone", "--no-checkout", "--filter=blob:none", "--", dependency.url, checkout]);
      await this.#git.run(["fetch", "--depth=1", "origin", dependency.ref], checkout);
      const commit = await this.#git.run(["rev-parse", "FETCH_HEAD^{commit}"], checkout);
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`Git returned an invalid commit for ${dependency.url}#${dependency.ref}`);
      await this.#git.run(["checkout", "--detach", commit], checkout);

      let selected = dependency.select;
      if (!selected) {
        const manifest = parseLibraryManifest(await readFile(path.join(checkout, "skills.json"), "utf8"));
        if (!manifest.ok) throw new Error(`Dependency ${dependency.url} has no compatible skills.json`);
        selected = manifest.value.skills;
      }
      const skills = [];
      const integrityInputs = [];
      for (const skillPath of [...selected].sort((left, right) => left.localeCompare(right, "en"))) {
        const scanned = await scanOwnedSkill(checkout, skillPath, this.#limits);
        if (!scanned.ok) throw new Error(scanned.issues.map((entry) => entry.message).join("; "));
        skills.push({ name: scanned.value.name, path: scanned.value.path });
        integrityInputs.push({ path: scanned.value.path, content: Buffer.from(scanned.value.integrity, "utf8") });
      }
      return {
        url: normalizeGitIdentity(dependency.url),
        requested_ref: dependency.ref,
        commit,
        integrity: computeSkillIntegrity(integrityInputs),
        skills,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

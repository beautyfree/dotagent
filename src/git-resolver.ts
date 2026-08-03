import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { computeSkillIntegrity } from "./integrity.js";
import { scanOwnedSkill, type ScanLimits } from "./inventory.js";
import { parseLibraryManifest } from "./library.js";
import type { DependencyReference, LibraryManifest, ResolvedPackage } from "./schema.js";
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
  /** Disposable local Git object cache. Never serialized into a portable manifest. */
  cacheRoot?: string;
  limits?: ScanLimits;
}

export class GitDependencyResolver implements DependencyResolver {
  readonly #git: GitRunner;
  readonly #temporaryRoot: string;
  readonly #cacheRoot: string | undefined;
  readonly #limits: ScanLimits | undefined;
  readonly #cacheWork = new Map<string, Promise<string>>();

  constructor(options: GitDependencyResolverOptions = {}) {
    this.#git = options.git ?? new NodeGitRunner();
    this.#temporaryRoot = options.temporaryRoot ?? tmpdir();
    this.#cacheRoot = options.cacheRoot;
    this.#limits = options.limits;
  }

  async #exists(filePath: string): Promise<boolean> {
    try { await lstat(filePath); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }

  async #prepareMirror(url: string): Promise<string | null> {
    if (!this.#cacheRoot) return null;
    const identity = normalizeGitIdentity(url);
    const key = createHash("sha256").update(identity).digest("hex");
    const existing = this.#cacheWork.get(key);
    if (existing) return existing;
    const work = (async () => {
      await mkdir(this.#cacheRoot!, { recursive: true });
      const mirror = path.join(this.#cacheRoot!, `${key}.git`);
      if (!await this.#exists(mirror)) {
        const temporary = `${mirror}.tmp-${process.pid}-${Date.now()}`;
        try {
          await this.#git.run(["clone", "--mirror", "--", url, temporary]);
          try { await rename(temporary, mirror); }
          catch (error) {
            if (!await this.#exists(mirror)) throw error;
            await rm(temporary, { recursive: true, force: true });
          }
        } catch (error) {
          await rm(temporary, { recursive: true, force: true });
          throw error;
        }
      }
      await this.#git.run(["fetch", "--prune", "origin", "+refs/heads/*:refs/heads/*", "+refs/tags/*:refs/tags/*"], mirror);
      return mirror;
    })();
    this.#cacheWork.set(key, work);
    try { return await work; }
    finally { this.#cacheWork.delete(key); }
  }

  async resolve(_name: string, dependency: DependencyReference): Promise<ResolvedPackage> {
    normalizeGitIdentity(dependency.url);
    const workspace = await mkdtemp(path.join(this.#temporaryRoot, "dotagent-resolve-"));
    const checkout = path.join(workspace, "repository");
    try {
      const mirror = await this.#prepareMirror(dependency.url);
      await this.#git.run([
        "clone",
        "--no-checkout",
        "--filter=blob:none",
        ...(mirror ? ["--reference-if-able", mirror] : []),
        "--",
        dependency.url,
        checkout,
      ]);
      await this.#git.run(["fetch", "--depth=1", "origin", dependency.ref], checkout);
      const commit = await this.#git.run(["rev-parse", "FETCH_HEAD^{commit}"], checkout);
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error(`Git returned an invalid commit for ${dependency.url}#${dependency.ref}`);
      await this.#git.run(["checkout", "--detach", commit], checkout);

      let sourceManifest: LibraryManifest | null = null;
      try {
        const manifest = parseLibraryManifest(await readFile(path.join(checkout, "skills.json"), "utf8"));
        if (manifest.ok) sourceManifest = manifest.value;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      let selected = dependency.select;
      if (!selected) {
        if (!sourceManifest) throw new Error(`Dependency ${dependency.url} has no compatible skills.json`);
        selected = sourceManifest.skills;
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
        ...(sourceManifest?.license ? { license: sourceManifest.license } : {}),
        skills,
      };
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
}

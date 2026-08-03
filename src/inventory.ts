import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { computeSkillIntegrity, type IntegrityFile } from "./integrity.js";
import type { DotagentIssue, DotagentResult } from "./issues.js";
import { loadLibrary } from "./library.js";
import { parse } from "yaml";

export interface ScanLimits {
  maxFilesPerSkill: number;
  maxFileBytes: number;
  maxSkillBytes: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFilesPerSkill: 1_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxSkillBytes: 50 * 1024 * 1024,
};

export interface OwnedSkillInventory {
  name: string;
  path: string;
  fileCount: number;
  bytes: number;
  integrity: string;
}

export interface LibraryInventory {
  root: string;
  name: string;
  version: string;
  ownedSkills: OwnedSkillInventory[];
  dependencyCount: number;
  locked: boolean;
}

export interface ScannedSkill extends OwnedSkillInventory {
  root: string;
}

export function declaredSkillName(skillMd: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(skillMd.replace(/^\uFEFF/, ""));
  if (!match) return null;
  try {
    const frontmatter = parse(match[1] ?? "") as { name?: unknown } | null;
    const name = typeof frontmatter?.name === "string" ? frontmatter.name.trim() : "";
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ? name : null;
  } catch { return null; }
}

function issue(code: DotagentIssue["code"], message: string, remediation: string, filePath: string): DotagentIssue {
  return { code, message, remediation, path: filePath };
}

async function collectSkillFiles(skillRoot: string, limits: ScanLimits): Promise<DotagentResult<{ files: IntegrityFile[]; bytes: number }>> {
  const files: IntegrityFile[] = [];
  let bytes = 0;
  const walk = async (directory: string): Promise<DotagentIssue | null> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return issue("io-error", `Could not read skill directory ${directory}.`, "Check permissions and retry.", directory);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(skillRoot, absolute).replaceAll(path.sep, "/");
      if (relative === ".dotagent-managed.json") continue;
      if (entry.isSymbolicLink()) {
        return issue("unsafe-link", `Skill contains a symbolic link at ${relative}.`, "Replace it with a regular file inside the skill or keep the skill as an external dependency.", absolute);
      }
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const nested = await walk(absolute);
        if (nested) return nested;
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= limits.maxFilesPerSkill) {
        return issue("limit-exceeded", `Skill exceeds ${limits.maxFilesPerSkill} files.`, "Remove generated files or keep the skill as an external dependency.", skillRoot);
      }
      const metadata = await lstat(absolute);
      if (metadata.size > limits.maxFileBytes) {
        return issue("limit-exceeded", `${relative} exceeds the ${limits.maxFileBytes}-byte file limit.`, "Remove large generated or binary files from the portable skill.", absolute);
      }
      bytes += metadata.size;
      if (bytes > limits.maxSkillBytes) {
        return issue("limit-exceeded", `Skill exceeds the ${limits.maxSkillBytes}-byte total limit.`, "Reduce the skill size or keep it as an external dependency.", skillRoot);
      }
      files.push({ path: relative, content: await readFile(absolute) });
    }
    return null;
  };
  const unsafe = await walk(skillRoot);
  return unsafe ? { ok: false, issues: [unsafe] } : { ok: true, value: { files, bytes }, issues: [] };
}

export async function scanOwnedSkill(root: string, skillPath: string, limits: ScanLimits = DEFAULT_SCAN_LIMITS): Promise<DotagentResult<ScannedSkill>> {
    const skillRoot = skillPath === "." ? root : path.join(root, ...skillPath.split("/"));
    let metadata;
    try {
      metadata = await lstat(skillRoot);
    } catch {
      return { ok: false, issues: [issue("file-not-found", `Exported skill directory is missing: ${skillPath}.`, "Restore the directory or remove it from the manifest.", skillRoot)] };
    }
    if (metadata.isSymbolicLink()) {
      return { ok: false, issues: [issue("unsafe-link", `Exported skill root is a symbolic link: ${skillPath}.`, "Use an external dependency or materialize reviewed files inside the library.", skillRoot)] };
    }
    if (!metadata.isDirectory()) {
      return { ok: false, issues: [issue("invalid-manifest", `Exported skill is not a directory: ${skillPath}.`, "Point skills.json to a directory containing SKILL.md.", skillRoot)] };
    }
    const skillFile = path.join(skillRoot, "SKILL.md");
    let skillFileMetadata;
    try {
      skillFileMetadata = await lstat(skillFile);
    } catch {
      return { ok: false, issues: [issue("missing-skill-file", `${skillPath} has no regular SKILL.md.`, "Add SKILL.md or remove this export.", skillFile)] };
    }
    if (skillFileMetadata.isSymbolicLink()) {
      return { ok: false, issues: [issue("unsafe-link", `${skillPath}/SKILL.md is a symbolic link.`, "Replace it with a regular file inside the skill or use an external dependency.", skillFile)] };
    }
    if (!skillFileMetadata.isFile()) {
      return { ok: false, issues: [issue("missing-skill-file", `${skillPath} has no regular SKILL.md.`, "Add SKILL.md or remove this export.", skillFile)] };
    }
    const name = skillPath === "."
      ? declaredSkillName(await readFile(skillFile, "utf8"))
      : path.posix.basename(skillPath);
    if (!name) {
      return { ok: false, issues: [issue("missing-skill-metadata", "A repository-root skill must declare a portable name in SKILL.md frontmatter.", "Add a lowercase kebab-case name field to SKILL.md.", skillFile)] };
    }
    const collected = await collectSkillFiles(skillRoot, limits);
    if (!collected.ok) return collected;
    return { ok: true, value: {
      name,
      path: skillPath,
      root: skillRoot,
      fileCount: collected.value.files.length,
      bytes: collected.value.bytes,
      integrity: computeSkillIntegrity(collected.value.files),
    }, issues: [] };
}

export async function scanLibrary(root: string, limits: ScanLimits = DEFAULT_SCAN_LIMITS): Promise<DotagentResult<LibraryInventory>> {
  const loaded = await loadLibrary(root);
  if (!loaded.ok) return loaded;
  const ownedSkills: OwnedSkillInventory[] = [];
  const names = new Set<string>();
  for (const skillPath of loaded.value.manifest.skills) {
    const scanned = await scanOwnedSkill(root, skillPath, limits);
    if (!scanned.ok) return scanned;
    const folded = scanned.value.name.toLocaleLowerCase("en-US");
    if (names.has(folded)) {
      return { ok: false, issues: [issue("duplicate-skill", `Multiple exported skills use the name ${scanned.value.name}.`, "Rename one skill so flat package names are unique.", skillPath)] };
    }
    names.add(folded);
    const { root: _skillRoot, ...inventory } = scanned.value;
    ownedSkills.push(inventory);
  }
  ownedSkills.sort((left, right) => left.name.localeCompare(right.name, "en"));
  return { ok: true, value: {
    root,
    name: loaded.value.manifest.name,
    version: loaded.value.manifest.version,
    ownedSkills,
    dependencyCount: Object.keys(loaded.value.manifest.dependencies).length,
    locked: loaded.value.lock !== null,
  }, issues: [] };
}

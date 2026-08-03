import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DiscoveredProvenance } from "../discovery.js";

export const SKILLS_CLI_LOCK_VERSION = 3 as const;

export interface SkillsCliLockEntry {
  name: string;
  source: string;
  source_type: string;
  source_url: string;
  ref: string | null;
  skill_path: string | null;
  updated_at: string;
}

export interface SkillsCliLock {
  path: string;
  version: typeof SKILLS_CLI_LOCK_VERSION;
  skills: SkillsCliLockEntry[];
}

export interface SkillsCliProvenanceResult {
  provenance: DiscoveredProvenance[];
  skipped: { skill: string; reason: string }[];
}

function sourcePackageName(source: string, skill: string): string {
  const normalized = source
    .toLocaleLowerCase("en-US")
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : `${skill}-source`.slice(0, 64);
}

export function getSkillsCliLockPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return env.XDG_STATE_HOME?.trim()
    ? join(env.XDG_STATE_HOME, "skills", ".skill-lock.json")
    : join(home, ".agents", ".skill-lock.json");
}

/** Parse the documented Skills CLI v3 shape without guessing future versions. */
export function parseSkillsCliLock(input: string, sourcePath = "<memory>"): SkillsCliLock | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const lock = parsed as { version?: unknown; skills?: unknown };
  if (lock.version !== SKILLS_CLI_LOCK_VERSION || !lock.skills || typeof lock.skills !== "object") return null;
  const skills = Object.entries(lock.skills as Record<string, unknown>)
    .flatMap(([name, value]) => {
      if (!value || typeof value !== "object") return [];
      const entry = value as Record<string, unknown>;
      if (
        typeof entry.source !== "string" ||
        typeof entry.sourceType !== "string" ||
        typeof entry.sourceUrl !== "string"
      )
        return [];
      return [
        {
          name,
          source: entry.source,
          source_type: entry.sourceType,
          source_url: entry.sourceUrl,
          ref: typeof entry.ref === "string" ? entry.ref : null,
          skill_path: typeof entry.skillPath === "string" ? entry.skillPath : null,
          updated_at: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { path: sourcePath, version: SKILLS_CLI_LOCK_VERSION, skills };
}

/** Read-only adapter; the upstream lockfile is never rewritten. */
export function readSkillsCliLock(filePath = getSkillsCliLockPath()): SkillsCliLock | null {
  if (!existsSync(filePath)) return null;
  try {
    return parseSkillsCliLock(readFileSync(filePath, "utf8"), filePath);
  } catch {
    return null;
  }
}

/** Maps only complete v3 entries; incomplete upstream data stays visible instead of becoming an owned copy. */
export function skillsCliLockToProvenance(lock: SkillsCliLock): SkillsCliProvenanceResult {
  const provenance: DiscoveredProvenance[] = [];
  const skipped: SkillsCliProvenanceResult["skipped"] = [];
  for (const entry of lock.skills) {
    if (!entry.source_url.trim() || !entry.skill_path?.trim()) {
      skipped.push({ skill: entry.name, reason: "Skills CLI source URL or skill path is missing" });
      continue;
    }
    provenance.push({
      skill: entry.name,
      package: sourcePackageName(entry.source, entry.name),
      url: entry.source_url.trim(),
      ref: entry.ref?.trim() || "HEAD",
      skillPath: entry.skill_path.trim(),
      source: "skills-cli",
    });
  }
  return { provenance, skipped };
}

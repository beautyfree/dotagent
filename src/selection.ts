import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { normalizePortablePath } from "./paths.js";
import { computePlanId } from "./plan.js";

export const portableGlobPatternSchema = z
  .string()
  .min(1)
  .max(256)
  .superRefine((value, context) => {
    if (
      value.includes("\\") ||
      value.startsWith("/") ||
      value.split("/").some((part) => part === ".." || part === ".")
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Glob patterns must stay inside the declared source subtree",
      });
    }
    if (/[^A-Za-z0-9._/*?-]/.test(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Glob pattern contains unsupported characters" });
    }
  });

export interface WildcardSelectionInput {
  source: string;
  revision: string;
  subtree?: string;
  available: string[];
  include: string[];
  exclude?: string[];
}

export interface WildcardSelectionEntry {
  path: string;
  selected: boolean;
  reason: "included" | "excluded" | "not-matched";
  matchedPattern?: string;
}

export interface WildcardSelectionPlan {
  kind: "wildcard-selection";
  schemaVersion: 1;
  planId: string;
  source: string;
  revision: string;
  subtree: string;
  include: string[];
  exclude: string[];
  indexIntegrity: string;
  entries: WildcardSelectionEntry[];
  selected: string[];
}

function stable(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizedSubtree(value = "."): string {
  if (value === ".") return value;
  const normalized = normalizePortablePath(value);
  if (!normalized || normalized !== value) throw new Error("Selection subtree must be a portable relative path");
  return normalized;
}

function normalizedAvailable(value: string, subtree: string): string {
  if (value === "." && subtree === ".") return value;
  const normalized = normalizePortablePath(value);
  if (!normalized || normalized !== value) throw new Error(`Discovered skill path is not portable: ${value}`);
  if (subtree !== "." && normalized !== subtree && !normalized.startsWith(`${subtree}/`)) {
    throw new Error(`Discovered skill path escapes the declared subtree: ${value}`);
  }
  return normalized;
}

function relativeToSubtree(value: string, subtree: string): string {
  if (subtree === ".") return value;
  if (value === subtree) return ".";
  return value.slice(subtree.length + 1);
}

function globRegex(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern.charAt(index);
    if (character === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          expression += "(?:.*/)?";
        } else expression += ".*";
      } else expression += "[^/]*";
    } else if (character === "?") expression += "[^/]";
    else expression += character.replace(/[|\\{}()[\]^$+?.-]/g, "\\$&");
  }
  return new RegExp(`${expression}$`);
}

function firstMatch(value: string, patterns: string[]): string | null {
  return patterns.find((pattern) => globRegex(pattern).test(value)) ?? null;
}

/** Build a complete no-write wildcard review bound to the immutable source index. */
export function planWildcardSelection(input: WildcardSelectionInput): WildcardSelectionPlan {
  const subtree = normalizedSubtree(input.subtree);
  const include = stable(input.include.map((pattern) => portableGlobPatternSchema.parse(pattern)));
  const exclude = stable((input.exclude ?? []).map((pattern) => portableGlobPatternSchema.parse(pattern)));
  if (include.length === 0) throw new Error("Wildcard selection requires at least one include pattern");
  const available = stable(input.available.map((entry) => normalizedAvailable(entry, subtree)));
  const indexIntegrity = createHash("sha256").update(JSON.stringify(available)).digest("hex");
  const entries = available.map((skillPath): WildcardSelectionEntry => {
    const relative = relativeToSubtree(skillPath, subtree);
    const includedBy = firstMatch(relative, include);
    if (!includedBy) return { path: skillPath, selected: false, reason: "not-matched" };
    const excludedBy = firstMatch(relative, exclude);
    if (excludedBy) return { path: skillPath, selected: false, reason: "excluded", matchedPattern: excludedBy };
    return { path: skillPath, selected: true, reason: "included", matchedPattern: includedBy };
  });
  const selected = entries.filter((entry) => entry.selected).map((entry) => entry.path);
  const data = {
    kind: "wildcard-selection" as const,
    schemaVersion: 1 as const,
    source: input.source,
    revision: input.revision,
    subtree,
    include,
    exclude,
    indexIntegrity,
    entries,
    selected,
  };
  return { ...data, planId: computePlanId(data) };
}

export interface SkillPathDiscoveryOptions {
  maxDirectories?: number;
  maxDepth?: number;
}

/** Discover only SKILL.md locations; never reads or executes skill content. */
export async function discoverSkillPaths(root: string, options: SkillPathDiscoveryOptions = {}): Promise<string[]> {
  const maximumDirectories = options.maxDirectories ?? 10_000;
  const maximumDepth = options.maxDepth ?? 16;
  const found: string[] = [];
  let visited = 0;
  const walk = async (directory: string, relative: string, depth: number): Promise<void> => {
    if (depth > maximumDepth) return;
    visited += 1;
    if (visited > maximumDirectories) throw new Error(`Skill discovery exceeded ${maximumDirectories} directories`);
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.name === "SKILL.md" && entry.isFile())) found.push(relative || ".");
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === ".git" || entry.name === "node_modules")
        continue;
      await walk(path.join(directory, entry.name), relative ? `${relative}/${entry.name}` : entry.name, depth + 1);
    }
  };
  await walk(path.resolve(root), "", 0);
  return stable(found);
}

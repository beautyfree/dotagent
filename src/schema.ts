import { z } from "zod";
import { normalizeSkillPath } from "./paths.js";

export const MANIFEST_SCHEMA_VERSION = 1 as const;
export const LOCKFILE_VERSION = 1 as const;

const packageName = z.string().min(1).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const commitSha = z.string().regex(/^[a-f0-9]{40}$/);
const integrity = z.string().regex(/^sha256-[A-Za-z0-9+/]+={0,2}$/);
const portableSkillPath = z.string().transform((value, context) => {
  const normalized = normalizeSkillPath(value);
  if (!normalized) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Skill paths must be relative and stay inside the library" });
    return value;
  }
  return normalized;
});

export const dependencyReferenceSchema = z.object({
  url: z.string().min(1).max(2_048),
  ref: z.string().min(1).max(256),
  select: z.array(portableSkillPath).min(1).optional(),
}).strict();

export const libraryManifestSchema = z.object({
  schema_version: z.literal(MANIFEST_SCHEMA_VERSION),
  name: packageName,
  version: z.string().min(1).max(128),
  description: z.string().max(1_024).optional(),
  license: z.string().min(1).max(128).optional(),
  skills: z.array(portableSkillPath).default([]),
  dependencies: z.record(packageName, dependencyReferenceSchema).default({}),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((manifest, context) => {
  const seen = new Set<string>();
  manifest.skills.forEach((skill, index) => {
    const folded = skill.toLocaleLowerCase("en-US");
    if (seen.has(folded)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["skills", index], message: `Duplicate normalized skill path: ${skill}` });
    }
    seen.add(folded);
  });
});

export const resolvedPackageSchema = z.object({
  url: z.string().min(1).max(2_048),
  requested_ref: z.string().min(1).max(256),
  commit: commitSha,
  integrity,
  skills: z.array(z.object({
    name: packageName,
    path: portableSkillPath,
  }).strict()),
}).strict();

export const libraryLockSchema = z.object({
  lockfile_version: z.literal(LOCKFILE_VERSION),
  generated_by: z.string().min(1).max(128),
  resolved: z.record(z.string().min(1), resolvedPackageSchema),
}).strict();

export type DependencyReference = z.infer<typeof dependencyReferenceSchema>;
export type LibraryManifest = z.infer<typeof libraryManifestSchema>;
export type ResolvedPackage = z.infer<typeof resolvedPackageSchema>;
export type LibraryLock = z.infer<typeof libraryLockSchema>;

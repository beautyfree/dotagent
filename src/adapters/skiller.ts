import { parse, stringify } from "yaml";
import { z } from "zod";

/** Compatibility format used by Skiller before beautyfree/dotagent libraries. */
export const SKILLER_SYNC_MANIFEST_FILE = "skiller-sync.yaml";
export const SKILLER_SYNC_MANIFEST_VERSION = 3 as const;

export const skillerStableIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const portablePathSchema = z.string().min(1).max(512);
const skillSourcePathSchema = z.union([z.literal("."), portablePathSchema]);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/);
const commitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);

const installationsSchema = z.array(skillerStableIdSchema).min(1).optional();

export const skillerBundledSkillSchema = z.object({
  id: skillerStableIdSchema,
  kind: z.literal("bundled"),
  path: portablePathSchema,
  sha256: sha256HexSchema,
  installations: installationsSchema,
});

export const skillerReferenceSkillSchema = z.object({
  id: skillerStableIdSchema,
  kind: z.literal("reference"),
  repository: z.string().min(1).max(2_048),
  ref: commitShaSchema,
  skill_path: skillSourcePathSchema,
  sha256: sha256HexSchema.optional(),
  installations: installationsSchema,
});

export const skillerSkillsShSkillSchema = z.object({
  id: skillerStableIdSchema,
  kind: z.literal("skills_sh"),
  source_url: z.string().min(1).max(2_048),
  ref: commitShaSchema,
  skill_path: skillSourcePathSchema,
  sha256: sha256HexSchema.optional(),
  installations: installationsSchema,
});

const manifestBaseSchema = z.object({
  profile: z.object({
    id: skillerStableIdSchema,
    mode: z.enum(["private", "team", "public"]),
  }),
  agent_policy: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("detected") }),
    z.object({ mode: z.literal("selected"), agent_slugs: z.array(skillerStableIdSchema).min(1) }),
  ]),
});

export const skillerSyncManifestSchema = manifestBaseSchema.extend({
  schema_version: z.literal(SKILLER_SYNC_MANIFEST_VERSION),
  skills: z.array(z.discriminatedUnion("kind", [
    skillerBundledSkillSchema,
    skillerReferenceSkillSchema,
    skillerSkillsShSkillSchema,
  ])),
});

const v2SkillerSyncManifestSchema = manifestBaseSchema.extend({
  schema_version: z.literal(2),
  skills: z.array(z.discriminatedUnion("kind", [
    skillerBundledSkillSchema,
    skillerReferenceSkillSchema.omit({ installations: true }),
  ])),
});

const v1SkillerSyncManifestSchema = manifestBaseSchema.extend({
  schema_version: z.literal(1),
  skills: z.array(z.discriminatedUnion("kind", [
    skillerBundledSkillSchema.omit({ installations: true }),
    skillerReferenceSkillSchema.omit({ installations: true }),
  ])),
});

export type SkillerSyncManifest = z.infer<typeof skillerSyncManifestSchema>;
export type SkillerSyncSkill = SkillerSyncManifest["skills"][number];

export function assertSkillerStableId(id: string): void {
  if (!skillerStableIdSchema.safeParse(id).success) throw new Error(`Invalid sync stable id: ${id}`);
}

/** Legacy Skiller paths are strict POSIX-relative paths; traversal is rejected, not normalized. */
export function assertSkillerPortableRelativePath(value: string): void {
  if (value.trim() !== value || value.length === 0 || value.length > 512) {
    throw new Error("Sync path must be a non-empty, trimmed relative path");
  }
  if (value.includes("\\") || value.startsWith("/") || /^[a-z]:/i.test(value)) {
    throw new Error(`Sync path must use a portable relative POSIX path: ${value}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    throw new Error(`Sync path must not contain traversal segments: ${value}`);
  }
}

export function assertSkillerPortableSkillSourcePath(value: string): void {
  if (value !== ".") assertSkillerPortableRelativePath(value);
}

/** Credentials belong in a credential helper or SSH agent, never in a portable manifest. */
export function assertCredentialFreeGitRemote(remote: string): void {
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/i.test(remote)) {
    throw new Error("Sync repository URL must not embed credentials");
  }
}

export function validateSkillerSyncManifest(input: unknown): SkillerSyncManifest {
  const raw = input as { schema_version?: unknown } | null;
  const v1 = raw?.schema_version === 1 ? v1SkillerSyncManifestSchema.parse(input) : null;
  const v2 = raw?.schema_version === 2 ? v2SkillerSyncManifestSchema.parse(input) : null;
  const manifest: SkillerSyncManifest = v1
    ? { ...v1, schema_version: SKILLER_SYNC_MANIFEST_VERSION }
    : v2
      ? { ...v2, schema_version: SKILLER_SYNC_MANIFEST_VERSION }
      : skillerSyncManifestSchema.parse(input);

  const seenIds = new Set<string>();
  for (const skill of manifest.skills) {
    if (seenIds.has(skill.id)) throw new Error(`Duplicate sync skill id: ${skill.id}`);
    seenIds.add(skill.id);
    if (skill.kind === "bundled") {
      assertSkillerPortableRelativePath(skill.path);
      const expectedPath = `skills/${skill.id}`;
      if (skill.path !== expectedPath) throw new Error(`Bundled skill ${skill.id} must use path ${expectedPath}`);
    } else {
      assertSkillerPortableSkillSourcePath(skill.skill_path);
      assertCredentialFreeGitRemote(skill.kind === "reference" ? skill.repository : skill.source_url);
    }
  }
  return manifest;
}

export function parseSkillerSyncManifest(text: string): SkillerSyncManifest {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    throw new Error(`Invalid ${SKILLER_SYNC_MANIFEST_FILE}: ${error instanceof Error ? error.message : "YAML parse failed"}`);
  }
  return validateSkillerSyncManifest(parsed);
}

export function stringifySkillerSyncManifest(manifest: SkillerSyncManifest): string {
  return stringify(validateSkillerSyncManifest(manifest));
}

export function createSkillerSyncManifest(
  profileId: string,
  mode: SkillerSyncManifest["profile"]["mode"] = "private",
  agentPolicy: SkillerSyncManifest["agent_policy"] = { mode: "detected" },
): SkillerSyncManifest {
  assertSkillerStableId(profileId);
  return validateSkillerSyncManifest({
    schema_version: SKILLER_SYNC_MANIFEST_VERSION,
    profile: { id: profileId, mode },
    agent_policy: agentPolicy,
    skills: [],
  });
}

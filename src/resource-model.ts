import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { scanSkillForSecrets, scanTextForSecrets, type SecretFinding } from "./audit.js";
import { scanOwnedSkill } from "./inventory.js";
import { normalizePortablePath } from "./paths.js";
import { computePlanId } from "./plan.js";
import { agentResourceCapabilities, type AgentDescriptor, type ResourceCapabilityMatrix } from "./agents.js";

export const RESOURCE_MANIFEST_VERSION = 2 as const;
export const RESOURCE_KINDS = ["skill", "instruction", "command", "subagent"] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

const resourceId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const agentSlug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const portableResourcePath = z.string().transform((value, context) => {
  const normalized = normalizePortablePath(value);
  if (!normalized || normalized !== value || value.includes("\\")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Resource path must stay inside the library" });
  }
  return value;
});
const routing = { agents: z.array(agentSlug).min(1).optional() };

export const resourceDescriptorSchema = z.union([
  z.object({ kind: z.literal("skill"), id: resourceId, path: portableResourcePath, ...routing }).strict(),
  z
    .object({
      kind: z.literal("instruction"),
      id: resourceId,
      path: portableResourcePath,
      format: z.enum(["markdown", "native"]),
      activation: z.enum(["always", "conditional"]),
      condition: z.string().min(1).max(512).optional(),
      ...routing,
    })
    .strict()
    .superRefine((resource, context) => {
      if (resource.activation === "conditional" && !resource.condition) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["condition"],
          message: "Conditional instructions require a condition",
        });
      }
      if (resource.activation === "always" && resource.condition) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["condition"],
          message: "Always-on instructions cannot declare a condition",
        });
      }
    }),
  z
    .object({
      kind: z.literal("command"),
      id: resourceId,
      path: portableResourcePath,
      format: z.enum(["markdown", "yaml", "json", "native"]),
      invocation: z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,127}$/),
      ...routing,
    })
    .strict(),
  z
    .object({
      kind: z.literal("subagent"),
      id: resourceId,
      path: portableResourcePath,
      format: z.enum(["markdown", "yaml", "json", "toml", "native"]),
      role: z.string().min(1).max(256),
      ...routing,
    })
    .strict(),
]);

export const resourceManifestSchema = z
  .object({
    schema_version: z.literal(RESOURCE_MANIFEST_VERSION),
    resources: z.array(resourceDescriptorSchema).max(10_000),
  })
  .strict()
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    manifest.resources.forEach((resource, index) => {
      const key = `${resource.kind}:${resource.id}`;
      if (seen.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["resources", index],
          message: `Duplicate resource identity: ${key}`,
        });
      }
      seen.add(key);
    });
  });

export type ResourceDescriptor = z.infer<typeof resourceDescriptorSchema>;
export type ResourceManifest = z.infer<typeof resourceManifestSchema>;

export interface ScannedResource {
  kind: ResourceKind;
  id: string;
  path: string;
  integrity: string;
  secretFindings: (SecretFinding & { relativePath: string })[];
}

export interface ResourceScanResult {
  resources: ScannedResource[];
  hasBlockers: boolean;
}

/** Scan declared data files without evaluating commands, agents, hooks, or scripts. */
export async function scanResourceManifest(
  root: string,
  input: ResourceManifest,
  maximumFileBytes = 1024 * 1024,
): Promise<ResourceScanResult> {
  const manifest = resourceManifestSchema.parse(input);
  const library = path.resolve(root);
  const resources: ScannedResource[] = [];
  for (const descriptor of [...manifest.resources].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`, "en"),
  )) {
    if (descriptor.kind === "skill") {
      const scanned = await scanOwnedSkill(library, descriptor.path);
      if (!scanned.ok) throw new Error(`Resource ${descriptor.kind}:${descriptor.id} failed safe skill scanning`);
      resources.push({
        kind: descriptor.kind,
        id: descriptor.id,
        path: descriptor.path,
        integrity: scanned.value.integrity,
        secretFindings: await scanSkillForSecrets(path.join(library, ...descriptor.path.split("/"))),
      });
      continue;
    }
    const target = path.join(library, ...descriptor.path.split("/"));
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error(`Resource ${descriptor.kind}:${descriptor.id} must be a regular file`);
    }
    if (metadata.size > maximumFileBytes)
      throw new Error(`Resource ${descriptor.kind}:${descriptor.id} exceeds the file size limit`);
    const content = await readFile(target);
    const secretFindings = scanTextForSecrets(content.toString("utf8")).map((finding) => ({
      ...finding,
      relativePath: descriptor.path,
    }));
    resources.push({
      kind: descriptor.kind,
      id: descriptor.id,
      path: descriptor.path,
      integrity: `sha256-${createHash("sha256").update(content).digest("base64")}`,
      secretFindings,
    });
  }
  return { resources, hasBlockers: resources.some((resource) => resource.secretFindings.length > 0) };
}

export interface ResourceCompositionInput {
  scope: "personal" | "project";
  library: string;
  resources: ScannedResource[];
}

export interface ResourceCompositionPlan {
  kind: "resource-composition";
  schemaVersion: 2;
  planId: string;
  resources: {
    key: string;
    kind: ResourceKind;
    id: string;
    integrity: string;
    origins: { scope: string; library: string; path: string }[];
  }[];
  conflicts: { key: string; origins: { scope: string; library: string; path: string; integrity: string }[] }[];
  hasBlockers: boolean;
}

export function planResourceComposition(inputs: ResourceCompositionInput[]): ResourceCompositionPlan {
  const grouped = new Map<string, { input: ResourceCompositionInput; resource: ScannedResource }[]>();
  for (const input of inputs) {
    for (const resource of input.resources) {
      const key = `${resource.kind}:${resource.id}`;
      const entries = grouped.get(key) ?? [];
      entries.push({ input, resource });
      grouped.set(key, entries);
    }
  }
  const resources: ResourceCompositionPlan["resources"] = [];
  const conflicts: ResourceCompositionPlan["conflicts"] = [];
  for (const [key, entries] of [...grouped].sort(([left], [right]) => left.localeCompare(right, "en"))) {
    const integrities = new Set(entries.map((entry) => entry.resource.integrity));
    if (integrities.size > 1) {
      conflicts.push({
        key,
        origins: entries.map((entry) => ({
          scope: entry.input.scope,
          library: entry.input.library,
          path: entry.resource.path,
          integrity: entry.resource.integrity,
        })),
      });
      continue;
    }
    const first = entries[0];
    if (!first) continue;
    resources.push({
      key,
      kind: first.resource.kind,
      id: first.resource.id,
      integrity: first.resource.integrity,
      origins: entries.map((entry) => ({
        scope: entry.input.scope,
        library: entry.input.library,
        path: entry.resource.path,
      })),
    });
  }
  const data = {
    kind: "resource-composition" as const,
    schemaVersion: 2 as const,
    resources,
    conflicts,
    hasBlockers: conflicts.length > 0,
  };
  return { ...data, planId: computePlanId(data) };
}

export interface ResourceProjectionPlan {
  kind: "resource-projection";
  schemaVersion: 2;
  planId: string;
  projections: {
    resource: string;
    agent: string;
    support: "native" | "lossy" | "unsupported";
    adapter?: string;
    loss?: string;
  }[];
  hasUnsupported: boolean;
  hasLossy: boolean;
}

function capabilityFor(matrix: ResourceCapabilityMatrix, kind: ResourceKind) {
  return matrix[kind];
}

/** Explain delivery support before any native agent file is touched. */
export function planResourceProjection(
  resources: ResourceDescriptor[],
  agents: AgentDescriptor[],
): ResourceProjectionPlan {
  const bySlug = new Map(agents.map((agent) => [agent.slug, agent]));
  const projections: ResourceProjectionPlan["projections"] = [];
  for (const resource of [...resources].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`, "en"),
  )) {
    for (const agentSlug of [...(resource.agents ?? [...bySlug.keys()])].sort()) {
      const agent = bySlug.get(agentSlug);
      if (!agent) {
        projections.push({ resource: `${resource.kind}:${resource.id}`, agent: agentSlug, support: "unsupported" });
        continue;
      }
      const capability = capabilityFor(agentResourceCapabilities(agent), resource.kind);
      projections.push({
        resource: `${resource.kind}:${resource.id}`,
        agent: agent.slug,
        support: capability.support,
        ...(capability.adapter ? { adapter: capability.adapter } : {}),
        ...(capability.loss ? { loss: capability.loss } : {}),
      });
    }
  }
  const data = {
    kind: "resource-projection" as const,
    schemaVersion: 2 as const,
    projections,
    hasUnsupported: projections.some((entry) => entry.support === "unsupported"),
    hasLossy: projections.some((entry) => entry.support === "lossy"),
  };
  return { ...data, planId: computePlanId(data) };
}

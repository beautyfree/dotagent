import { parse } from "yaml";
import { z } from "zod";

export const DOTAGENT_CONFIG_VERSION = 1 as const;
export const DOTAGENT_CONFIG_FILE = "dotagent.yaml";
export const DOTAGENT_LOCAL_CONFIG_FILE = "dotagent.local.yaml";

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const portableSkillPolicySchema = z.object({
  include: z.boolean().optional(),
  agents: z.array(slug).min(1).optional(),
  distribution: z.enum(["dependency", "vendored"]).optional(),
}).strict();

export const portableConfigSchema = z.object({
  schema_version: z.literal(DOTAGENT_CONFIG_VERSION),
  minimum_dotagent_version: z.string().min(1).max(128).optional(),
  defaults: z.object({
    include: z.enum(["all", "owned", "selected"]).default("all"),
  }).strict().default({ include: "all" }),
  skills: z.record(slug, portableSkillPolicySchema).default({}),
}).strict();

const envReference = z.string().regex(/^\$\{[A-Z_][A-Z0-9_]*\}$/);
export const localConfigSchema = z.object({
  schema_version: z.literal(DOTAGENT_CONFIG_VERSION),
  agents: z.object({
    selected: z.array(slug).optional(),
    roots: z.record(slug, z.string().min(1).max(2_048)).optional(),
  }).strict().optional(),
  materialization: z.enum(["auto", "native", "symlink", "junction", "copy"]).optional(),
  exclusions: z.array(slug).default([]),
  environment: z.record(slug, envReference).default({}),
}).strict();

export type PortableConfig = z.infer<typeof portableConfigSchema>;
export type LocalConfig = z.infer<typeof localConfigSchema>;
export type ConfigProvenance = "portable" | "local";

export interface EffectiveConfig {
  defaults: PortableConfig["defaults"];
  skills: PortableConfig["skills"];
  agents: NonNullable<LocalConfig["agents"]>;
  materialization: NonNullable<LocalConfig["materialization"]>;
  exclusions: string[];
  environment: Record<string, string>;
  provenance: Record<string, ConfigProvenance>;
}

function parseYamlSchema<TSchema extends z.ZodTypeAny>(input: string, schema: TSchema, filename: string): z.output<TSchema> {
  let value: unknown;
  try {
    value = parse(input);
  } catch (error) {
    throw new Error(`Invalid ${filename}: ${error instanceof Error ? error.message : "YAML parse failed"}`);
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const at = first?.path.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Invalid ${filename}${at}: ${first?.message ?? "schema validation failed"}`);
  }
  return result.data;
}

export function parsePortableConfig(input: string): PortableConfig {
  return parseYamlSchema(input, portableConfigSchema, DOTAGENT_CONFIG_FILE);
}

export function parseLocalConfig(input: string): LocalConfig {
  return parseYamlSchema(input, localConfigSchema, DOTAGENT_LOCAL_CONFIG_FILE);
}

/** Local values are explicit overlays; provenance lets a UI explain every effective field. */
export function mergeConfig(portable: PortableConfig, local?: LocalConfig | null): EffectiveConfig {
  const provenance: Record<string, ConfigProvenance> = {
    defaults: "portable",
    skills: "portable",
    agents: "local",
    materialization: "local",
    exclusions: "local",
    environment: "local",
  };
  return {
    defaults: portable.defaults,
    skills: portable.skills,
    agents: local?.agents ?? {},
    materialization: local?.materialization ?? "auto",
    exclusions: [...(local?.exclusions ?? [])].sort(),
    environment: Object.fromEntries(Object.entries(local?.environment ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    provenance,
  };
}

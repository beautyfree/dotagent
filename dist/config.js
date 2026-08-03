import { parse } from "yaml";
import { z } from "zod";
export const DOTAGENT_CONFIG_VERSION = 1;
export const DOTAGENT_CONFIG_FILE = "dotagent.yaml";
export const DOTAGENT_LOCAL_CONFIG_FILE = "dotagent.local.yaml";
const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const portableSkillPolicySchema = z
    .object({
    include: z.boolean().optional(),
    agents: z.array(slug).min(1).optional(),
    distribution: z.enum(["dependency", "vendored"]).optional(),
})
    .strict();
export const portableConfigSchema = z
    .object({
    schema_version: z.literal(DOTAGENT_CONFIG_VERSION),
    minimum_dotagent_version: z.string().min(1).max(128).optional(),
    defaults: z
        .object({
        include: z.enum(["all", "owned", "selected"]).default("all"),
    })
        .strict()
        .default({ include: "all" }),
    skills: z.record(slug, portableSkillPolicySchema).default({}),
})
    .strict();
const envReference = z.string().regex(/^\$\{[A-Z_][A-Z0-9_]*\}$/);
export const localConfigSchema = z
    .object({
    schema_version: z.literal(DOTAGENT_CONFIG_VERSION),
    agents: z
        .object({
        selected: z.array(slug).optional(),
        roots: z.record(slug, z.string().min(1).max(2_048)).optional(),
    })
        .strict()
        .optional(),
    materialization: z.enum(["auto", "native", "symlink", "junction", "copy"]).optional(),
    exclusions: z.array(slug).default([]),
    environment: z.record(slug, envReference).default({}),
})
    .strict();
function parseYamlSchema(input, schema, filename) {
    let value;
    try {
        value = parse(input);
    }
    catch (error) {
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
export function parsePortableConfig(input) {
    return parseYamlSchema(input, portableConfigSchema, DOTAGENT_CONFIG_FILE);
}
export function parseLocalConfig(input) {
    return parseYamlSchema(input, localConfigSchema, DOTAGENT_LOCAL_CONFIG_FILE);
}
/** Local values are explicit overlays; provenance lets a UI explain every effective field. */
export function mergeConfig(portable, local) {
    const provenance = {
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
/**
 * Resolve agent slugs without inventing machine routes. Portable per-skill
 * routing and the private local selection are both allowlists; detection is
 * the final capability boundary.
 */
export function resolveSkillAgentSelection(config, skill, detectedAgents) {
    const detected = [...new Set(detectedAgents)].sort();
    const portableFilter = config.skills[skill]?.agents ? [...config.skills[skill].agents].sort() : null;
    const localFilter = config.agents.selected ? [...config.agents.selected].sort() : null;
    const portable = portableFilter ? new Set(portableFilter) : null;
    const local = localFilter ? new Set(localFilter) : null;
    return {
        skill,
        agents: detected.filter((agent) => (!portable || portable.has(agent)) && (!local || local.has(agent))),
        portableFilter,
        localFilter,
    };
}
//# sourceMappingURL=config.js.map
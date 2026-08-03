import { z } from "zod";
export declare const DOTAGENT_CONFIG_VERSION: 1;
export declare const DOTAGENT_CONFIG_FILE = "dotagent.yaml";
export declare const DOTAGENT_LOCAL_CONFIG_FILE = "dotagent.local.yaml";
declare const vendoredOriginSchema: z.ZodEffects<z.ZodObject<{
    url: z.ZodString;
    commit: z.ZodString;
    skill_path: z.ZodString;
    integrity: z.ZodString;
    license: z.ZodString;
}, "strict", z.ZodTypeAny, {
    url: string;
    license: string;
    commit: string;
    integrity: string;
    skill_path: string;
}, {
    url: string;
    license: string;
    commit: string;
    integrity: string;
    skill_path: string;
}>, {
    url: string;
    license: string;
    commit: string;
    integrity: string;
    skill_path: string;
}, {
    url: string;
    license: string;
    commit: string;
    integrity: string;
    skill_path: string;
}>;
export declare const portableConfigSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    minimum_dotagent_version: z.ZodOptional<z.ZodString>;
    defaults: z.ZodDefault<z.ZodObject<{
        include: z.ZodDefault<z.ZodEnum<["all", "owned", "selected"]>>;
    }, "strict", z.ZodTypeAny, {
        include: "all" | "owned" | "selected";
    }, {
        include?: "all" | "owned" | "selected" | undefined;
    }>>;
    skills: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodEffects<z.ZodObject<{
        include: z.ZodOptional<z.ZodBoolean>;
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        distribution: z.ZodOptional<z.ZodEnum<["dependency", "vendored"]>>;
        origin: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            url: z.ZodString;
            commit: z.ZodString;
            skill_path: z.ZodString;
            integrity: z.ZodString;
            license: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        }, {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        }>, {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        }, {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        }>>;
    }, "strict", z.ZodTypeAny, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }>, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }>>>;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    skills: Record<string, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }>;
    defaults: {
        include: "all" | "owned" | "selected";
    };
    minimum_dotagent_version?: string | undefined;
}, {
    schema_version: 1;
    skills?: Record<string, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
        origin?: {
            url: string;
            license: string;
            commit: string;
            integrity: string;
            skill_path: string;
        } | undefined;
    }> | undefined;
    minimum_dotagent_version?: string | undefined;
    defaults?: {
        include?: "all" | "owned" | "selected" | undefined;
    } | undefined;
}>;
export declare const localConfigSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    agents: z.ZodOptional<z.ZodObject<{
        selected: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        roots: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strict", z.ZodTypeAny, {
        roots?: Record<string, string> | undefined;
        selected?: string[] | undefined;
    }, {
        roots?: Record<string, string> | undefined;
        selected?: string[] | undefined;
    }>>;
    materialization: z.ZodOptional<z.ZodEnum<["auto", "native", "symlink", "junction", "copy"]>>;
    exclusions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    environment: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    exclusions: string[];
    environment: Record<string, string>;
    agents?: {
        roots?: Record<string, string> | undefined;
        selected?: string[] | undefined;
    } | undefined;
    materialization?: "auto" | "native" | "symlink" | "junction" | "copy" | undefined;
}, {
    schema_version: 1;
    agents?: {
        roots?: Record<string, string> | undefined;
        selected?: string[] | undefined;
    } | undefined;
    materialization?: "auto" | "native" | "symlink" | "junction" | "copy" | undefined;
    exclusions?: string[] | undefined;
    environment?: Record<string, string> | undefined;
}>;
export type PortableConfig = z.infer<typeof portableConfigSchema>;
export type VendoredOrigin = z.infer<typeof vendoredOriginSchema>;
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
export interface SkillAgentSelection {
    skill: string;
    agents: string[];
    portableFilter: string[] | null;
    localFilter: string[] | null;
}
export declare function parsePortableConfig(input: string): PortableConfig;
export declare function parseLocalConfig(input: string): LocalConfig;
/** Local values are explicit overlays; provenance lets a UI explain every effective field. */
export declare function mergeConfig(portable: PortableConfig, local?: LocalConfig | null): EffectiveConfig;
/**
 * Resolve agent slugs without inventing machine routes. Portable per-skill
 * routing and the private local selection are both allowlists; detection is
 * the final capability boundary.
 */
export declare function resolveSkillAgentSelection(config: EffectiveConfig, skill: string, detectedAgents: Iterable<string>): SkillAgentSelection;
export {};
//# sourceMappingURL=config.d.ts.map
import { z } from "zod";
export declare const DOTAGENT_CONFIG_VERSION: 1;
export declare const DOTAGENT_CONFIG_FILE = "dotagent.yaml";
export declare const DOTAGENT_LOCAL_CONFIG_FILE = "dotagent.local.yaml";
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
    skills: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        include: z.ZodOptional<z.ZodBoolean>;
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        distribution: z.ZodOptional<z.ZodEnum<["dependency", "vendored"]>>;
    }, "strict", z.ZodTypeAny, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
    }, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
    }>>>;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    skills: Record<string, {
        include?: boolean | undefined;
        agents?: string[] | undefined;
        distribution?: "dependency" | "vendored" | undefined;
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
        selected?: string[] | undefined;
        roots?: Record<string, string> | undefined;
    }, {
        selected?: string[] | undefined;
        roots?: Record<string, string> | undefined;
    }>>;
    materialization: z.ZodOptional<z.ZodEnum<["auto", "native", "symlink", "junction", "copy"]>>;
    exclusions: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    environment: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    exclusions: string[];
    environment: Record<string, string>;
    agents?: {
        selected?: string[] | undefined;
        roots?: Record<string, string> | undefined;
    } | undefined;
    materialization?: "native" | "symlink" | "junction" | "copy" | "auto" | undefined;
}, {
    schema_version: 1;
    agents?: {
        selected?: string[] | undefined;
        roots?: Record<string, string> | undefined;
    } | undefined;
    materialization?: "native" | "symlink" | "junction" | "copy" | "auto" | undefined;
    exclusions?: string[] | undefined;
    environment?: Record<string, string> | undefined;
}>;
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
export declare function parsePortableConfig(input: string): PortableConfig;
export declare function parseLocalConfig(input: string): LocalConfig;
/** Local values are explicit overlays; provenance lets a UI explain every effective field. */
export declare function mergeConfig(portable: PortableConfig, local?: LocalConfig | null): EffectiveConfig;
//# sourceMappingURL=config.d.ts.map
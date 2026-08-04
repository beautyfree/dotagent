import { z } from "zod";
import { type SecretFinding } from "./audit.js";
import { type AgentDescriptor } from "./agents.js";
export declare const RESOURCE_MANIFEST_VERSION: 2;
export declare const RESOURCE_KINDS: readonly ["skill", "instruction", "command", "subagent"];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export declare const resourceDescriptorSchema: z.ZodUnion<[z.ZodObject<{
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    kind: z.ZodLiteral<"skill">;
    id: z.ZodString;
    path: z.ZodEffects<z.ZodString, string, string>;
}, "strict", z.ZodTypeAny, {
    path: string;
    kind: "skill";
    id: string;
    agents?: string[] | undefined;
}, {
    path: string;
    kind: "skill";
    id: string;
    agents?: string[] | undefined;
}>, z.ZodEffects<z.ZodObject<{
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    kind: z.ZodLiteral<"instruction">;
    id: z.ZodString;
    path: z.ZodEffects<z.ZodString, string, string>;
    format: z.ZodEnum<["markdown", "native"]>;
    activation: z.ZodEnum<["always", "conditional"]>;
    condition: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    path: string;
    kind: "instruction";
    id: string;
    format: "native" | "markdown";
    activation: "always" | "conditional";
    agents?: string[] | undefined;
    condition?: string | undefined;
}, {
    path: string;
    kind: "instruction";
    id: string;
    format: "native" | "markdown";
    activation: "always" | "conditional";
    agents?: string[] | undefined;
    condition?: string | undefined;
}>, {
    path: string;
    kind: "instruction";
    id: string;
    format: "native" | "markdown";
    activation: "always" | "conditional";
    agents?: string[] | undefined;
    condition?: string | undefined;
}, {
    path: string;
    kind: "instruction";
    id: string;
    format: "native" | "markdown";
    activation: "always" | "conditional";
    agents?: string[] | undefined;
    condition?: string | undefined;
}>, z.ZodObject<{
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    kind: z.ZodLiteral<"command">;
    id: z.ZodString;
    path: z.ZodEffects<z.ZodString, string, string>;
    format: z.ZodEnum<["markdown", "yaml", "json", "native"]>;
    invocation: z.ZodString;
}, "strict", z.ZodTypeAny, {
    path: string;
    kind: "command";
    id: string;
    format: "native" | "markdown" | "yaml" | "json";
    invocation: string;
    agents?: string[] | undefined;
}, {
    path: string;
    kind: "command";
    id: string;
    format: "native" | "markdown" | "yaml" | "json";
    invocation: string;
    agents?: string[] | undefined;
}>, z.ZodObject<{
    agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    kind: z.ZodLiteral<"subagent">;
    id: z.ZodString;
    path: z.ZodEffects<z.ZodString, string, string>;
    format: z.ZodEnum<["markdown", "yaml", "json", "toml", "native"]>;
    role: z.ZodString;
}, "strict", z.ZodTypeAny, {
    path: string;
    kind: "subagent";
    id: string;
    format: "native" | "markdown" | "yaml" | "json" | "toml";
    role: string;
    agents?: string[] | undefined;
}, {
    path: string;
    kind: "subagent";
    id: string;
    format: "native" | "markdown" | "yaml" | "json" | "toml";
    role: string;
    agents?: string[] | undefined;
}>]>;
export declare const resourceManifestSchema: z.ZodEffects<z.ZodObject<{
    schema_version: z.ZodLiteral<2>;
    resources: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        kind: z.ZodLiteral<"skill">;
        id: z.ZodString;
        path: z.ZodEffects<z.ZodString, string, string>;
    }, "strict", z.ZodTypeAny, {
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    }, {
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    }>, z.ZodEffects<z.ZodObject<{
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        kind: z.ZodLiteral<"instruction">;
        id: z.ZodString;
        path: z.ZodEffects<z.ZodString, string, string>;
        format: z.ZodEnum<["markdown", "native"]>;
        activation: z.ZodEnum<["always", "conditional"]>;
        condition: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    }, {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    }>, {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    }, {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    }>, z.ZodObject<{
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        kind: z.ZodLiteral<"command">;
        id: z.ZodString;
        path: z.ZodEffects<z.ZodString, string, string>;
        format: z.ZodEnum<["markdown", "yaml", "json", "native"]>;
        invocation: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    }, {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    }>, z.ZodObject<{
        agents: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        kind: z.ZodLiteral<"subagent">;
        id: z.ZodString;
        path: z.ZodEffects<z.ZodString, string, string>;
        format: z.ZodEnum<["markdown", "yaml", "json", "toml", "native"]>;
        role: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    }, {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    }>]>, "many">;
}, "strict", z.ZodTypeAny, {
    schema_version: 2;
    resources: ({
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    } | {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    })[];
}, {
    schema_version: 2;
    resources: ({
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    } | {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    })[];
}>, {
    schema_version: 2;
    resources: ({
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    } | {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    })[];
}, {
    schema_version: 2;
    resources: ({
        path: string;
        kind: "skill";
        id: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "instruction";
        id: string;
        format: "native" | "markdown";
        activation: "always" | "conditional";
        agents?: string[] | undefined;
        condition?: string | undefined;
    } | {
        path: string;
        kind: "command";
        id: string;
        format: "native" | "markdown" | "yaml" | "json";
        invocation: string;
        agents?: string[] | undefined;
    } | {
        path: string;
        kind: "subagent";
        id: string;
        format: "native" | "markdown" | "yaml" | "json" | "toml";
        role: string;
        agents?: string[] | undefined;
    })[];
}>;
export type ResourceDescriptor = z.infer<typeof resourceDescriptorSchema>;
export type ResourceManifest = z.infer<typeof resourceManifestSchema>;
export interface ScannedResource {
    kind: ResourceKind;
    id: string;
    path: string;
    integrity: string;
    secretFindings: (SecretFinding & {
        relativePath: string;
    })[];
}
export interface ResourceScanResult {
    resources: ScannedResource[];
    hasBlockers: boolean;
}
/** Scan declared data files without evaluating commands, agents, hooks, or scripts. */
export declare function scanResourceManifest(root: string, input: ResourceManifest, maximumFileBytes?: number): Promise<ResourceScanResult>;
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
        origins: {
            scope: string;
            library: string;
            path: string;
        }[];
    }[];
    conflicts: {
        key: string;
        origins: {
            scope: string;
            library: string;
            path: string;
            integrity: string;
        }[];
    }[];
    hasBlockers: boolean;
}
export declare function planResourceComposition(inputs: ResourceCompositionInput[]): ResourceCompositionPlan;
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
/** Explain delivery support before any native agent file is touched. */
export declare function planResourceProjection(resources: ResourceDescriptor[], agents: AgentDescriptor[]): ResourceProjectionPlan;
//# sourceMappingURL=resource-model.d.ts.map
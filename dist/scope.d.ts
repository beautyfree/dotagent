import { z } from "zod";
import type { LibraryFiles } from "./library.js";
import { type ApplyLibraryUpdateResult } from "./library-update.js";
import { type ResourceKind } from "./resource-model.js";
export declare const SCOPE_DESCRIPTOR_VERSION: 1;
export declare const SCOPE_DESCRIPTOR_FILE = "dotagents.scope.json";
export declare const portableScopeDescriptorSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    scope: z.ZodEnum<["personal", "project"]>;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    scope: "personal" | "project";
}, {
    schema_version: 1;
    scope: "personal" | "project";
}>;
export type PortableScope = z.infer<typeof portableScopeDescriptorSchema>["scope"];
export type PortableScopeDescriptor = z.infer<typeof portableScopeDescriptorSchema>;
export interface ScopedLibraryInput {
    scope: PortableScope;
    library: LibraryFiles;
}
export interface DeviceScopeInput {
    /** Stable resource identities excluded only on this machine. */
    exclusions?: string[];
}
export interface ScopedResourceOrigin {
    scope: PortableScope;
    library: string;
    resourceKind: ResourceKind;
    kind: "owned" | "dependency";
    /** Relative library or source-repository path; never a device path. */
    path: string;
    dependency?: string;
    repository?: string;
    commit?: string;
    integrity: string;
}
export interface EffectiveScopedResource {
    key: string;
    kind: ResourceKind;
    id: string;
    origins: ScopedResourceOrigin[];
    excludedByDevice: boolean;
}
export interface ScopeCompositionConflict {
    code: "resource-conflict";
    resourceKey: string;
    origins: ScopedResourceOrigin[];
}
export interface ScopeCompositionIssue {
    code: "invalid-owned-skill" | "missing-lock" | "missing-lock-entry" | "invalid-resource-manifest" | "resource-secret";
    scope: PortableScope;
    library: string;
    resourceKey: string;
    message: string;
}
export interface ScopeCompositionPlan {
    schemaVersion: 1;
    planId: string;
    scopes: {
        scope: PortableScope;
        library: string;
    }[];
    resources: EffectiveScopedResource[];
    conflicts: ScopeCompositionConflict[];
    issues: ScopeCompositionIssue[];
    device: {
        exclusions: string[];
    };
    hasBlockers: boolean;
}
/**
 * Compose portable Personal and Project declarations under a Device overlay.
 * Equal immutable content is deduplicated; every unequal same-id resource is
 * an explicit blocker. No input root is serialized into the result or plan ID.
 */
export declare function createScopeCompositionPlan(inputs: ScopedLibraryInput[], device?: DeviceScopeInput): Promise<ScopeCompositionPlan>;
export interface ScopeMigrationPlan {
    schemaVersion: 1;
    planId: string;
    status: "requires-decision" | "ready";
    library: string;
    libraryFingerprint: string;
    descriptor: PortableScopeDescriptor | null;
    relativePath: typeof SCOPE_DESCRIPTOR_FILE;
    precondition: "descriptor-absent";
}
/** Read one bounded portable descriptor without following a linked file. */
export declare function readPortableScopeDescriptor(root: string): PortableScopeDescriptor | null;
/** Legacy scope migration is deliberately preview-only until apply is separately reviewed. */
export declare function createLegacyScopeMigrationPlan(library: LibraryFiles, scope?: PortableScope): Promise<ScopeMigrationPlan>;
/** Apply only the unchanged, explicitly classified legacy scope plan. */
export declare function applyLegacyScopeMigrationPlan(library: LibraryFiles, plan: ScopeMigrationPlan, expectedPlanId: string): Promise<ApplyLibraryUpdateResult>;
//# sourceMappingURL=scope.d.ts.map
import { z } from "zod";
import type { VendoredOrigin } from "../config.js";
import { type SkillExportFinding, type SkillExportPlan } from "../export-policy.js";
/** Compatibility format used by Skiller before beautyfree/dotagents libraries. */
export declare const SKILLER_SYNC_MANIFEST_FILE = "skiller-sync.yaml";
export declare const SKILLER_SYNC_MANIFEST_VERSION: 3;
export declare const skillerStableIdSchema: z.ZodString;
export declare const skillerBundledSkillSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"bundled">;
    path: z.ZodString;
    sha256: z.ZodString;
    installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    sha256: string;
    path: string;
    kind: "bundled";
    id: string;
    installations?: string[] | undefined;
}, {
    sha256: string;
    path: string;
    kind: "bundled";
    id: string;
    installations?: string[] | undefined;
}>;
export declare const skillerReferenceSkillSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"reference">;
    repository: z.ZodString;
    ref: z.ZodString;
    skill_path: z.ZodUnion<[z.ZodLiteral<".">, z.ZodString]>;
    sha256: z.ZodOptional<z.ZodString>;
    installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    ref: string;
    kind: "reference";
    id: string;
    repository: string;
    skill_path: string;
    sha256?: string | undefined;
    installations?: string[] | undefined;
}, {
    ref: string;
    kind: "reference";
    id: string;
    repository: string;
    skill_path: string;
    sha256?: string | undefined;
    installations?: string[] | undefined;
}>;
export declare const skillerSkillsShSkillSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"skills_sh">;
    source_url: z.ZodString;
    ref: z.ZodString;
    skill_path: z.ZodUnion<[z.ZodLiteral<".">, z.ZodString]>;
    sha256: z.ZodOptional<z.ZodString>;
    installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    ref: string;
    kind: "skills_sh";
    id: string;
    skill_path: string;
    source_url: string;
    sha256?: string | undefined;
    installations?: string[] | undefined;
}, {
    ref: string;
    kind: "skills_sh";
    id: string;
    skill_path: string;
    source_url: string;
    sha256?: string | undefined;
    installations?: string[] | undefined;
}>;
export declare const skillerSyncManifestSchema: z.ZodObject<{
    profile: z.ZodObject<{
        id: z.ZodString;
        mode: z.ZodEnum<["private", "team", "public"]>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        mode: "private" | "team" | "public";
    }, {
        id: string;
        mode: "private" | "team" | "public";
    }>;
    agent_policy: z.ZodDiscriminatedUnion<"mode", [z.ZodObject<{
        mode: z.ZodLiteral<"detected">;
    }, "strip", z.ZodTypeAny, {
        mode: "detected";
    }, {
        mode: "detected";
    }>, z.ZodObject<{
        mode: z.ZodLiteral<"selected">;
        agent_slugs: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        mode: "selected";
        agent_slugs: string[];
    }, {
        mode: "selected";
        agent_slugs: string[];
    }>]>;
} & {
    schema_version: z.ZodLiteral<3>;
    skills: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"bundled">;
        path: z.ZodString;
        sha256: z.ZodString;
        installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        sha256: string;
        path: string;
        kind: "bundled";
        id: string;
        installations?: string[] | undefined;
    }, {
        sha256: string;
        path: string;
        kind: "bundled";
        id: string;
        installations?: string[] | undefined;
    }>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"reference">;
        repository: z.ZodString;
        ref: z.ZodString;
        skill_path: z.ZodUnion<[z.ZodLiteral<".">, z.ZodString]>;
        sha256: z.ZodOptional<z.ZodString>;
        installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        ref: string;
        kind: "reference";
        id: string;
        repository: string;
        skill_path: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    }, {
        ref: string;
        kind: "reference";
        id: string;
        repository: string;
        skill_path: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    }>, z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodLiteral<"skills_sh">;
        source_url: z.ZodString;
        ref: z.ZodString;
        skill_path: z.ZodUnion<[z.ZodLiteral<".">, z.ZodString]>;
        sha256: z.ZodOptional<z.ZodString>;
        installations: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        ref: string;
        kind: "skills_sh";
        id: string;
        skill_path: string;
        source_url: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    }, {
        ref: string;
        kind: "skills_sh";
        id: string;
        skill_path: string;
        source_url: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    }>]>, "many">;
}, "strip", z.ZodTypeAny, {
    schema_version: 3;
    skills: ({
        sha256: string;
        path: string;
        kind: "bundled";
        id: string;
        installations?: string[] | undefined;
    } | {
        ref: string;
        kind: "reference";
        id: string;
        repository: string;
        skill_path: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    } | {
        ref: string;
        kind: "skills_sh";
        id: string;
        skill_path: string;
        source_url: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    })[];
    profile: {
        id: string;
        mode: "private" | "team" | "public";
    };
    agent_policy: {
        mode: "detected";
    } | {
        mode: "selected";
        agent_slugs: string[];
    };
}, {
    schema_version: 3;
    skills: ({
        sha256: string;
        path: string;
        kind: "bundled";
        id: string;
        installations?: string[] | undefined;
    } | {
        ref: string;
        kind: "reference";
        id: string;
        repository: string;
        skill_path: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    } | {
        ref: string;
        kind: "skills_sh";
        id: string;
        skill_path: string;
        source_url: string;
        sha256?: string | undefined;
        installations?: string[] | undefined;
    })[];
    profile: {
        id: string;
        mode: "private" | "team" | "public";
    };
    agent_policy: {
        mode: "detected";
    } | {
        mode: "selected";
        agent_slugs: string[];
    };
}>;
export type SkillerSyncManifest = z.infer<typeof skillerSyncManifestSchema>;
export type SkillerSyncSkill = SkillerSyncManifest["skills"][number];
export interface SkillerBundledPublishCandidate {
    kind?: "bundled";
    id: string;
    sourcePath: string;
    installationAgentSlugs?: string[];
}
export interface SkillerReferencePublishCandidate {
    kind: "reference";
    id: string;
    repository: string;
    ref: string;
    skillPath: string;
    contentHash?: string;
    installationAgentSlugs?: string[];
}
export interface SkillerSkillsShPublishCandidate {
    kind: "skills_sh";
    id: string;
    sourceUrl: string;
    ref: string;
    skillPath: string;
    contentHash?: string;
    installationAgentSlugs?: string[];
}
export interface SkillerVendoredPublishCandidate {
    kind: "vendored";
    id: string;
    sourcePath: string;
    origin: VendoredOrigin;
    installationAgentSlugs?: string[];
}
export type SkillerSyncPublishCandidate = SkillerBundledPublishCandidate | SkillerReferencePublishCandidate | SkillerSkillsShPublishCandidate | SkillerVendoredPublishCandidate;
export type SkillerBundledExportPlan = Omit<SkillExportPlan, "skill"> & {
    id: string;
    bundledPath: string;
};
export interface SkillerSyncPublishPlan {
    kind: "skiller-sync-publish";
    schemaVersion: 1;
    planId: string;
    manifest: SkillerSyncManifest;
    bundledSkills: SkillerBundledExportPlan[];
    bundledDistributions: Record<string, "owned" | "vendored">;
    vendoredOrigins: Record<string, VendoredOrigin>;
    secretFindings: SkillExportFinding[];
}
export declare function assertSkillerStableId(id: string): void;
/** Legacy Skiller paths are strict POSIX-relative paths; traversal is rejected, not normalized. */
export declare function assertSkillerPortableRelativePath(value: string): void;
export declare function assertSkillerPortableSkillSourcePath(value: string): void;
/** Credentials belong in a credential helper or SSH agent, never in a portable manifest. */
export declare function assertCredentialFreeGitRemote(remote: string): void;
export declare function validateSkillerSyncManifest(input: unknown): SkillerSyncManifest;
export declare function parseSkillerSyncManifest(text: string): SkillerSyncManifest;
export declare function stringifySkillerSyncManifest(manifest: SkillerSyncManifest): string;
export declare function createSkillerSyncManifest(profileId: string, mode?: SkillerSyncManifest["profile"]["mode"], agentPolicy?: SkillerSyncManifest["agent_policy"]): SkillerSyncManifest;
/**
 * Builds Skiller's compatibility publish payload without writing to the library.
 * Source inspection, integrity, and secret findings come from dotagents's shared export policy.
 */
export declare function planSkillerSyncPublish(profileId: string, mode: SkillerSyncManifest["profile"]["mode"], candidates: SkillerSyncPublishCandidate[], agentPolicy?: SkillerSyncManifest["agent_policy"]): SkillerSyncPublishPlan;
/** Keeps untouched remote skills while applying an explicitly reviewed owned-skill update. */
export declare function mergeSkillerSyncPublishUpdate(base: SkillerSyncManifest, update: SkillerSyncPublishPlan, options?: {
    allowSourceConversion?: boolean;
}): SkillerSyncPublishPlan;
//# sourceMappingURL=skiller.d.ts.map
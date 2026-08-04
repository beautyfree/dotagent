import { z } from "zod";
export declare const sourceTrustPolicySchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<["deny", "allowlist", "allow-all"]>>;
    repositories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    hosts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    github_organizations: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allow_local: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    mode: "deny" | "allowlist" | "allow-all";
    repositories: string[];
    hosts: string[];
    github_organizations: string[];
    allow_local: boolean;
}, {
    mode?: "deny" | "allowlist" | "allow-all" | undefined;
    repositories?: string[] | undefined;
    hosts?: string[] | undefined;
    github_organizations?: string[] | undefined;
    allow_local?: boolean | undefined;
}>;
export declare const sourceSecurityPolicySchema: z.ZodObject<{
    trust: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["deny", "allowlist", "allow-all"]>>;
        repositories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        hosts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        github_organizations: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        allow_local: z.ZodDefault<z.ZodBoolean>;
    }, "strict", z.ZodTypeAny, {
        mode: "deny" | "allowlist" | "allow-all";
        repositories: string[];
        hosts: string[];
        github_organizations: string[];
        allow_local: boolean;
    }, {
        mode?: "deny" | "allowlist" | "allow-all" | undefined;
        repositories?: string[] | undefined;
        hosts?: string[] | undefined;
        github_organizations?: string[] | undefined;
        allow_local?: boolean | undefined;
    }>>;
    minimum_release_age_minutes: z.ZodDefault<z.ZodNumber>;
    minimum_release_age_exclude: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    trust: {
        mode: "deny" | "allowlist" | "allow-all";
        repositories: string[];
        hosts: string[];
        github_organizations: string[];
        allow_local: boolean;
    };
    minimum_release_age_minutes: number;
    minimum_release_age_exclude: string[];
}, {
    trust?: {
        mode?: "deny" | "allowlist" | "allow-all" | undefined;
        repositories?: string[] | undefined;
        hosts?: string[] | undefined;
        github_organizations?: string[] | undefined;
        allow_local?: boolean | undefined;
    } | undefined;
    minimum_release_age_minutes?: number | undefined;
    minimum_release_age_exclude?: string[] | undefined;
}>;
export type SourceTrustPolicy = z.input<typeof sourceTrustPolicySchema>;
export type SourceSecurityPolicyInput = z.input<typeof sourceSecurityPolicySchema>;
export type SourceSecurityPolicy = z.output<typeof sourceSecurityPolicySchema>;
export type SourceTrustRule = "allow-all" | "repository" | "host" | "github-organization" | "local-repository";
export interface SourceTrustDecision {
    source: string;
    kind: "git" | "local";
    rule: SourceTrustRule;
    matched: string;
}
export interface SourceCommitAgeDecision {
    source: string;
    committedAt: string;
    ageMinutes: number;
    minimumAgeMinutes: number;
    excluded: boolean;
}
export declare class SourceTrustError extends Error {
    readonly code: "source-not-trusted";
    readonly source: string;
    constructor(source: string, message: string);
}
export declare class SourceReleaseAgeError extends Error {
    readonly code: "source-too-new";
    readonly decision: SourceCommitAgeDecision;
    constructor(decision: SourceCommitAgeDecision);
}
/** Parse, normalize, and deterministically order device source policy. */
export declare function parseSourceSecurityPolicy(input?: SourceSecurityPolicyInput): SourceSecurityPolicy;
export declare const DENY_ALL_SOURCE_SECURITY_POLICY: {
    trust: {
        mode: "deny" | "allowlist" | "allow-all";
        repositories: string[];
        hosts: string[];
        github_organizations: string[];
        allow_local: boolean;
    };
    minimum_release_age_minutes: number;
    minimum_release_age_exclude: string[];
};
/** Build the narrowest policy that trusts exactly the reviewed source list. */
export declare function exactSourceSecurityPolicy(sources: Iterable<string>, options?: Pick<SourceSecurityPolicyInput, "minimum_release_age_minutes" | "minimum_release_age_exclude">): SourceSecurityPolicy;
/** Validate one source before a resolver performs any filesystem cache or network operation. */
export declare function requireTrustedSource(source: string, input: SourceSecurityPolicyInput): SourceTrustDecision;
/** Enforce the reviewed cooling-off period without silently choosing a different commit. */
export declare function requireMinimumReleaseAge(source: string, committedAt: string, input: SourceSecurityPolicyInput, now?: Date): SourceCommitAgeDecision;
//# sourceMappingURL=source-policy.d.ts.map
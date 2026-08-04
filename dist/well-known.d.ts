import { z } from "zod";
import { type SourceSecurityPolicy, type SourceSecurityPolicyInput, type SourceTrustDecision } from "./source-policy.js";
export declare const WELL_KNOWN_INDEX_VERSION: 1;
export declare const wellKnownIndexSchema: z.ZodObject<{
    schema_version: z.ZodLiteral<1>;
    libraries: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        manifest_url: z.ZodEffects<z.ZodString, string, string>;
        description: z.ZodOptional<z.ZodString>;
        sha256: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        manifest_url: string;
        sha256?: string | undefined;
        description?: string | undefined;
    }, {
        id: string;
        manifest_url: string;
        sha256?: string | undefined;
        description?: string | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    schema_version: 1;
    libraries: {
        id: string;
        manifest_url: string;
        sha256?: string | undefined;
        description?: string | undefined;
    }[];
}, {
    schema_version: 1;
    libraries: {
        id: string;
        manifest_url: string;
        sha256?: string | undefined;
        description?: string | undefined;
    }[];
}>;
export type WellKnownIndex = z.infer<typeof wellKnownIndexSchema>;
export interface WellKnownIndexRequestPlan {
    kind: "well-known-index-request";
    schemaVersion: 1;
    planId: string;
    url: string;
    sourcePolicy: SourceSecurityPolicy;
    trust: SourceTrustDecision;
}
export interface WellKnownResponse {
    ok: boolean;
    status: number;
    headers: {
        get(name: string): string | null;
    };
    text(): Promise<string>;
}
export interface WellKnownHttpPort {
    fetch(url: string, init: {
        redirect: "error";
        signal: AbortSignal;
        headers: Record<string, string>;
    }): Promise<WellKnownResponse>;
}
export interface WellKnownFetchOptions {
    port?: WellKnownHttpPort;
    timeoutMs?: number;
    maximumBytes?: number;
}
export interface ReviewedWellKnownLibrary {
    id: string;
    manifestUrl: string;
    description?: string;
    sha256?: string;
    trust: SourceTrustDecision | null;
    blockedReason?: "source-not-trusted";
}
export interface WellKnownIndexReview {
    kind: "well-known-index-review";
    schemaVersion: 1;
    planId: string;
    requestPlanId: string;
    url: string;
    indexIntegrity: string;
    libraries: ReviewedWellKnownLibrary[];
}
export declare function planWellKnownIndexRequest(url: string, sourcePolicy: SourceSecurityPolicyInput): WellKnownIndexRequestPlan;
/** Fetch one already reviewed HTTPS index without redirects or delegated trust. */
export declare function fetchWellKnownIndex(plan: WellKnownIndexRequestPlan, expectedPlanId: string, options?: WellKnownFetchOptions): Promise<WellKnownIndexReview>;
//# sourceMappingURL=well-known.d.ts.map
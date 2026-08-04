import { createHash } from "node:crypto";
import { z } from "zod";
import { computePlanId } from "./plan.js";
import { parseSourceSecurityPolicy, requireTrustedSource, } from "./source-policy.js";
export const WELL_KNOWN_INDEX_VERSION = 1;
const httpsArtifact = z
    .string()
    .url()
    .max(2_048)
    .superRefine((value, context) => {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "Well-known artifacts require HTTPS" });
    }
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Well-known artifact URLs cannot contain credentials, queries, or fragments",
        });
    }
});
export const wellKnownIndexSchema = z
    .object({
    schema_version: z.literal(WELL_KNOWN_INDEX_VERSION),
    libraries: z
        .array(z
        .object({
        id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        manifest_url: httpsArtifact,
        description: z.string().max(512).optional(),
        sha256: z
            .string()
            .regex(/^[a-f0-9]{64}$/)
            .optional(),
    })
        .strict())
        .max(500),
})
    .strict();
function exactHttpsUrl(value) {
    const parsed = new URL(httpsArtifact.parse(value));
    return parsed.href;
}
export function planWellKnownIndexRequest(url, sourcePolicy) {
    const exact = exactHttpsUrl(url);
    const policy = parseSourceSecurityPolicy(sourcePolicy);
    const trust = requireTrustedSource(exact, policy);
    const data = {
        kind: "well-known-index-request",
        schemaVersion: 1,
        url: exact,
        sourcePolicy: policy,
        trust,
    };
    return { ...data, planId: computePlanId(data) };
}
function defaultPort() {
    return {
        fetch: (url, init) => fetch(url, init),
    };
}
/** Fetch one already reviewed HTTPS index without redirects or delegated trust. */
export async function fetchWellKnownIndex(plan, expectedPlanId, options = {}) {
    const current = planWellKnownIndexRequest(plan.url, plan.sourcePolicy);
    if (!expectedPlanId || plan.planId !== expectedPlanId || current.planId !== plan.planId) {
        throw new Error("Well-known index request changed after review");
    }
    const timeoutMs = options.timeoutMs ?? 10_000;
    const maximumBytes = options.maximumBytes ?? 1024 * 1024;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
        throw new Error("Invalid index timeout");
    if (!Number.isInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 10 * 1024 * 1024) {
        throw new Error("Invalid index size limit");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await (options.port ?? defaultPort()).fetch(plan.url, {
            redirect: "error",
            signal: controller.signal,
            headers: { accept: "application/json" },
        });
    }
    finally {
        clearTimeout(timeout);
    }
    if (!response.ok)
        throw new Error(`Well-known index request failed with HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
        throw new Error(`Well-known index exceeds ${maximumBytes} bytes`);
    }
    const text = await response.text();
    if (Buffer.byteLength(text) > maximumBytes)
        throw new Error(`Well-known index exceeds ${maximumBytes} bytes`);
    const index = wellKnownIndexSchema.parse(JSON.parse(text));
    const seen = new Set();
    const libraries = [...index.libraries]
        .sort((left, right) => left.id.localeCompare(right.id, "en"))
        .map((entry) => {
        if (seen.has(entry.id))
            throw new Error(`Duplicate well-known library id: ${entry.id}`);
        seen.add(entry.id);
        const manifestUrl = exactHttpsUrl(entry.manifest_url);
        try {
            const trust = requireTrustedSource(manifestUrl, plan.sourcePolicy);
            return {
                id: entry.id,
                manifestUrl,
                ...(entry.description ? { description: entry.description } : {}),
                ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
                trust,
            };
        }
        catch {
            return {
                id: entry.id,
                manifestUrl,
                ...(entry.description ? { description: entry.description } : {}),
                ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
                trust: null,
                blockedReason: "source-not-trusted",
            };
        }
    });
    const indexIntegrity = createHash("sha256").update(text).digest("hex");
    const data = {
        kind: "well-known-index-review",
        schemaVersion: 1,
        requestPlanId: plan.planId,
        url: plan.url,
        indexIntegrity,
        libraries,
    };
    return { ...data, planId: computePlanId(data) };
}
//# sourceMappingURL=well-known.js.map
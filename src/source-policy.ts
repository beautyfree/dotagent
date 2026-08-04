import { z } from "zod";
import { normalizeGitIdentity } from "./git-identity.js";

const host = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i);
const githubOrganization = z
  .string()
  .min(1)
  .max(39)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i);

export const sourceTrustPolicySchema = z
  .object({
    mode: z.enum(["deny", "allowlist", "allow-all"]).default("deny"),
    repositories: z.array(z.string().min(1).max(2_048)).default([]),
    hosts: z.array(host).default([]),
    github_organizations: z.array(githubOrganization).default([]),
    allow_local: z.boolean().default(false),
  })
  .strict();

export const sourceSecurityPolicySchema = z
  .object({
    trust: sourceTrustPolicySchema.default({ mode: "deny" }),
    minimum_release_age_minutes: z.number().int().min(0).max(525_600).default(0),
    minimum_release_age_exclude: z.array(z.string().min(1).max(2_048)).default([]),
  })
  .strict();

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

export class SourceTrustError extends Error {
  readonly code = "source-not-trusted" as const;
  readonly source: string;

  constructor(source: string, message: string) {
    super(message);
    this.name = "SourceTrustError";
    this.source = source;
  }
}

export class SourceReleaseAgeError extends Error {
  readonly code = "source-too-new" as const;
  readonly decision: SourceCommitAgeDecision;

  constructor(decision: SourceCommitAgeDecision) {
    super(
      `Source ${decision.source} resolved to a commit that is ${decision.ageMinutes} minutes old; ` +
        `the reviewed minimum is ${decision.minimumAgeMinutes} minutes`,
    );
    this.name = "SourceReleaseAgeError";
    this.decision = decision;
  }
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizedHost(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function normalizedRepository(value: string): string {
  return normalizeGitIdentity(value);
}

/** Parse, normalize, and deterministically order device source policy. */
export function parseSourceSecurityPolicy(input: SourceSecurityPolicyInput = {}): SourceSecurityPolicy {
  const parsed = sourceSecurityPolicySchema.parse(input);
  return {
    trust: {
      mode: parsed.trust.mode,
      repositories: uniqueSorted(parsed.trust.repositories.map(normalizedRepository)),
      hosts: uniqueSorted(parsed.trust.hosts.map(normalizedHost)),
      github_organizations: uniqueSorted(
        parsed.trust.github_organizations.map((entry) => entry.toLocaleLowerCase("en-US")),
      ),
      allow_local: parsed.trust.allow_local,
    },
    minimum_release_age_minutes: parsed.minimum_release_age_minutes,
    minimum_release_age_exclude: uniqueSorted(parsed.minimum_release_age_exclude.map(normalizedRepository)),
  };
}

export const DENY_ALL_SOURCE_SECURITY_POLICY = parseSourceSecurityPolicy();

/** Build the narrowest policy that trusts exactly the reviewed source list. */
export function exactSourceSecurityPolicy(
  sources: Iterable<string>,
  options: Pick<SourceSecurityPolicyInput, "minimum_release_age_minutes" | "minimum_release_age_exclude"> = {},
): SourceSecurityPolicy {
  const repositories = uniqueSorted([...sources].map(normalizedRepository));
  return parseSourceSecurityPolicy({
    trust: {
      mode: "allowlist",
      repositories,
      allow_local: repositories.some((entry) => entry.startsWith("file:")),
    },
    ...options,
  });
}

function repositoryParts(identity: string): { host: string; owner: string | null } | null {
  if (identity.startsWith("file:")) return null;
  const parsed = new URL(identity);
  const owner = parsed.pathname.split("/").filter(Boolean)[0]?.toLocaleLowerCase("en-US") ?? null;
  return { host: parsed.host.toLocaleLowerCase("en-US"), owner };
}

/** Validate one source before a resolver performs any filesystem cache or network operation. */
export function requireTrustedSource(source: string, input: SourceSecurityPolicyInput): SourceTrustDecision {
  const policy = parseSourceSecurityPolicy(input);
  const identity = normalizedRepository(source);
  const local = identity.startsWith("file:");

  if (local) {
    if (!policy.trust.allow_local)
      throw new SourceTrustError(identity, `Local source ${identity} requires an explicit allow_local decision`);
    if (policy.trust.mode === "allow-all")
      return { source: identity, kind: "local", rule: "allow-all", matched: "allow-all" };
    if (policy.trust.repositories.includes(identity))
      return { source: identity, kind: "local", rule: "local-repository", matched: identity };
    throw new SourceTrustError(identity, `Local source ${identity} is not in the reviewed repository allowlist`);
  }

  if (policy.trust.mode === "allow-all")
    return { source: identity, kind: "git", rule: "allow-all", matched: "allow-all" };
  if (policy.trust.mode === "deny")
    throw new SourceTrustError(identity, `Source ${identity} is blocked because no device trust decision was provided`);
  if (policy.trust.repositories.includes(identity))
    return { source: identity, kind: "git", rule: "repository", matched: identity };

  const parts = repositoryParts(identity);
  if (parts && policy.trust.hosts.includes(parts.host))
    return { source: identity, kind: "git", rule: "host", matched: parts.host };
  if (parts?.host === "github.com" && parts.owner && policy.trust.github_organizations.includes(parts.owner))
    return { source: identity, kind: "git", rule: "github-organization", matched: parts.owner };

  throw new SourceTrustError(identity, `Source ${identity} is not allowed by the reviewed device trust policy`);
}

/** Enforce the reviewed cooling-off period without silently choosing a different commit. */
export function requireMinimumReleaseAge(
  source: string,
  committedAt: string,
  input: SourceSecurityPolicyInput,
  now = new Date(),
): SourceCommitAgeDecision {
  const policy = parseSourceSecurityPolicy(input);
  const identity = normalizedRepository(source);
  const timestamp = Date.parse(committedAt);
  if (!Number.isFinite(timestamp)) throw new Error(`Git returned an invalid commit timestamp for ${identity}`);
  const ageMinutes = Math.floor((now.getTime() - timestamp) / 60_000);
  const excluded = policy.minimum_release_age_exclude.includes(identity);
  const decision = {
    source: identity,
    committedAt: new Date(timestamp).toISOString(),
    ageMinutes,
    minimumAgeMinutes: policy.minimum_release_age_minutes,
    excluded,
  };
  if (!excluded && ageMinutes < policy.minimum_release_age_minutes) throw new SourceReleaseAgeError(decision);
  return decision;
}

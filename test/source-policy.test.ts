import { describe, expect, it } from "bun:test";
import {
  SourceReleaseAgeError,
  SourceTrustError,
  exactSourceSecurityPolicy,
  parseSourceSecurityPolicy,
  requireMinimumReleaseAge,
  requireTrustedSource,
} from "../src/source-policy.js";

describe("source trust policy", () => {
  it("denies network and local sources when no device policy exists", () => {
    expect(() => requireTrustedSource("https://github.com/example/skills", {})).toThrow(SourceTrustError);
    expect(() => requireTrustedSource("file:///tmp/skills", {})).toThrow(SourceTrustError);
  });

  it("normalizes transport spellings before exact repository comparison", () => {
    const policy = exactSourceSecurityPolicy(["https://github.com/Example/skills.git"]);
    expect(requireTrustedSource("git@github.com:Example/skills.git", policy)).toEqual({
      source: "https://github.com/Example/skills",
      kind: "git",
      rule: "repository",
      matched: "https://github.com/Example/skills",
    });
  });

  it("supports bounded host and GitHub organization grants", () => {
    const policy = parseSourceSecurityPolicy({
      trust: {
        mode: "allowlist",
        hosts: ["git.corp.example"],
        github_organizations: ["BeautyFree"],
      },
    });
    expect(requireTrustedSource("ssh://git.corp.example/team/skills", policy).rule).toBe("host");
    expect(requireTrustedSource("https://github.com/beautyfree/skills", policy).rule).toBe("github-organization");
    expect(() => requireTrustedSource("https://github.com/other/skills", policy)).toThrow(SourceTrustError);
  });

  it("requires both local opt-in and an exact local repository grant", () => {
    const source = "file:///tmp/reviewed-skills";
    const missingOptIn = parseSourceSecurityPolicy({
      trust: { mode: "allowlist", repositories: [source] },
    });
    expect(() => requireTrustedSource(source, missingOptIn)).toThrow(/allow_local/);
    expect(requireTrustedSource(source, exactSourceSecurityPolicy([source])).rule).toBe("local-repository");
  });

  it("rejects credential-like query strings and fragments before comparison", () => {
    const policy = exactSourceSecurityPolicy(["https://github.com/example/skills"]);
    expect(() => requireTrustedSource("https://github.com/example/skills?token=secret", policy)).toThrow(
      /query parameters/,
    );
    expect(() => requireTrustedSource("https://github.com/example/skills#main", policy)).toThrow(/fragments/);
  });
});

describe("source release age policy", () => {
  const source = "https://github.com/example/skills";
  const now = new Date("2026-08-03T12:00:00.000Z");

  it("blocks a too-new commit and returns only value-free policy evidence", () => {
    const policy = exactSourceSecurityPolicy([source], { minimum_release_age_minutes: 60 });
    expect(() => requireMinimumReleaseAge(source, "2026-08-03T11:30:00.000Z", policy, now)).toThrow(
      SourceReleaseAgeError,
    );
    try {
      requireMinimumReleaseAge(source, "2026-08-03T11:30:00.000Z", policy, now);
    } catch (error) {
      expect((error as SourceReleaseAgeError).decision).toEqual({
        source,
        committedAt: "2026-08-03T11:30:00.000Z",
        ageMinutes: 30,
        minimumAgeMinutes: 60,
        excluded: false,
      });
    }
  });

  it("allows an old commit and an exact reviewed exclusion", () => {
    const policy = exactSourceSecurityPolicy([source], {
      minimum_release_age_minutes: 60,
      minimum_release_age_exclude: [source],
    });
    expect(requireMinimumReleaseAge(source, "2026-08-03T11:59:00.000Z", policy, now).excluded).toBe(true);
    expect(
      requireMinimumReleaseAge(
        source,
        "2026-08-03T10:00:00.000Z",
        exactSourceSecurityPolicy([source], { minimum_release_age_minutes: 60 }),
        now,
      ).ageMinutes,
    ).toBe(120);
  });
});

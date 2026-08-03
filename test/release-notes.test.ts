import { describe, expect, it } from "bun:test";
import { extractReleaseNotes } from "../scripts/release-notes.mjs";

describe("release notes artifact", () => {
  it("extracts the exact version without including adjacent releases", () => {
    const changelog = `# Changelog\n\n## [0.2.0](https://example.invalid) - 2026-08-03\n\n- New flow.\n\n## [0.1.0] - 2026-08-01\n\n- First flow.\n`;
    expect(extractReleaseNotes(changelog, "0.2.0")).toBe(
      "## [0.2.0](https://example.invalid) - 2026-08-03\n\n- New flow.\n",
    );
  });

  it("uses Unreleased only for non-publishing validation artifacts", () => {
    const changelog = "# Changelog\n\n## Unreleased\n\n- Candidate change.\n";
    expect(extractReleaseNotes(changelog, "0.0.0", { allowUnreleased: true })).toContain("Candidate change");
    expect(() => extractReleaseNotes(changelog, "0.1.0")).toThrow("no release section for 0.1.0");
  });
});

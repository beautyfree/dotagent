import { describe, expect, test } from "bun:test";
import { parseLibraryLock, parseLibraryManifest } from "../src/library.js";

const manifest = {
  schema_version: 1,
  name: "my-agent-library",
  version: "1.0.0",
  skills: ["skills/review"],
  dependencies: {
    community: { url: "https://github.com/example/skills", ref: "v1.2.0", select: ["skills/git"] },
  },
};

describe("library manifest", () => {
  test("accepts a portable package manifest", () => {
    const result = parseLibraryManifest(JSON.stringify(manifest));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.skills).toEqual(["skills/review"]);
  });

  test("rejects traversal and case-folded duplicate paths", () => {
    const traversal = parseLibraryManifest(JSON.stringify({ ...manifest, skills: ["../secret"] }));
    expect(traversal.ok).toBe(false);
    const duplicate = parseLibraryManifest(JSON.stringify({ ...manifest, skills: ["skills/Review", "skills/review"] }));
    expect(duplicate.ok).toBe(false);
  });

  test("rejects unknown schema versions instead of guessing", () => {
    const result = parseLibraryManifest(JSON.stringify({ ...manifest, schema_version: 2 }));
    expect(result.ok).toBe(false);
  });
});

describe("library lock", () => {
  test("requires immutable commits and integrity", () => {
    const result = parseLibraryLock(JSON.stringify({
      lockfile_version: 1,
      generated_by: "@beautyfree/dotagent@0.0.0",
      resolved: {
        community: {
          url: "https://github.com/example/skills",
          requested_ref: "v1.2.0",
          commit: "a".repeat(40),
          integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          skills: [{ name: "git", path: "skills/git" }],
        },
      },
    }));
    expect(result.ok).toBe(true);
  });
});

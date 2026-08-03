import { describe, expect, it } from "bun:test";
import { parseMaterializationTargetSpec } from "../src/cli-target.js";

describe("materialization target CLI syntax", () => {
  it("parses explicit modes and retains Windows drive separators", () => {
    expect(parseMaterializationTargetSpec("codex=symlink=/home/test/.codex/skills")).toEqual({ slug: "codex", mode: "symlink", root: "/home/test/.codex/skills" });
    expect(parseMaterializationTargetSpec("codex=junction=C:\\Users\\test\\.codex\\skills")).toEqual({ slug: "codex", mode: "junction", root: "C:\\Users\\test\\.codex\\skills" });
    expect(parseMaterializationTargetSpec("gemini=native=")).toEqual({ slug: "gemini", mode: "native", root: null });
  });

  it("rejects implicit or malformed targets", () => {
    expect(() => parseMaterializationTargetSpec("codex=/tmp")).toThrow("expected");
    expect(() => parseMaterializationTargetSpec("Codex=copy=/tmp")).toThrow("slug");
    expect(() => parseMaterializationTargetSpec("codex=copy=")).toThrow("requires");
  });
});

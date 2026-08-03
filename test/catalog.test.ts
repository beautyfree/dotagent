import { describe, expect, it } from "bun:test";
import { validateAgentDescriptor } from "../src/agents.js";
import {
  BUILTIN_AGENT_CATALOG_VERSION,
  builtinAgentCatalog,
  builtinAgentCatalogEntry,
  builtinAgentDescriptors,
} from "../src/catalog.js";

describe("built-in agent capability catalog", () => {
  it("ships unique, valid descriptors for every supported bundled agent", () => {
    const entries = builtinAgentCatalog();
    const descriptors = builtinAgentDescriptors();
    expect(BUILTIN_AGENT_CATALOG_VERSION).toBe(1);
    expect(entries.length).toBeGreaterThan(45);
    expect(descriptors).toHaveLength(entries.length);
    expect(new Set(entries.map((entry) => entry.slug)).size).toBe(entries.length);
    for (const descriptor of descriptors) expect(() => validateAgentDescriptor(descriptor)).not.toThrow();
  });

  it("models shared reading separately from installation evidence", () => {
    const codex = builtinAgentDescriptors().find((descriptor) => descriptor.slug === "codex");
    expect(codex?.skills).toContainEqual({ kind: "native-shared" });
    expect(codex?.detection).not.toContainEqual(
      expect.objectContaining({ path: expect.stringContaining(".agents/skills") }),
    );
  });

  it("returns defensive copies to extension consumers", () => {
    const codex = builtinAgentCatalogEntry("codex");
    if (!codex) throw new Error("codex is missing from the built-in catalog");
    codex.skillRoots.push("~/mutated");
    expect(builtinAgentCatalogEntry("codex")?.skillRoots).not.toContain("~/mutated");
  });
});

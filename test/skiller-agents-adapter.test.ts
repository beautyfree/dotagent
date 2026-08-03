import { describe, expect, it } from "bun:test";
import { skillerAgentCatalogToDescriptors } from "../src/adapters/skiller-agents.js";

describe("Skiller agent catalog adapter", () => {
  it("models shared readers separately from per-agent delivery roots", () => {
    const [descriptor] = skillerAgentCatalogToDescriptors([
      {
        slug: "codex",
        name: "Codex",
        global_paths: ["~/.codex/skills"],
        cli_command: "codex",
        detect_paths: ["~/.codex"],
        additional_readable_paths: [{ path: "~/.agents/skills", source_agent: "shared" }],
      },
    ]);
    expect(descriptor?.skills).toEqual([
      { kind: "native-shared" },
      { kind: "per-skill-link", roots: ["~/.codex/skills"] },
    ]);
    expect(descriptor?.detection).toEqual([
      { kind: "command", command: "codex" },
      { kind: "marker", path: "~/.codex", ignoreSkillsOnly: true },
    ]);
  });
});

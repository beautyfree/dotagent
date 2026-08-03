import { describe, expect, it } from "bun:test";
import type { AgentDescriptor } from "../src/agents.js";
import { scanMachineAgents, type MachinePathKind, type MachinePort } from "../src/machine.js";

class FakeMachine implements MachinePort {
  constructor(
    readonly commands = new Set<string>(),
    readonly kinds = new Map<string, MachinePathKind>(),
    readonly entries = new Map<string, string[]>(),
  ) {}
  async commandExists(command: string): Promise<boolean> { return this.commands.has(command); }
  async pathKind(filePath: string): Promise<MachinePathKind> { return this.kinds.get(filePath) ?? "missing"; }
  async listDirectory(directory: string): Promise<string[]> { return this.entries.get(directory) ?? []; }
}

const codex: AgentDescriptor = {
  slug: "codex",
  displayName: "Codex",
  platforms: ["darwin", "linux", "win32"],
  detection: [
    { kind: "command", command: "codex" },
    { kind: "marker", path: "~/.codex", ignoreSkillsOnly: true },
  ],
  skills: [
    { kind: "native-shared" },
    { kind: "per-skill-link", roots: ["~/.codex/skills"] },
  ],
};

describe("machine agent scan", () => {
  it("prefers command evidence", async () => {
    const inventory = await scanMachineAgents([codex], { platform: "darwin", home: "/home/test", port: new FakeMachine(new Set(["codex"])) });
    expect(inventory.agents[0]).toMatchObject({ detected: true, reason: "command", evidence: "codex" });
  });

  it("does not treat a directory containing only managed skills as an installed agent", async () => {
    const port = new FakeMachine(
      new Set(),
      new Map([["/home/test/.codex", "directory"]]),
      new Map([
        ["/home/test/.codex", ["skills"]],
      ]),
    );
    const inventory = await scanMachineAgents([codex], { platform: "linux", home: "/home/test", port });
    expect(inventory.agents[0]).toMatchObject({ detected: false, reason: "skills-only" });
  });

  it("accepts a marker that contains real agent state beside skills", async () => {
    const port = new FakeMachine(
      new Set(),
      new Map([["/home/test/.codex", "directory"]]),
      new Map([["/home/test/.codex", ["config.json", "skills"]]]),
    );
    const inventory = await scanMachineAgents([codex], { platform: "linux", home: "/home/test", port });
    expect(inventory.agents[0]).toMatchObject({ detected: true, reason: "marker" });
  });

  it("keeps unsupported platforms explicit", async () => {
    const descriptor = { ...codex, platforms: ["darwin" as const] };
    const inventory = await scanMachineAgents([descriptor], { platform: "win32", home: "C:\\Users\\test", port: new FakeMachine() });
    expect(inventory.agents[0]).toMatchObject({ detected: false, reason: "unsupported-platform" });
  });
});

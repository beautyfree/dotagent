import { describe, expect, it } from "bun:test";
import {
  GitHubProviderAdapter,
  GitLabProviderAdapter,
  planProviderLibraryCreation,
  validateRemoteConnection,
  type CommandPort,
} from "../src/providers.js";

class StubCommand implements CommandPort {
  calls: Array<{ command: string; args: string[] }> = [];
  constructor(private readonly output: string) {}
  async run(command: string, args: string[]): Promise<string> {
    this.calls.push({ command, args });
    return this.output;
  }
}

class PagedStubCommand implements CommandPort {
  calls: Array<{ command: string; args: string[] }> = [];
  constructor(private readonly pages: string[]) {}
  async run(command: string, args: string[]): Promise<string> {
    this.calls.push({ command, args });
    const page = Number(args[args.indexOf("--page") + 1] ?? "1");
    return this.pages[page - 1] ?? "[]";
  }
}

describe("provider-neutral remote connections", () => {
  it("accepts every provider only through a credential-free Git remote", () => {
    expect(
      validateRemoteConnection({ provider: "gitlab", label: "Work", remote: "git@gitlab.example:team/library.git" }),
    ).toEqual({ provider: "gitlab", label: "Work", remote: "git@gitlab.example:team/library.git" });
    expect(() =>
      validateRemoteConnection({
        provider: "generic",
        label: "Unsafe",
        remote: "https://user:token@example.com/library.git",
      }),
    ).toThrow("credentials");
  });
});

describe("provider adapters", () => {
  it("reviews the exact provider, name, and visibility before any repository can be created", () => {
    const github = planProviderLibraryCreation("github", " team/agent-library ");
    expect(github).toEqual(planProviderLibraryCreation("github", "team/agent-library"));
    expect(planProviderLibraryCreation("github", "team/agent-library", "public").planId).not.toBe(github.planId);
    expect(() => planProviderLibraryCreation("github", "https://github.com/team/library")).toThrow();
    expect(() => planProviderLibraryCreation("gitlab", "team/../library")).toThrow();
  });

  it("lists GitHub libraries without reading or storing a token", async () => {
    const command = new StubCommand(
      JSON.stringify([
        { full_name: "team/library", ssh_url: "git@github.com:team/library.git", permissions: { push: true } },
        {
          full_name: "team/read-only",
          clone_url: "https://github.com/team/read-only.git",
          permissions: { push: false },
        },
      ]),
    );
    const adapter = new GitHubProviderAdapter(command);
    await expect(adapter.listLibraries()).resolves.toEqual([
      { provider: "github", label: "team/library", remote: "git@github.com:team/library.git" },
    ]);
    expect(command.calls[0]).toEqual({
      command: "gh",
      args: [
        "api",
        "--paginate",
        "--slurp",
        "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100",
      ],
    });
  });

  it("lists every GitLab page without assuming gitlab.com or duplicating projects", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      path_with_namespace: `team/library-${index}`,
      http_url_to_repo: `https://gitlab.example/team/library-${index}.git`,
    }));
    const command = new PagedStubCommand([
      JSON.stringify(firstPage),
      JSON.stringify([
        { path_with_namespace: "team/library-0", http_url_to_repo: "https://gitlab.example/team/library-0.git" },
        { path_with_namespace: "team/final", http_url_to_repo: "https://gitlab.example/team/final.git" },
      ]),
    ]);
    const adapter = new GitLabProviderAdapter(command);
    const libraries = await adapter.listLibraries();
    expect(libraries).toHaveLength(101);
    expect(libraries.at(-1)).toEqual({
      provider: "gitlab",
      label: "team/final",
      remote: "https://gitlab.example/team/final.git",
    });
    expect(command.calls).toHaveLength(2);
    expect(command.calls[1]?.args).toContain("2");
  });

  it("keeps an empty authenticated provider list distinct from an unconfigured generic remote", async () => {
    const command: CommandPort = { run: async () => "[]" };
    await expect(new GitHubProviderAdapter(command).listLibraries()).resolves.toEqual([]);
    await expect(new GitLabProviderAdapter(command).listLibraries()).resolves.toEqual([]);
  });

  it("creates only the exact reviewed private repository through its own provider CLI", async () => {
    const githubCalls: Array<{ command: string; args: string[] }> = [];
    const github: CommandPort = {
      run: async (command, args) => {
        githubCalls.push({ command, args });
        return args.includes("view") ? "git@github.com:team/agent-library.git\n" : "";
      },
    };
    const githubPlan = planProviderLibraryCreation("github", "team/agent-library");
    await expect(new GitHubProviderAdapter(github).createLibrary(githubPlan)).resolves.toEqual({
      provider: "github",
      label: "team/agent-library",
      remote: "git@github.com:team/agent-library.git",
    });
    expect(githubCalls).toEqual([
      { command: "gh", args: ["repo", "create", "team/agent-library", "--private", "--disable-wiki"] },
      { command: "gh", args: ["repo", "view", "team/agent-library", "--json", "sshUrl", "--jq", ".sshUrl"] },
    ]);

    const gitlabCalls: Array<{ command: string; args: string[] }> = [];
    const gitlab: CommandPort = {
      run: async (command, args) => {
        gitlabCalls.push({ command, args });
        return args.includes("view") ? "git@gitlab.example:team/agent-library.git\n" : "";
      },
    };
    const gitlabPlan = planProviderLibraryCreation("gitlab", "team/agent-library");
    await expect(new GitLabProviderAdapter(gitlab).createLibrary(gitlabPlan)).resolves.toEqual({
      provider: "gitlab",
      label: "team/agent-library",
      remote: "git@gitlab.example:team/agent-library.git",
    });
    expect(gitlabCalls).toEqual([
      { command: "glab", args: ["repo", "create", "team/agent-library", "--private", "--skipGitInit"] },
      {
        command: "glab",
        args: ["repo", "view", "team/agent-library", "--output", "json", "--jq", ".ssh_url_to_repo"],
      },
    ]);
  });

  it("rejects a changed creation plan before invoking the provider CLI", async () => {
    const command: CommandPort = { run: async () => Promise.reject(new Error("must not run")) };
    const plan = planProviderLibraryCreation("github", "agent-library");
    await expect(new GitHubProviderAdapter(command).createLibrary({ ...plan, visibility: "public" })).rejects.toThrow(
      "changed after review",
    );
  });
});

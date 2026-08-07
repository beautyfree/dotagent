import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { credentialFreeGitRemote } from "./git-workspace.js";
import { computePlanId } from "./plan.js";
const execFileAsync = promisify(execFile);
export const providerKindSchema = z.enum(["github", "gitlab", "generic"]);
export const remoteConnectionSchema = z
    .object({ provider: providerKindSchema, remote: z.string().min(1), label: z.string().trim().min(1).max(80) })
    .strict()
    .transform((value) => ({ ...value, remote: credentialFreeGitRemote(value.remote).remote }));
function providerLibraryName(provider, value) {
    const name = value.trim();
    const valid = provider === "github"
        ? /^(?:[A-Za-z0-9-]+\/)?[A-Za-z0-9._-]{1,100}$/.test(name)
        : /^[A-Za-z0-9._-]{1,100}(?:\/[A-Za-z0-9._-]{1,100}){0,19}$/.test(name);
    if (!valid || name.split("/").some((segment) => segment === "." || segment === ".."))
        throw new Error(provider === "github"
            ? "GitHub library name must be `name` or `owner/name`"
            : "GitLab library name must be `name` or `group[/subgroup]/name`");
    return name;
}
/** A no-network, deterministic review of the exact remote repository to create. */
export function planProviderLibraryCreation(provider, name, visibility = "private") {
    const payload = {
        kind: "provider-library-create",
        schemaVersion: 1,
        provider,
        name: providerLibraryName(provider, name),
        visibility,
    };
    return { ...payload, planId: computePlanId(payload) };
}
export class NodeCommandPort {
    async run(command, args) {
        try {
            const { stdout } = await execFileAsync(command, args, { encoding: "utf8", windowsHide: true });
            return stdout;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`${command} is unavailable or not authenticated. ${message}`);
        }
    }
}
function jsonArray(input) {
    const parsed = JSON.parse(input);
    if (!Array.isArray(parsed))
        throw new Error("Provider returned an invalid repository list");
    return parsed.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}
export class GitHubProviderAdapter {
    command;
    kind = "github";
    constructor(command = new NodeCommandPort()) {
        this.command = command;
    }
    async signIn() {
        await this.command.run("gh", ["auth", "login", "--web", "--git-protocol", "https", "--skip-ssh-key"]);
    }
    async listLibraries() {
        // This endpoint includes repositories the user owns, collaborates on, or
        // can access through an organization. Do not use `gh repo list @me`: it
        // omits much of the last two groups.
        const output = await this.command.run("gh", [
            "api",
            "--paginate",
            "--slurp",
            "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100",
        ]);
        return jsonArray(output)
            .map((entry) => entry)
            .flatMap((entry) => {
            const remote = entry.ssh_url ?? entry.clone_url;
            if (entry.archived || entry.disabled || !entry.permissions?.push || !remote || !entry.full_name)
                return [];
            return [validateRemoteConnection({ provider: "github", label: entry.full_name, remote })];
        });
    }
    async createLibrary(plan) {
        const current = planProviderLibraryCreation("github", plan.name, plan.visibility);
        if (plan.provider !== "github" || current.planId !== plan.planId)
            throw new Error("GitHub library name or visibility changed after review. Review it again.");
        await this.command.run("gh", ["repo", "create", current.name, `--${current.visibility}`, "--disable-wiki"]);
        const remote = await this.command.run("gh", ["repo", "view", current.name, "--json", "sshUrl", "--jq", ".sshUrl"]);
        return validateRemoteConnection({ provider: "github", label: current.name, remote: remote.trim() });
    }
}
export class GitLabProviderAdapter {
    command;
    kind = "gitlab";
    constructor(command = new NodeCommandPort()) {
        this.command = command;
    }
    async signIn() {
        await this.command.run("glab", ["auth", "login", "--web"]);
    }
    async listLibraries() {
        // `glab repo list` explicitly paginates. Keep asking until the final short
        // page so saved connections are discoverable even for large organizations.
        const repositories = [];
        for (let page = 1;; page += 1) {
            const output = await this.command.run("glab", [
                "repo",
                "list",
                "--member",
                "--output",
                "json",
                "--per-page",
                "100",
                "--page",
                String(page),
            ]);
            const batch = jsonArray(output);
            repositories.push(...batch);
            if (batch.length < 100)
                break;
        }
        const seen = new Set();
        return repositories
            .map((entry) => entry)
            .flatMap((entry) => {
            const remote = entry.ssh_url_to_repo ?? entry.http_url_to_repo;
            if (entry.archived || !remote || !entry.path_with_namespace)
                return [];
            const connection = validateRemoteConnection({ provider: "gitlab", label: entry.path_with_namespace, remote });
            if (seen.has(connection.remote))
                return [];
            seen.add(connection.remote);
            return [connection];
        });
    }
    async createLibrary(plan) {
        const current = planProviderLibraryCreation("gitlab", plan.name, plan.visibility);
        if (plan.provider !== "gitlab" || current.planId !== plan.planId)
            throw new Error("GitLab library name or visibility changed after review. Review it again.");
        await this.command.run("glab", ["repo", "create", current.name, `--${current.visibility}`, "--skipGitInit"]);
        const remote = await this.command.run("glab", [
            "repo",
            "view",
            current.name,
            "--output",
            "json",
            "--jq",
            ".ssh_url_to_repo",
        ]);
        return validateRemoteConnection({ provider: "gitlab", label: current.name, remote: remote.trim() });
    }
}
export function createProviderAdapter(kind, command) {
    return kind === "github" ? new GitHubProviderAdapter(command) : new GitLabProviderAdapter(command);
}
export function validateRemoteConnection(value) {
    return remoteConnectionSchema.parse(value);
}
//# sourceMappingURL=providers.js.map
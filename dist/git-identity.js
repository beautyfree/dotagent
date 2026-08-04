import path from "node:path";
import { pathToFileURL } from "node:url";
/** Canonical comparison identity; credentials and transport-specific Git spelling are removed. */
export function normalizeGitIdentity(input) {
    const value = input.trim();
    if (path.isAbsolute(value))
        return pathToFileURL(path.resolve(value)).href.replace(/\/$/, "");
    if (/^[a-z]:[\\/]/i.test(value)) {
        const windowsPath = value.replace(/\\/g, "/");
        return new URL(`file:///${windowsPath}`).href.replace(/\/$/, "");
    }
    if (/^\\\\[^\\]+\\[^\\]+/.test(value)) {
        const unc = value.slice(2).replace(/\\/g, "/");
        return new URL(`file://${unc}`).href.replace(/\/$/, "");
    }
    if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/i.test(value))
        throw new Error("Git URL must not contain credentials");
    const scp = /^(?:[^@\s]+@)?([^:/\s]+):(.+)$/.exec(value);
    if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
        const [, host, repositoryPath] = scp;
        if (!host || !repositoryPath)
            throw new Error(`Unsupported Git URL: ${input}`);
        return `https://${host.toLocaleLowerCase("en-US")}/${repositoryPath.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "")}`;
    }
    let parsed;
    try {
        parsed = new URL(value.replace(/^git\+/, ""));
    }
    catch {
        throw new Error(`Unsupported Git URL: ${input}`);
    }
    if (parsed.search || parsed.hash)
        throw new Error("Git URL must not contain query parameters or fragments");
    if (parsed.protocol === "file:")
        return parsed.href.replace(/\/$/, "");
    if (!parsed.hostname || parsed.username || parsed.password)
        throw new Error("Git URL must not contain credentials");
    const repositoryPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    if (!repositoryPath)
        throw new Error(`Git URL has no repository path: ${input}`);
    return `https://${parsed.hostname.toLocaleLowerCase("en-US")}/${repositoryPath}`;
}
//# sourceMappingURL=git-identity.js.map
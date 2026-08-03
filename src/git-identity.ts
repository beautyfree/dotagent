/** Canonical comparison identity; credentials and transport-specific Git spelling are removed. */
export function normalizeGitIdentity(input: string): string {
  const value = input.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/i.test(value)) throw new Error("Git URL must not contain credentials");
  const scp = /^(?:[^@\s]+@)?([^:/\s]+):(.+)$/.exec(value);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const [, host, repositoryPath] = scp;
    if (!host || !repositoryPath) throw new Error(`Unsupported Git URL: ${input}`);
    return `https://${host.toLocaleLowerCase("en-US")}/${repositoryPath.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "")}`;
  }
  let parsed: URL;
  try {
    parsed = new URL(value.replace(/^git\+/, ""));
  } catch {
    throw new Error(`Unsupported Git URL: ${input}`);
  }
  if (parsed.protocol === "file:") return parsed.href.replace(/\/$/, "");
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error("Git URL must not contain credentials");
  const repositoryPath = parsed.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!repositoryPath) throw new Error(`Git URL has no repository path: ${input}`);
  return `https://${parsed.hostname.toLocaleLowerCase("en-US")}/${repositoryPath}`;
}

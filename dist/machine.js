import { access, lstat, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
export class NodeMachinePort {
    #platform;
    #env;
    constructor(options = {}) {
        this.#platform = options.platform ?? process.platform;
        this.#env = options.env ?? process.env;
    }
    async commandExists(command) {
        const pathApi = this.#platform === "win32" ? path.win32 : path.posix;
        const candidates = [];
        if (pathApi.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
            candidates.push(command);
        }
        else {
            const directories = (this.#env.PATH ?? "").split(path.delimiter).filter(Boolean);
            const extensions = this.#platform === "win32" ? (this.#env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean) : [""];
            for (const directory of directories) {
                for (const extension of extensions)
                    candidates.push(pathApi.join(directory, `${command}${extension}`));
            }
        }
        for (const candidate of candidates) {
            try {
                await access(candidate, this.#platform === "win32" ? constants.F_OK : constants.X_OK);
                return true;
            }
            catch {
                // Continue through PATH candidates.
            }
        }
        return false;
    }
    async pathKind(filePath) {
        try {
            const metadata = await lstat(filePath);
            if (metadata.isSymbolicLink())
                return "link";
            if (metadata.isDirectory())
                return "directory";
            if (metadata.isFile())
                return "file";
            return "other";
        }
        catch (error) {
            if (error.code === "ENOENT")
                return "missing";
            throw error;
        }
    }
    async listDirectory(directory) {
        return (await readdir(directory)).sort((left, right) => left.localeCompare(right, "en"));
    }
}
export function expandMachinePath(template, home, platform) {
    const pathApi = platform === "win32" ? path.win32 : path.posix;
    if (template === "~")
        return home;
    if (template.startsWith("~/") || template.startsWith("~\\"))
        return pathApi.join(home, template.slice(2));
    return template;
}
function deliveryRoots(descriptor, home, platform) {
    return descriptor.skills.flatMap((delivery) => "roots" in delivery ? delivery.roots.map((root) => expandMachinePath(root, home, platform)) : []);
}
async function containsOnlySkillBranches(directory, paths, pathApi, port) {
    let entries;
    try {
        entries = await port.listDirectory(directory);
    }
    catch {
        return false;
    }
    if (entries.length === 0)
        return false;
    for (const entry of entries) {
        const matching = paths.filter(([head]) => head === entry);
        if (matching.length === 0)
            return false;
        const descendants = matching.filter((segments) => segments.length > 1).map(([, ...rest]) => rest);
        if (descendants.length > 0 &&
            !(await containsOnlySkillBranches(pathApi.join(directory, entry), descendants, pathApi, port)))
            return false;
    }
    return true;
}
export async function isSkillsOnlyMarker(marker, roots, platform, port) {
    const pathApi = platform === "win32" ? path.win32 : path.posix;
    const markerResolved = pathApi.resolve(marker);
    const nested = [];
    for (const root of roots) {
        const relative = pathApi.relative(markerResolved, pathApi.resolve(root));
        if (relative === "")
            return true;
        if (relative === ".." || relative.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relative))
            continue;
        nested.push(relative.split(pathApi.sep));
    }
    return nested.length > 0 && containsOnlySkillBranches(markerResolved, nested, pathApi, port);
}
export async function scanMachineAgents(descriptors, options) {
    const port = options.port ?? new NodeMachinePort({ platform: options.platform });
    const agents = [];
    for (const descriptor of [...descriptors].sort((left, right) => left.slug.localeCompare(right.slug, "en"))) {
        if (!descriptor.platforms.includes(options.platform)) {
            agents.push({
                slug: descriptor.slug,
                displayName: descriptor.displayName,
                detected: false,
                reason: "unsupported-platform",
                evidence: null,
            });
            continue;
        }
        let result = null;
        for (const rule of descriptor.detection) {
            if (rule.kind === "command") {
                if (await port.commandExists(rule.command)) {
                    result = {
                        slug: descriptor.slug,
                        displayName: descriptor.displayName,
                        detected: true,
                        reason: "command",
                        evidence: rule.command,
                    };
                    break;
                }
                continue;
            }
            const marker = expandMachinePath(rule.path, options.home, options.platform);
            const kind = await port.pathKind(marker);
            if (kind !== "directory" && kind !== "file")
                continue;
            if (kind === "directory" &&
                rule.ignoreSkillsOnly &&
                (await isSkillsOnlyMarker(marker, deliveryRoots(descriptor, options.home, options.platform), options.platform, port))) {
                result = {
                    slug: descriptor.slug,
                    displayName: descriptor.displayName,
                    detected: false,
                    reason: "skills-only",
                    evidence: marker,
                };
                continue;
            }
            result = {
                slug: descriptor.slug,
                displayName: descriptor.displayName,
                detected: true,
                reason: "marker",
                evidence: marker,
            };
            break;
        }
        agents.push(result ?? {
            slug: descriptor.slug,
            displayName: descriptor.displayName,
            detected: false,
            reason: "not-found",
            evidence: null,
        });
    }
    return {
        platform: options.platform,
        agents,
        detectedSlugs: agents.filter((agent) => agent.detected).map((agent) => agent.slug),
    };
}
//# sourceMappingURL=machine.js.map
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
export const SKILLS_CLI_LOCK_VERSION = 3;
export function getSkillsCliLockPath(env = process.env, home = homedir()) {
    return env.XDG_STATE_HOME?.trim()
        ? join(env.XDG_STATE_HOME, "skills", ".skill-lock.json")
        : join(home, ".agents", ".skill-lock.json");
}
/** Parse the documented Skills CLI v3 shape without guessing future versions. */
export function parseSkillsCliLock(input, sourcePath = "<memory>") {
    let parsed;
    try {
        parsed = JSON.parse(input);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const lock = parsed;
    if (lock.version !== SKILLS_CLI_LOCK_VERSION || !lock.skills || typeof lock.skills !== "object")
        return null;
    const skills = Object.entries(lock.skills)
        .flatMap(([name, value]) => {
        if (!value || typeof value !== "object")
            return [];
        const entry = value;
        if (typeof entry.source !== "string" || typeof entry.sourceType !== "string" || typeof entry.sourceUrl !== "string")
            return [];
        return [{
                name,
                source: entry.source,
                source_type: entry.sourceType,
                source_url: entry.sourceUrl,
                ref: typeof entry.ref === "string" ? entry.ref : null,
                skill_path: typeof entry.skillPath === "string" ? entry.skillPath : null,
                updated_at: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
            }];
    })
        .sort((a, b) => a.name.localeCompare(b.name));
    return { path: sourcePath, version: SKILLS_CLI_LOCK_VERSION, skills };
}
/** Read-only adapter; the upstream lockfile is never rewritten. */
export function readSkillsCliLock(filePath = getSkillsCliLockPath()) {
    if (!existsSync(filePath))
        return null;
    try {
        return parseSkillsCliLock(readFileSync(filePath, "utf8"), filePath);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=skills-cli.js.map
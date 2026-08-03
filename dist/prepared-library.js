import path from "node:path";
import { GitDependencyResolver } from "./git-resolver.js";
import { scanLibrary, scanOwnedSkill } from "./inventory.js";
import { DotagentError } from "./issues.js";
import { loadLibrary } from "./library.js";
/**
 * Combines owned skills with immutable, integrity-checked dependency checkouts.
 * Cache writes are machine-local; no agent target or portable file is changed.
 */
export async function prepareMaterializationInventory(options) {
    const root = path.resolve(options.root);
    const [inventory, loaded] = await Promise.all([scanLibrary(root), loadLibrary(root)]);
    if (!inventory.ok)
        throw new DotagentError("Cannot prepare an invalid library", inventory.issues);
    if (!loaded.ok)
        throw new DotagentError("Cannot prepare an invalid library", loaded.issues);
    const dependencies = Object.entries(loaded.value.manifest.dependencies).sort(([left], [right]) => left.localeCompare(right, "en"));
    if (dependencies.length === 0)
        return inventory.value;
    if (!loaded.value.lock)
        throw new Error("Dependencies require a reviewed skills.lock before materialization");
    const resolver = options.resolver ?? new GitDependencyResolver({ cacheRoot: path.join(root, ".dotagent", "cache", "git") });
    const checkoutRoot = path.resolve(options.checkoutRoot ?? path.join(root, ".dotagent", "cache", "checkouts"));
    const prepared = await Promise.all(dependencies.map(async ([name, dependency]) => {
        const locked = loaded.value.lock.resolved[name];
        if (!locked)
            throw new Error(`skills.lock has no entry for dependency ${name}`);
        return resolver.prepareLocked(name, dependency, locked, checkoutRoot);
    }));
    const skills = [...inventory.value.ownedSkills];
    const names = new Map(skills.map((skill) => [skill.name.toLocaleLowerCase("en-US"), "owned library"]));
    for (const dependency of prepared) {
        for (const lockedSkill of dependency.skills) {
            const scanned = await scanOwnedSkill(dependency.root, lockedSkill.path);
            if (!scanned.ok)
                throw new DotagentError(`Prepared dependency ${dependency.dependency} is invalid`, scanned.issues);
            if (scanned.value.name !== lockedSkill.name)
                throw new Error(`Prepared dependency ${dependency.dependency} changed exported skill name`);
            const folded = scanned.value.name.toLocaleLowerCase("en-US");
            const previous = names.get(folded);
            if (previous)
                throw new Error(`Skill name collision: ${scanned.value.name} is exported by ${previous} and dependency ${dependency.dependency}`);
            names.set(folded, `dependency ${dependency.dependency}`);
            skills.push({
                name: scanned.value.name,
                path: scanned.value.path,
                fileCount: scanned.value.fileCount,
                bytes: scanned.value.bytes,
                integrity: scanned.value.integrity,
                sourceRoot: dependency.root,
                sourceKind: "dependency",
                dependency: dependency.dependency,
            });
        }
    }
    skills.sort((left, right) => left.name.localeCompare(right.name, "en"));
    return { ...inventory.value, ownedSkills: skills };
}
//# sourceMappingURL=prepared-library.js.map
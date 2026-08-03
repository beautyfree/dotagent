import path from "node:path";
import { computePlanId } from "./plan.js";
function desiredLinkAction(mode) {
    if (mode === "symlink")
        return "create-symlink";
    if (mode === "junction")
        return "create-junction";
    throw new Error(`Expected link mode, received ${mode}`);
}
function supportsMode(descriptor, mode) {
    if (mode === "native")
        return descriptor.skills.some((delivery) => delivery.kind === "native-shared");
    if (mode === "copy")
        return descriptor.skills.some((delivery) => delivery.kind === "copy-only");
    return descriptor.skills.some((delivery) => delivery.kind === "per-skill-link");
}
/** Produces exact, serializable actions and never turns unmanaged content into a write. */
export function planMaterialization(inventory, targets) {
    const operations = [];
    const sortedTargets = [...targets].sort((left, right) => left.descriptor.slug.localeCompare(right.descriptor.slug, "en"));
    for (const target of sortedTargets) {
        if (!target.detected)
            throw new Error(`Agent ${target.descriptor.slug} is not detected`);
        if (!target.descriptor.platforms.includes(target.platform))
            throw new Error(`Agent ${target.descriptor.slug} does not support ${target.platform}`);
        if (!supportsMode(target.descriptor, target.mode))
            throw new Error(`Agent ${target.descriptor.slug} does not support ${target.mode} materialization`);
        if (target.mode !== "native" && !target.root)
            throw new Error(`Agent ${target.descriptor.slug} requires a resolved target root`);
        for (const skill of inventory.ownedSkills) {
            const source = path.join(inventory.root, ...skill.path.split("/"));
            if (target.mode === "native") {
                operations.push({ agent: target.descriptor.slug, skill: skill.name, action: "available-native", source, target: null });
                continue;
            }
            const destination = path.join(target.root, skill.name);
            const existing = target.existing[skill.name] ?? { state: "absent" };
            if (existing.state === "unmanaged") {
                operations.push({ agent: target.descriptor.slug, skill: skill.name, action: "conflict", source, target: destination, reason: "Target contains unmanaged content" });
            }
            else if (target.mode === "copy") {
                const action = existing.state === "absent"
                    ? "create-copy"
                    : existing.state === "managed-copy" && existing.integrity === skill.integrity
                        ? "unchanged"
                        : existing.state === "managed-copy"
                            ? "update-copy"
                            : "conflict";
                operations.push({ agent: target.descriptor.slug, skill: skill.name, action, source, target: destination,
                    ...(action === "conflict" ? { reason: "Target is not a managed copy" } : {}) });
            }
            else {
                const expectedSource = path.resolve(source);
                const action = existing.state === "absent"
                    ? desiredLinkAction(target.mode)
                    : existing.state === "managed-link" && path.resolve(existing.source) === expectedSource
                        ? "unchanged"
                        : "conflict";
                operations.push({ agent: target.descriptor.slug, skill: skill.name, action, source, target: destination,
                    ...(action === "conflict" ? { reason: "Target does not point to this managed skill" } : {}) });
            }
        }
    }
    const payload = {
        kind: "materialize",
        schemaVersion: 1,
        library: inventory.root,
        operations,
        hasConflicts: operations.some((operation) => operation.action === "conflict"),
    };
    return { ...payload, planId: computePlanId(payload) };
}
//# sourceMappingURL=materialize.js.map
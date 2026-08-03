import { createHash } from "node:crypto";
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right, "en"))
            .map(([key, nested]) => [key, canonicalize(nested)]));
    }
    return value;
}
/** Stable IDs make a reviewed plan comparable between the CLI and Skiller. */
export function computePlanId(value) {
    return createHash("sha256")
        .update(JSON.stringify(canonicalize(value)))
        .digest("hex");
}
//# sourceMappingURL=plan.js.map
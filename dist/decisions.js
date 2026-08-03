import { z } from "zod";
export const IMPORT_DISPOSITIONS = ["suggested", "owned", "dependency", "vendored", "local-only", "excluded"];
export const importDecisionSchema = z
    .object({
    candidateKey: z.string().min(1).max(256),
    disposition: z.enum(IMPORT_DISPOSITIONS),
    license: z.string().min(1).max(128).optional(),
    reason: z.string().min(1).max(512).optional(),
})
    .strict()
    .superRefine((decision, context) => {
    if (decision.disposition === "vendored" && !decision.license) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["license"],
            message: "Vendoring requires the upstream skill license",
        });
    }
    if (decision.license && decision.disposition !== "vendored") {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["license"],
            message: "A source license is accepted only for an explicitly vendored skill",
        });
    }
});
/** Parses a renderer/CLI decision set and rejects duplicate candidate keys. */
export function parseImportDecisions(input) {
    const decisions = z.array(importDecisionSchema).parse(input);
    const seen = new Set();
    for (const decision of decisions) {
        if (seen.has(decision.candidateKey))
            throw new Error(`Duplicate import decision: ${decision.candidateKey}`);
        seen.add(decision.candidateKey);
    }
    return decisions;
}
//# sourceMappingURL=decisions.js.map
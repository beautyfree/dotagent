import { type SecretFinding } from "./audit.js";
import { type ApplyLibraryUpdateResult, type LibraryUpdatePlan } from "./library-update.js";
import { type ResourceDescriptor } from "./resource-model.js";
export declare const RESOURCE_MANIFEST_FILE = "resources.json";
export type AdoptVisibility = "private" | "team" | "public";
export interface AdoptResourceInput {
    libraryRoot: string;
    sourcePath: string;
    descriptor: ResourceDescriptor;
    visibility: AdoptVisibility;
}
export interface AdoptResourcePlan {
    kind: "resource-adopt";
    schemaVersion: 1;
    planId: string;
    library: string;
    source: {
        path: string;
        integrity: string;
        files: number;
        bytes: number;
    };
    resource: ResourceDescriptor;
    licenseReview: {
        visibility: AdoptVisibility;
        libraryLicense: string | null;
        status: "private-only" | "reviewed" | "blocked";
    };
    secretFindings: (SecretFinding & {
        relativePath: string;
    })[];
    blockers: {
        code: "collision" | "license-review" | "secret" | "target-exists";
        message: string;
    }[];
    libraryUpdate: LibraryUpdatePlan;
}
/**
 * Reviews one explicitly selected unmanaged native resource before copying it
 * into the canonical library. This function never writes or executes content.
 */
export declare function planResourceAdoption(input: AdoptResourceInput): Promise<AdoptResourcePlan>;
/** Applies only an unchanged, blocker-free adoption as one library transaction. */
export declare function applyResourceAdoption(plan: AdoptResourcePlan, expectedPlanId: string): Promise<ApplyLibraryUpdateResult>;
//# sourceMappingURL=adopt.d.ts.map
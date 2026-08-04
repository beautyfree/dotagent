import type { DoctorReport } from "./doctor.js";
import { type ApplyLibraryUpdateResult } from "./library-update.js";
export type DoctorRepairAction = {
    kind: "update-gitignore";
    path: ".gitignore";
    add: string[];
    expectedSha256: string;
    nextSha256: string;
};
export interface DoctorRepairPlan {
    kind: "doctor-repair";
    schemaVersion: 1;
    planId: string;
    actions: DoctorRepairAction[];
    unsupported: {
        code: string;
        reason: string;
    }[];
    hasBlockers: boolean;
}
/** Convert only explicitly selected, deterministic doctor findings into a no-write plan. */
export declare function planDoctorRepair(report: DoctorReport, selectedCodes: string[]): DoctorRepairPlan;
/** Apply only the unchanged repair plan through the regular transactional update engine. */
export declare function applyDoctorRepair(root: string, plan: DoctorRepairPlan, expectedPlanId: string): ApplyLibraryUpdateResult | null;
//# sourceMappingURL=repair.d.ts.map
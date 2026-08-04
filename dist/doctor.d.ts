import type { AgentDescriptor, Platform } from "./agents.js";
import type { DotagentsIssue } from "./issues.js";
import { type LibraryInventory } from "./inventory.js";
import { type MachineInventory, type MachinePort } from "./machine.js";
export interface DoctorOptions {
    root: string;
    descriptors?: AgentDescriptor[];
    platform?: Platform;
    home?: string;
    machinePort?: MachinePort;
}
export interface DoctorReport {
    ok: boolean;
    root: string;
    library: LibraryInventory | null;
    machine: MachineInventory | null;
    issues: DotagentsIssue[];
}
/** Read-only health report suitable for both CLI JSON and Skiller tRPC mapping. */
export declare function doctorLibrary(options: DoctorOptions): Promise<DoctorReport>;
//# sourceMappingURL=doctor.d.ts.map
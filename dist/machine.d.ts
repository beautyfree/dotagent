import type { AgentDescriptor, Platform } from "./agents.js";
export type MachinePathKind = "missing" | "file" | "directory" | "link" | "other";
export interface MachinePort {
    commandExists(command: string): Promise<boolean>;
    pathKind(filePath: string): Promise<MachinePathKind>;
    listDirectory(directory: string): Promise<string[]>;
}
export interface NodeMachinePortOptions {
    platform?: Platform;
    env?: NodeJS.ProcessEnv;
}
export declare class NodeMachinePort implements MachinePort {
    #private;
    constructor(options?: NodeMachinePortOptions);
    commandExists(command: string): Promise<boolean>;
    pathKind(filePath: string): Promise<MachinePathKind>;
    listDirectory(directory: string): Promise<string[]>;
}
export type AgentDetectionReason = "command" | "marker" | "skills-only" | "not-found" | "unsupported-platform";
export interface MachineAgentInventory {
    slug: string;
    displayName: string;
    detected: boolean;
    reason: AgentDetectionReason;
    evidence: string | null;
}
export interface MachineInventory {
    platform: Platform;
    agents: MachineAgentInventory[];
    detectedSlugs: string[];
}
export interface ScanMachineOptions {
    platform: Platform;
    home: string;
    port?: MachinePort;
}
export declare function expandMachinePath(template: string, home: string, platform: Platform): string;
export declare function isSkillsOnlyMarker(marker: string, roots: string[], platform: Platform, port: MachinePort): Promise<boolean>;
export declare function scanMachineAgents(descriptors: AgentDescriptor[], options: ScanMachineOptions): Promise<MachineInventory>;
//# sourceMappingURL=machine.d.ts.map
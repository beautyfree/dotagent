import { z } from "zod";
export declare const providerKindSchema: z.ZodEnum<["github", "gitlab", "generic"]>;
export type ProviderKind = z.infer<typeof providerKindSchema>;
export declare const remoteConnectionSchema: z.ZodEffects<z.ZodObject<{
    provider: z.ZodEnum<["github", "gitlab", "generic"]>;
    remote: z.ZodString;
    label: z.ZodString;
}, "strict", z.ZodTypeAny, {
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
}, {
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
}>, {
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
}, {
    remote: string;
    provider: "github" | "gitlab" | "generic";
    label: string;
}>;
export type RemoteConnection = z.output<typeof remoteConnectionSchema>;
export type ProviderLibraryCreationPlan = {
    kind: "provider-library-create";
    schemaVersion: 1;
    planId: string;
    provider: Exclude<ProviderKind, "generic">;
    name: string;
    visibility: "private" | "public";
};
/** A no-network, deterministic review of the exact remote repository to create. */
export declare function planProviderLibraryCreation(provider: Exclude<ProviderKind, "generic">, name: string, visibility?: "private" | "public"): ProviderLibraryCreationPlan;
export interface CommandPort {
    run(command: string, args: string[]): Promise<string>;
}
export declare class NodeCommandPort implements CommandPort {
    run(command: string, args: string[]): Promise<string>;
}
export interface RemoteProviderAdapter {
    readonly kind: Exclude<ProviderKind, "generic">;
    signIn(): Promise<void>;
    listLibraries(): Promise<RemoteConnection[]>;
    createLibrary(plan: ProviderLibraryCreationPlan): Promise<RemoteConnection>;
}
export declare class GitHubProviderAdapter implements RemoteProviderAdapter {
    private readonly command;
    readonly kind: "github";
    constructor(command?: CommandPort);
    signIn(): Promise<void>;
    listLibraries(): Promise<RemoteConnection[]>;
    createLibrary(plan: ProviderLibraryCreationPlan): Promise<RemoteConnection>;
}
export declare class GitLabProviderAdapter implements RemoteProviderAdapter {
    private readonly command;
    readonly kind: "gitlab";
    constructor(command?: CommandPort);
    signIn(): Promise<void>;
    listLibraries(): Promise<RemoteConnection[]>;
    createLibrary(plan: ProviderLibraryCreationPlan): Promise<RemoteConnection>;
}
export declare function createProviderAdapter(kind: Exclude<ProviderKind, "generic">, command?: CommandPort): RemoteProviderAdapter;
export declare function validateRemoteConnection(value: unknown): RemoteConnection;
//# sourceMappingURL=providers.d.ts.map
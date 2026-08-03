export interface InitializeLibraryPlan {
    kind: "initialize-library";
    schemaVersion: 1;
    planId: string;
    root: string;
    files: ReadonlyArray<{
        path: string;
        content: string;
    }>;
}
export declare function planInitializeLibrary(root: string, requestedName?: string): InitializeLibraryPlan;
/** Applies only the exact reviewed plan and refuses to overwrite any target file. */
export declare function applyInitializeLibraryPlan(plan: InitializeLibraryPlan): Promise<void>;
//# sourceMappingURL=init.d.ts.map
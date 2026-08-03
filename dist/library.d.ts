import { type LibraryLock, type LibraryManifest } from "./schema.js";
import type { DotagentResult } from "./issues.js";
export declare function parseLibraryManifest(input: string): DotagentResult<LibraryManifest>;
export declare function parseLibraryLock(input: string): DotagentResult<LibraryLock>;
export interface LibraryFiles {
    root: string;
    manifest: LibraryManifest;
    lock: LibraryLock | null;
}
export declare function loadLibrary(root: string): Promise<DotagentResult<LibraryFiles>>;
//# sourceMappingURL=library.d.ts.map
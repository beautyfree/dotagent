import { type LibraryLock, type LibraryManifest } from "./schema.js";
import type { DotagentsResult } from "./issues.js";
export declare function parseLibraryManifest(input: string): DotagentsResult<LibraryManifest>;
export declare function parseLibraryLock(input: string): DotagentsResult<LibraryLock>;
export interface LibraryFiles {
    root: string;
    manifest: LibraryManifest;
    lock: LibraryLock | null;
}
export declare function loadLibrary(root: string): Promise<DotagentsResult<LibraryFiles>>;
//# sourceMappingURL=library.d.ts.map
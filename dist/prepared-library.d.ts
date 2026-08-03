import { GitDependencyResolver } from "./git-resolver.js";
import { type LibraryInventory } from "./inventory.js";
export interface PrepareMaterializationInventoryOptions {
    root: string;
    resolver?: GitDependencyResolver;
    checkoutRoot?: string;
}
/**
 * Combines owned skills with immutable, integrity-checked dependency checkouts.
 * Cache writes are machine-local; no agent target or portable file is changed.
 */
export declare function prepareMaterializationInventory(options: PrepareMaterializationInventoryOptions): Promise<LibraryInventory>;
//# sourceMappingURL=prepared-library.d.ts.map
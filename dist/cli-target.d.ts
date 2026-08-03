import type { MaterializationMode } from "./materialize.js";
export interface MaterializationTargetSpec {
    slug: string;
    mode: MaterializationMode;
    root: string | null;
}
/** `slug=mode=path`; equals signs after the second separator remain part of a Windows/path value. */
export declare function parseMaterializationTargetSpec(input: string): MaterializationTargetSpec;
//# sourceMappingURL=cli-target.d.ts.map
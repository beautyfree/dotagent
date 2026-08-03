/** `slug=mode=path`; equals signs after the second separator remain part of a Windows/path value. */
export function parseMaterializationTargetSpec(input) {
    const first = input.indexOf("=");
    const second = first < 0 ? -1 : input.indexOf("=", first + 1);
    if (first <= 0 || second < 0)
        throw new Error(`Invalid target ${input}; expected slug=mode=path`);
    const slug = input.slice(0, first);
    const mode = input.slice(first + 1, second);
    const root = input.slice(second + 1);
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug))
        throw new Error(`Invalid target agent slug: ${slug}`);
    if (!["native", "symlink", "junction", "copy"].includes(mode))
        throw new Error(`Invalid materialization mode: ${mode}`);
    if (mode !== "native" && !root)
        throw new Error(`Target ${slug} requires a root path`);
    return { slug, mode, root: mode === "native" ? null : root };
}
//# sourceMappingURL=cli-target.js.map
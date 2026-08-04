import { readFile } from "node:fs/promises";
import path from "node:path";
import { libraryLockSchema, libraryManifestSchema } from "./schema.js";
function schemaIssues(error, code) {
    return error.issues.map((issue) => ({
        code,
        message: issue.message,
        remediation: "Fix the reported field or regenerate the file with a compatible dotagents version.",
        ...(issue.path.length > 0 ? { field: issue.path.join(".") } : {}),
    }));
}
function parseJson(input, schema, code) {
    let raw;
    try {
        raw = JSON.parse(input);
    }
    catch {
        return {
            ok: false,
            issues: [
                { code: "invalid-json", message: "The file is not valid JSON.", remediation: "Fix the JSON syntax and retry." },
            ],
        };
    }
    const parsed = schema.safeParse(raw);
    return parsed.success
        ? { ok: true, value: parsed.data, issues: [] }
        : { ok: false, issues: schemaIssues(parsed.error, code) };
}
export function parseLibraryManifest(input) {
    return parseJson(input, libraryManifestSchema, "invalid-manifest");
}
export function parseLibraryLock(input) {
    return parseJson(input, libraryLockSchema, "invalid-lockfile");
}
async function readOptional(filePath) {
    try {
        return await readFile(filePath, "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
export async function loadLibrary(root) {
    const manifestPath = path.join(root, "skills.json");
    let manifestText;
    try {
        manifestText = await readFile(manifestPath, "utf8");
    }
    catch (error) {
        const missing = error.code === "ENOENT";
        return {
            ok: false,
            issues: [
                {
                    code: missing ? "file-not-found" : "io-error",
                    message: missing ? `No skills.json found at ${manifestPath}.` : `Could not read ${manifestPath}.`,
                    remediation: missing
                        ? "Run dotagents init or choose a library directory."
                        : "Check file permissions and retry.",
                    path: manifestPath,
                },
            ],
        };
    }
    const manifest = parseLibraryManifest(manifestText);
    if (!manifest.ok)
        return manifest;
    const lockPath = path.join(root, "skills.lock");
    const lockText = await readOptional(lockPath);
    const lock = lockText === null ? null : parseLibraryLock(lockText);
    if (lock && !lock.ok)
        return lock;
    return { ok: true, value: { root, manifest: manifest.value, lock: lock?.value ?? null }, issues: [] };
}
//# sourceMappingURL=library.js.map
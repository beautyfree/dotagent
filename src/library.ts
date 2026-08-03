import { readFile } from "node:fs/promises";
import path from "node:path";
import type { z, ZodError } from "zod";
import { libraryLockSchema, libraryManifestSchema, type LibraryLock, type LibraryManifest } from "./schema.js";
import type { DotagentIssue, DotagentResult } from "./issues.js";

function schemaIssues(error: ZodError, code: "invalid-manifest" | "invalid-lockfile"): DotagentIssue[] {
  return error.issues.map((issue) => ({
    code,
    message: issue.message,
    remediation: "Fix the reported field or regenerate the file with a compatible dotagent version.",
    ...(issue.path.length > 0 ? { field: issue.path.join(".") } : {}),
  }));
}

function parseJson<TSchema extends z.ZodTypeAny>(
  input: string,
  schema: TSchema,
  code: "invalid-manifest" | "invalid-lockfile",
): DotagentResult<z.output<TSchema>> {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
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

export function parseLibraryManifest(input: string): DotagentResult<LibraryManifest> {
  return parseJson(input, libraryManifestSchema, "invalid-manifest");
}

export function parseLibraryLock(input: string): DotagentResult<LibraryLock> {
  return parseJson(input, libraryLockSchema, "invalid-lockfile");
}

export interface LibraryFiles {
  root: string;
  manifest: LibraryManifest;
  lock: LibraryLock | null;
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function loadLibrary(root: string): Promise<DotagentResult<LibraryFiles>> {
  const manifestPath = path.join(root, "skills.json");
  let manifestText: string;
  try {
    manifestText = await readFile(manifestPath, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      ok: false,
      issues: [
        {
          code: missing ? "file-not-found" : "io-error",
          message: missing ? `No skills.json found at ${manifestPath}.` : `Could not read ${manifestPath}.`,
          remediation: missing
            ? "Run beautyfree-dotagent init or choose a library directory."
            : "Check file permissions and retry.",
          path: manifestPath,
        },
      ],
    };
  }
  const manifest = parseLibraryManifest(manifestText);
  if (!manifest.ok) return manifest;
  const lockPath = path.join(root, "skills.lock");
  const lockText = await readOptional(lockPath);
  const lock = lockText === null ? null : parseLibraryLock(lockText);
  if (lock && !lock.ok) return lock;
  return { ok: true, value: { root, manifest: manifest.value, lock: lock?.value ?? null }, issues: [] };
}

import path from "node:path";
import type { ImportCandidate } from "./import.js";

const stableName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Parses `skill=/absolute/or/relative/path` without interpreting path contents. */
export function parseOwnedImportSpec(spec: string, cwd = process.cwd()): ImportCandidate {
  const separator = spec.indexOf("=");
  if (separator <= 0 || separator === spec.length - 1) throw new Error(`Invalid owned import '${spec}'. Expected skill=path`);
  const skill = spec.slice(0, separator);
  if (!stableName.test(skill)) throw new Error(`Invalid owned skill name: ${skill}`);
  return { kind: "owned", skill, sourcePath: path.resolve(cwd, spec.slice(separator + 1)) };
}

export function validateImportCandidates(input: unknown): ImportCandidate[] {
  if (!Array.isArray(input)) throw new Error("Import candidate file must contain a JSON array");
  return input.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") throw new Error(`Import candidate ${index + 1} must be an object`);
    const value = candidate as Record<string, unknown>;
    if (typeof value.kind !== "string" || typeof value.skill !== "string") throw new Error(`Import candidate ${index + 1} requires kind and skill`);
    if (value.kind === "owned") {
      if (typeof value.sourcePath !== "string") throw new Error(`Owned import candidate ${value.skill} requires sourcePath`);
      return value as unknown as ImportCandidate;
    }
    if (value.kind === "dependency") {
      for (const field of ["package", "url", "ref", "skillPath"] as const) {
        if (typeof value[field] !== "string") throw new Error(`Dependency import candidate ${value.skill} requires ${field}`);
      }
      return value as unknown as ImportCandidate;
    }
    if (value.kind === "local-only" || value.kind === "excluded") {
      if (typeof value.reason !== "string" || !value.reason.trim()) throw new Error(`${value.kind} candidate ${value.skill} requires a reason`);
      return value as unknown as ImportCandidate;
    }
    throw new Error(`Unsupported import candidate kind: ${value.kind}`);
  });
}

import path from "node:path";

export function normalizePortablePath(input: string): string | null {
  const normalized = input.replaceAll("\\", "/");
  if (normalized.length === 0 || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return null;
  const clean = path.posix.normalize(normalized);
  if (clean === "." || clean === ".." || clean.startsWith("../") || clean.includes("\0")) return null;
  return clean;
}

export function normalizeSkillPath(input: string): string | null {
  const clean = normalizePortablePath(input);
  if (!clean) return null;
  return clean.startsWith("./") ? clean.slice(2) : clean;
}

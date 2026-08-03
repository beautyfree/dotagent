import { createHash } from "node:crypto";
import { normalizePortablePath } from "./paths.js";

export interface IntegrityFile {
  path: string;
  content: Uint8Array;
}

export function computeSkillIntegrity(files: IntegrityFile[]): string {
  const normalized = files
    .map((file) => {
      const portablePath = normalizePortablePath(file.path);
      if (!portablePath) throw new Error(`Unsafe integrity path: ${file.path}`);
      return { path: portablePath, content: file.content };
    })
    .sort((left, right) => left.path.localeCompare(right.path, "en"));

  const hash = createHash("sha256");
  for (const file of normalized) {
    const pathBytes = Buffer.from(file.path, "utf8");
    const size = Buffer.allocUnsafe(8);
    size.writeBigUInt64BE(BigInt(file.content.byteLength));
    hash.update(pathBytes);
    hash.update(Buffer.from([0]));
    hash.update(size);
    hash.update(file.content);
  }
  return `sha256-${hash.digest("base64")}`;
}

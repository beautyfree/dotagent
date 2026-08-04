import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentDescriptor, Platform } from "./agents.js";
import { parseLocalConfig, parsePortableConfig } from "./config.js";
import type { DotagentsIssue } from "./issues.js";
import { scanLibrary, type LibraryInventory } from "./inventory.js";
import { loadLibrary } from "./library.js";
import { scanMachineAgents, type MachineInventory, type MachinePort } from "./machine.js";
import { normalizeGitIdentity } from "./sources.js";

export interface DoctorOptions {
  root: string;
  descriptors?: AgentDescriptor[];
  platform?: Platform;
  home?: string;
  machinePort?: MachinePort;
}

export interface DoctorReport {
  ok: boolean;
  root: string;
  library: LibraryInventory | null;
  machine: MachineInventory | null;
  issues: DotagentsIssue[];
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function issue(
  code: DotagentsIssue["code"],
  severity: NonNullable<DotagentsIssue["severity"]>,
  message: string,
  remediation: string,
  filePath?: string,
): DotagentsIssue {
  return { code, severity, message, remediation, ...(filePath ? { path: filePath } : {}) };
}

function inspectLock(
  loaded: Extract<Awaited<ReturnType<typeof loadLibrary>>, { ok: true }>["value"],
): DotagentsIssue[] {
  const issues: DotagentsIssue[] = [];
  const dependencies = loaded.manifest.dependencies;
  if (Object.keys(dependencies).length > 0 && !loaded.lock) {
    issues.push(
      issue(
        "lockfile-missing",
        "warning",
        "Dependencies are not pinned by skills.lock.",
        "Run dotagents resolve, review the plan, then rerun with --write.",
      ),
    );
    return issues;
  }
  if (!loaded.lock) return issues;
  for (const [name, dependency] of Object.entries(dependencies)) {
    const resolved = loaded.lock.resolved[name];
    if (!resolved) {
      issues.push(
        issue(
          "lockfile-stale",
          "error",
          `Dependency ${name} is missing from skills.lock.`,
          "Resolve dependencies again and review the lockfile change.",
        ),
      );
      continue;
    }
    let sameSource = false;
    try {
      sameSource = normalizeGitIdentity(resolved.url) === normalizeGitIdentity(dependency.url);
    } catch {
      // The manifest/lock parser already reports invalid URL shapes elsewhere.
    }
    const selectedPaths = dependency.select ? [...dependency.select].sort() : null;
    const lockedPaths = resolved.skills.map((skill) => skill.path).sort();
    const sameSelection = dependency.include
      ? Boolean(
          resolved.selection &&
            JSON.stringify([...dependency.include].sort()) === JSON.stringify(resolved.selection.include) &&
            JSON.stringify([...(dependency.exclude ?? [])].sort()) === JSON.stringify(resolved.selection.exclude) &&
            (dependency.subtree ?? ".") === resolved.selection.subtree,
        )
      : !resolved.selection &&
        (selectedPaths === null || JSON.stringify(selectedPaths) === JSON.stringify(lockedPaths));
    if (!sameSource || resolved.requested_ref !== dependency.ref || !sameSelection) {
      issues.push(
        issue(
          "lockfile-stale",
          "error",
          `Dependency ${name} no longer matches its locked source, ref, or selected skill paths.`,
          "Resolve dependencies again; do not materialize the stale lock.",
        ),
      );
    }
  }
  for (const name of Object.keys(loaded.lock.resolved)) {
    if (!(name in dependencies))
      issues.push(
        issue(
          "lockfile-stale",
          "warning",
          `skills.lock still contains removed dependency ${name}.`,
          "Resolve dependencies again to remove the stale lock entry.",
        ),
      );
  }
  return issues;
}

async function inspectConfiguration(root: string): Promise<DotagentsIssue[]> {
  const issues: DotagentsIssue[] = [];
  const portablePath = path.join(root, "dotagents.yaml");
  const localPath = path.join(root, "dotagents.local.yaml");
  const portable = await readOptional(portablePath);
  const local = await readOptional(localPath);
  if (portable !== null) {
    try {
      parsePortableConfig(portable);
    } catch (error) {
      issues.push(
        issue(
          "invalid-config",
          "error",
          error instanceof Error ? error.message : "Invalid dotagents.yaml",
          "Fix the portable configuration before syncing.",
          portablePath,
        ),
      );
    }
  }
  if (local !== null) {
    try {
      parseLocalConfig(local);
    } catch (error) {
      issues.push(
        issue(
          "invalid-config",
          "error",
          error instanceof Error ? error.message : "Invalid dotagents.local.yaml",
          "Keep only machine-local paths and environment references in the local configuration.",
          localPath,
        ),
      );
    }
  }
  const gitignorePath = path.join(root, ".gitignore");
  const gitignore = await readOptional(gitignorePath);
  const lines = new Set((gitignore ?? "").split(/\r?\n/).map((line) => line.trim().replace(/^\//, "")));
  if (!lines.has("dotagents.local.yaml") || !lines.has(".dotagents/")) {
    issues.push(
      issue(
        "local-state-not-ignored",
        "error",
        "Machine-local dotagents state is not fully ignored by Git.",
        "Add dotagents.local.yaml and .dotagents/ to the repository .gitignore before publishing.",
        gitignorePath,
      ),
    );
  }
  return issues;
}

/** Read-only health report suitable for CLI JSON and API mappings. */
export async function doctorLibrary(options: DoctorOptions): Promise<DoctorReport> {
  const root = path.resolve(options.root);
  const issues: DotagentsIssue[] = [];
  const scanned = await scanLibrary(root);
  const library = scanned.ok ? scanned.value : null;
  if (!scanned.ok)
    issues.push(...scanned.issues.map((entry) => ({ ...entry, severity: entry.severity ?? ("error" as const) })));
  const loaded = await loadLibrary(root);
  if (loaded.ok) issues.push(...inspectLock(loaded.value));
  if (loaded.ok) issues.push(...(await inspectConfiguration(root)));
  let machine: MachineInventory | null = null;
  if (options.descriptors && options.platform && options.home) {
    machine = await scanMachineAgents(options.descriptors, {
      platform: options.platform,
      home: options.home,
      ...(options.machinePort ? { port: options.machinePort } : {}),
    });
  }
  return { ok: !issues.some((entry) => entry.severity === "error"), root, library, machine, issues };
}

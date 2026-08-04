import { homedir } from "node:os";
import path from "node:path";
import type { AgentDescriptor, Platform } from "./agents.js";
import { builtinAgentCatalog, builtinAgentDescriptors } from "./catalog.js";
import { scanLibrary } from "./inventory.js";
import { applyMaterializationPlan, type ApplyMaterializationResult } from "./materialize-apply.js";
import { planMaterialization, type AgentMaterializationTarget, type MaterializationPlan } from "./materialize.js";
import { expandMachinePath, scanMachineAgents } from "./machine.js";
import { computePlanId } from "./plan.js";
import { existingTargetsForPlan } from "./status.js";

export interface ConnectOptions {
  root?: string;
  home?: string;
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
}

export interface ConnectSummary {
  agentsFound: number;
  sharedAgents: string[];
  linkedAgents: string[];
  linksToCreate: number;
  alreadyConnected: number;
  needsReview: number;
}

export interface ConnectPlan {
  kind: "connect";
  schemaVersion: 1;
  planId: string;
  root: string;
  materialization: MaterializationPlan;
  summary: ConnectSummary;
}

function supportedPlatform(platform: NodeJS.Platform): Platform {
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  throw new Error(`Unsupported platform: ${platform}`);
}

function displayName(descriptor: AgentDescriptor): string {
  return descriptor.displayName;
}

/**
 * Plans the natural, safe destinations for currently detected agents. Shared
 * readers receive no filesystem writes; other agents receive per-skill links.
 */
export async function planConnect(options: ConnectOptions = {}): Promise<ConnectPlan> {
  const home = path.resolve(options.home ?? homedir());
  const root = path.resolve(options.root ?? path.join(home, ".agents"));
  const platform = supportedPlatform(options.platform ?? process.platform);
  const inventory = await scanLibrary(root);
  if (!inventory.ok) throw new Error("Cannot connect an invalid library; run dotagents doctor first.");

  const catalog = builtinAgentCatalog();
  const descriptors = builtinAgentDescriptors({ platforms: [platform] });
  const discovered = await scanMachineAgents(descriptors, {
    platform,
    home,
    ...(options.environment ? { environment: options.environment } : {}),
  });
  const entries = new Map(catalog.map((entry) => [entry.slug, entry]));
  const descriptorBySlug = new Map(descriptors.map((descriptor) => [descriptor.slug, descriptor]));
  const targets: AgentMaterializationTarget[] = [];

  for (const slug of discovered.detectedSlugs) {
    const entry = entries.get(slug);
    const descriptor = descriptorBySlug.get(slug);
    if (!entry || !descriptor) continue;
    if (descriptor.skills.some((delivery) => delivery.kind === "native-shared")) {
      targets.push({ descriptor, platform, detected: true, mode: "native", existing: {} });
      continue;
    }
    const targetTemplate = entry.skillRoots[0];
    if (!targetTemplate) continue;
    const targetRoot = expandMachinePath(targetTemplate, home, platform);
    const mode = platform === "win32" ? "junction" : "symlink";
    targets.push({
      descriptor,
      platform,
      detected: true,
      mode,
      root: targetRoot,
      existing: await existingTargetsForPlan(
        root,
        slug,
        targetRoot,
        inventory.value.ownedSkills.map((skill) => skill.name),
      ),
    });
  }

  const materialization = planMaterialization(inventory.value, targets);
  const sharedAgents = targets
    .filter((target) => target.mode === "native")
    .map((target) => displayName(target.descriptor))
    .sort((left, right) => left.localeCompare(right, "en"));
  const linkedAgents = targets
    .filter((target) => target.mode !== "native")
    .map((target) => displayName(target.descriptor))
    .sort((left, right) => left.localeCompare(right, "en"));
  const summary: ConnectSummary = {
    agentsFound: targets.length,
    sharedAgents,
    linkedAgents,
    linksToCreate: materialization.operations.filter((operation) =>
      ["create-symlink", "create-junction", "create-copy", "update-copy"].includes(operation.action),
    ).length,
    alreadyConnected: materialization.operations.filter(
      (operation) => operation.action === "available-native" || operation.action === "unchanged",
    ).length,
    needsReview: materialization.operations.filter((operation) => operation.action === "conflict").length,
  };
  const payload = {
    kind: "connect" as const,
    schemaVersion: 1 as const,
    root,
    materialization,
    summary,
  };
  return { ...payload, planId: computePlanId(payload) };
}

/** Applies only an unchanged, conflict-free connection plan. */
export async function applyConnectPlan(plan: ConnectPlan): Promise<ApplyMaterializationResult> {
  const { planId, ...payload } = plan;
  if (computePlanId(payload) !== planId) throw new Error("Connect plan is stale or modified");
  return applyMaterializationPlan(plan.materialization);
}

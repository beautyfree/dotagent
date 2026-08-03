# @beautyfree/dotagent

One Git-backed agent library, safely materialized into every compatible agent you choose.

This repository contains the reusable TypeScript engine and headless CLI used by Skiller. It is an early local foundation and is not published yet.

Until the scoped npm package is released, Skiller consumes an exact Git commit. Generated `dist/` files are therefore committed temporarily so clean installs remain reproducible even when dependency lifecycle scripts are disabled.

## Model

The canonical repository normally lives at `~/.agents`. Its `skills/` directory contains skills the library owner publishes. `skills.json` describes the portable package. `skills.lock` pins external dependencies. `dotagent.local.yaml` and `.dotagent/` contain machine-specific state and are always ignored by Git.

Agent folders are materialized views. A compatible agent may read `.agents/skills` directly, receive per-skill links, or receive a reviewed copy when the platform cannot link safely. dotagent never treats the shared skills directory as proof that a specific agent is installed. The provider-neutral built-in capability catalog is exported from `@beautyfree/dotagent/catalog`; product-specific install copy and authentication stay outside the core.

## Development

```sh
bun install
bun run check
bun run build
node dist/cli.js inspect fixtures/valid-library --json
```

The package requires Node.js 20 or later at runtime and is developed with Bun. CI runs the same typecheck, tests, build, and CLI smoke check on Linux, macOS, and Windows.

## Status

Implemented now:

- Agent Skills-style `skills.json` schema;
- immutable `skills.lock` schema;
- portable `dotagent.yaml` and private `dotagent.local.yaml` schemas with deterministic merge provenance;
- safe portable path validation including traversal and Windows reserved-name rejection;
- deterministic SHA-256 skill integrity;
- bounded library inventory that rejects escaping links and oversized content;
- concurrent isolated Git resolution with immutable commits and stale-plan-safe lockfile writes;
- reusable local Git object cache with fresh ref/commit/integrity verification;
- immutable dependency checkouts that can be rebuilt from the local mirror, re-audited, and fed into the same materialization plan as owned skills;
- typed value-free issues and shared secret findings;
- non-executing public/private metadata and license audit;
- read-only Skills CLI v3 and legacy Skiller manifest adapters;
- read-only cross-agent discovery that deduplicates shared skills and real agent links while preserving same-name conflicts;
- reviewed canonical import plans for owned, dependency, local-only, and excluded skills;
- journaled import apply/recovery with stale-source, unmanaged-target, and value-free secret checks;
- shared three-way conflict classification;
- typed agent capabilities and deterministic materialization previews that refuse unmanaged targets;
- guarded machine detection that separates shared skills from agent-install evidence;
- read-only `doctor` and managed-target `status` reports;
- journaled link/junction/copy apply with source revalidation, managed markers, rollback, and crash recovery;
- deterministic reviewed initialization plans;
- provider-neutral Git workspace operations with credential-free remote identity, non-interactive fetch, reviewed commits, and fast-forward-only pulls;
- `init`, `inspect`, preview-only `import`, preview-by-default `resolve`, `doctor`, `audit`, `git-init`, `clone`, `commit`, `sync`, `status`, explicit-target `plan`, confirmed `apply`, and `recover` CLI commands.

Import is reviewed and two-step as well:

```sh
beautyfree-dotagent import ~/.agents \
  --owned writing="$HOME/.codex/skills/writing" \
  --out import-plan.json
beautyfree-dotagent apply import-plan.json --yes
```

For mixed imports, `--candidate-file` accepts the typed JSON candidate array used by Skiller. Known Skills CLI/Git provenance is recorded as a dependency reference; it is not flattened into a duplicate folder. Local-only entries remain untouched. An import plan containing a conflict or possible secret cannot be applied.

Materialization is deliberately two-step:

```sh
beautyfree-dotagent plan ~/.agents \
  --target codex=symlink="$HOME/.codex/skills" \
  --out materialization-plan.json
beautyfree-dotagent apply materialization-plan.json --yes
```

The saved plan contains exact sources, targets, hashes, and preconditions. Apply rejects modified plans, changed sources, targets that appeared after review, unmanaged content, and locally modified managed copies.

When `skills.json` contains dependencies, `plan` requires a current `skills.lock`, prepares the exact locked commits under `.dotagent/cache/`, verifies their package integrity again, and includes their exported skills beside owned skills. Agent targets therefore never depend on a moving branch or an unverified working tree.

The canonical library repository uses the same preview/apply boundary. Authentication remains the caller's responsibility, so the core works with GitHub, GitLab, a private server, or a local bare repository without storing credentials:

```sh
beautyfree-dotagent git-init ~/.agents --remote git@github.com:you/agent-library.git
beautyfree-dotagent commit ~/.agents --message "Update my agent library" --out commit-plan.json
beautyfree-dotagent apply commit-plan.json --yes
beautyfree-dotagent sync ~/.agents --push --out push-plan.json
beautyfree-dotagent apply push-plan.json --yes
```

Pulls are also reviewed first. dotagent fetches without an interactive prompt, checks that the update is a fast-forward, audits the remote tree in an isolated worktree, and scans changed portable files without returning matched secret values. Only the confirmed plan can advance the working library:

```sh
beautyfree-dotagent sync ~/.agents --pull --out pull-plan.json
beautyfree-dotagent apply pull-plan.json --yes
```

Skiller consumes the shared manifest, Skills CLI, secret-scan, reconciliation, machine-diagnostics, discovery/import plans, Git workspace, and authoritative built-in agent catalog through compatibility facades. Bundled TOML files retain product install metadata and are parity-checked against the core catalog; custom local TOML definitions remain supported as explicit extensions.

## Prior art

The product model is informed by [yourconscience/dotagents](https://github.com/yourconscience/dotagents). Package and lockfile compatibility follows the direction of [Agent Skills discussion #210](https://github.com/agentskills/agentskills/discussions/210). This is an original TypeScript implementation; literal upstream code must retain its license and attribution.

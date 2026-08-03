# @beautyfree/dotagent

One Git-backed agent library, safely materialized into every compatible agent you choose.

This repository contains the reusable TypeScript engine and headless CLI used by Skiller. It is an early local foundation and is not published yet.

Until the scoped npm package is released, Skiller consumes an exact Git commit. Generated `dist/` files are therefore committed temporarily so clean installs remain reproducible even when dependency lifecycle scripts are disabled.

## Model

The canonical repository normally lives at `~/.agents`. Its `skills/` directory contains skills the library owner publishes. `skills.json` describes the portable package. `skills.lock` pins external dependencies. `dotagent.local.yaml` and `.dotagent/` contain machine-specific state and are always ignored by Git.

Agent folders are materialized views. A compatible agent may read `.agents/skills` directly, receive per-skill links, or receive a reviewed copy when the platform cannot link safely. dotagent never treats the shared skills directory as proof that a specific agent is installed.

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
- typed value-free issues and shared secret findings;
- read-only Skills CLI v3 and legacy Skiller manifest adapters;
- shared three-way conflict classification;
- typed agent capabilities and deterministic materialization previews that refuse unmanaged targets;
- guarded machine detection that separates shared skills from agent-install evidence;
- read-only `doctor` and managed-target `status` reports;
- journaled link/junction/copy apply with source revalidation, managed markers, rollback, and crash recovery;
- deterministic reviewed initialization plans;
- `init`, `inspect`, preview-by-default `resolve`, `doctor`, and `status` CLI commands.

Skiller already consumes the shared manifest, Skills CLI, secret-scan, and reconciliation modules through compatibility facades. Next: persistent source cache, richer audit reports, complete agent-catalog migration, Sync Center plan mapping, and full golden-fixture parity.

## Prior art

The product model is informed by [yourconscience/dotagents](https://github.com/yourconscience/dotagents). Package and lockfile compatibility follows the direction of [Agent Skills discussion #210](https://github.com/agentskills/agentskills/discussions/210). This is an original TypeScript implementation; literal upstream code must retain its license and attribution.

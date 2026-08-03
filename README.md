# @beautyfree/dotagent

One Git-backed agent library, safely materialized into every compatible agent you choose.

This repository contains the reusable TypeScript engine and headless CLI used by Skiller. It is an early local foundation and is not published yet.

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

The package requires Node.js 20 or later at runtime and is developed with Bun.

## Status

Implemented now:

- Agent Skills-style `skills.json` schema;
- immutable `skills.lock` schema;
- safe portable path validation;
- deterministic SHA-256 skill integrity;
- typed value-free issues;
- library loader and `inspect` CLI.

Next: YAML portable/local configuration, source resolution, audit, materialization plans, agent capabilities, and Skiller adapters.

## Prior art

The product model is informed by [yourconscience/dotagents](https://github.com/yourconscience/dotagents). Package and lockfile compatibility follows the direction of [Agent Skills discussion #210](https://github.com/agentskills/agentskills/discussions/210). This is an original TypeScript implementation; literal upstream code must retain its license and attribution.

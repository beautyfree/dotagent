# dotagents

One Git-backed agent library, safely materialized into every compatible agent you choose.

This repository contains a reusable TypeScript engine and headless CLI for portable agent-skill libraries. It is an early local foundation and is not published yet.

## Model

The canonical repository normally lives at `~/.agents`. Its `skills/` directory contains skills the library owner publishes. `skills.json` describes the portable package. `skills.lock` pins external dependencies. `dotagents.local.yaml` and `.dotagents/` contain machine-specific state and are always ignored by Git.

Agent folders are materialized views. A compatible agent may read `.agents/skills` directly, receive per-skill links, or receive a reviewed copy when the platform cannot link safely. dotagents never treats the shared skills directory as proof that a specific agent is installed. The provider-neutral built-in capability catalog is exported from `dotagents/catalog`; product-specific install copy and authentication stay outside the core.

## Development

```sh
bun install
bun run check
bun run build
node dist/cli.js inspect fixtures/valid-library --json
```

The package requires Node.js 20 or later at runtime and is developed with Bun. CI runs the same typecheck, tests, build, and CLI smoke check on Linux, macOS, and Windows.

## Documentation

- [Agent Skills RFC compatibility](docs/rfc-210-compatibility.md)
- [Changelog](CHANGELOG.md)

## Release boundary

The manual `Release package` workflow is the only publication path. Validation
always builds and verifies the npm tarball, CycloneDX SBOM, checksums,
version-specific release notes, changelog, migration guide, RFC compatibility
guide, and source-commit manifest before the protected publish job can run.

The publish job requires a reviewed real version and `private: false`. It first
publishes the exact verified tarball with npm provenance, or accepts an already
published retry only when registry integrity is identical. It then creates a
GitHub Release as a draft, uploads the complete artifact set, verifies every
asset and the exact tag commit, and only then makes the release public. This
keeps retries safe after a partial external failure without replacing a
different npm version or Git tag.

## Status

Implemented now:

- Agent Skills-style `skills.json` schema;
- immutable `skills.lock` schema;
- portable `dotagents.yaml` and private `dotagents.local.yaml` schemas with deterministic merge provenance;
- safe portable path validation including traversal and Windows reserved-name rejection;
- deterministic SHA-256 skill integrity;
- bounded library inventory that rejects escaping links and oversized content;
- concurrent isolated Git resolution with immutable commits and stale-plan-safe lockfile writes;
- reusable local Git object cache with fresh ref/commit/integrity verification;
- immutable dependency checkouts that can be rebuilt from the local mirror, re-audited, and fed into the same materialization plan as owned skills;
- typed value-free issues and shared secret findings;
- deterministic owned-skill export policy with bounded content, explicit exclusions, and no-follow link safety;
- non-executing public/private metadata and license audit;
- read-only Skills CLI v3 adapter;
- read-only cross-agent discovery that deduplicates shared skills and real agent links while preserving same-name conflicts;
- reviewed canonical import plans for owned, dependency, local-only, and excluded skills;
- journaled import apply/recovery with stale-source, unmanaged-target, and value-free secret checks;
- deterministic library reconciliation plans with shared three-way classification, explicit take-remote decisions, stale-plan/source/target checks, transactional rollback, and crash recovery;
- atomic library-update plans that stage every reviewed skill and portable file before replacement, then roll back the whole update through a durable journal;
- typed agent capabilities and deterministic materialization previews that refuse unmanaged targets;
- guarded machine detection that separates shared skills from agent-install evidence;
- read-only `doctor` and managed-target `status` reports;
- journaled link/junction/copy apply with source revalidation, managed markers, rollback, and crash recovery;
- deterministic reviewed initialization plans;
- provider-neutral Git workspace operations with credential-free remote identity, non-interactive fetch, reviewed commits, and fast-forward-only pulls;
- `init`, `inspect`, preview-only `import`, preview-by-default `resolve`, `doctor`, `audit`, `git-init`, `clone`, `commit`, `sync`, `status`, explicit-target `plan`, confirmed `apply`, and `recover` CLI commands.
- A [versioned resource model](docs/resource-model-v2.md) for skills, instructions, commands, and subagents, with explicit native/lossy/unsupported capabilities and ownership-safe file projection.

Import is reviewed and two-step as well:

```sh
dotagents init ~/.agents --name my-agent-library --out init-plan.json
dotagents apply init-plan.json --yes
dotagents import ~/.agents \
  --owned writing="$HOME/.codex/skills/writing" \
  --out import-plan.json
dotagents apply import-plan.json --yes
dotagents resolve ~/.agents --out resolution-plan.json
dotagents apply resolution-plan.json --yes
```

`init` preview does not create the destination. Review the exact root files in `init-plan.json`; confirmed apply refuses every path that appeared after preview. Dependency resolution is also preview-only: the saved plan contains old/new commits, integrity, licenses, and exported-skill changes, and apply rechecks the current manifest before writing `skills.lock`.

For mixed imports, `--candidate-file` accepts a typed JSON candidate array. Known Skills CLI/Git provenance is recorded as a dependency reference; it is not flattened into a duplicate folder. Local-only entries remain untouched. An import plan containing a conflict or possible secret cannot be applied.

Vendoring is a separate explicit candidate kind. It copies reviewed files only when the supplied origin URL, immutable commit, source skill path, integrity, and license are complete and the integrity matches the local source. That provenance is retained in `dotagents.yaml`; changing a dependency into redistributed files can never happen as an implicit fallback.

Materialization is deliberately two-step:

```sh
dotagents plan ~/.agents \
  --target codex=symlink="$HOME/.codex/skills" \
  --out materialization-plan.json
dotagents apply materialization-plan.json --yes
```

The saved plan contains exact sources, targets, hashes, and preconditions. Apply rejects modified plans, changed sources, targets that appeared after review, unmanaged content, and locally modified managed copies.

When `skills.json` contains dependencies, `plan` requires a current `skills.lock`, prepares the exact locked commits under `.dotagents/cache/`, verifies their package integrity again, and includes their exported skills beside owned skills. Agent targets therefore never depend on a moving branch or an unverified working tree.

The canonical library repository uses the same preview/apply boundary. Authentication remains the caller's responsibility, so the core works with GitHub, GitLab, a private server, or a local bare repository without storing credentials:

```sh
dotagents clone git@github.com:you/agent-library.git ~/.agents \
  --trust-source git@github.com:you/agent-library.git \
  --minimum-release-age 10080 --out clone-plan.json
dotagents apply clone-plan.json --yes
dotagents git-init ~/.agents --remote git@github.com:you/agent-library.git --out git-init-plan.json
dotagents apply git-init-plan.json --yes
dotagents commit ~/.agents --message "Update my agent library" --out commit-plan.json
dotagents apply commit-plan.json --yes
dotagents sync ~/.agents --push \
  --trust-source git@github.com:you/agent-library.git --out push-plan.json
dotagents apply push-plan.json --yes
```

Git initialization and clone previews do not mutate the library. A clone preview contacts only the already trusted remote, resolves its default branch to an immutable commit, checks the reviewed cooling-off policy, and binds the commit, timestamp, destination, trust decision, and policy into the plan ID. The generic checkout API applies the same boundary to an explicit branch, tag, or SHA, rejecting ambiguous branch/tag names. Apply fetches that exact commit rather than a moving ref, rechecks the policy and commit metadata, validates in staging, and only then atomically exposes its destination. Library clones also validate the canonical manifest and configure a non-personal Git identity. Pull previews enforce the same commit-age policy before remote content can be applied. Remote URLs containing credentials, query parameters, or fragments are rejected.

Pulls are also reviewed first. dotagents fetches without an interactive prompt, checks that the update is a fast-forward, audits the remote tree in an isolated worktree, and scans changed portable files without returning matched secret values. Only the confirmed plan can advance the working library:

```sh
dotagents sync ~/.agents --pull \
  --trust-source git@github.com:you/agent-library.git \
  --minimum-release-age 10080 --out pull-plan.json
dotagents apply pull-plan.json --yes
```

## Prior art

The product model is informed by [yourconscience/dotagentss](https://github.com/yourconscience/dotagentss). Package and lockfile compatibility follows the direction of [Agent Skills discussion #210](https://github.com/agentskills/agentskills/discussions/210). This is an original TypeScript implementation; literal upstream code must retain its license and attribution.

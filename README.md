# dotagents

**Your portable AI-agent library.**

Keep the skills and setup you have built in one Git-backed library, then bring
the reviewed version to the agents you use on every computer. `dotagents`
keeps the library portable; it never needs to own your Git host or credentials.

## Why

An agent setup is part of your working craft: skills, instructions, commands,
and subagents that you have selected or written over time. It should be easy to
carry, inspect, share deliberately, and restore without overwriting local work.

`dotagents` gives that setup a canonical home and a deliberate delivery path:

1. Keep a portable library in Git.
2. Preview exact changes as a plan.
3. Apply only the plan you reviewed to an explicit agent target.

The library can live in a private GitHub, GitLab, self-hosted, or local Git
repository. Credentials stay with Git; `dotagents` rejects credential-bearing
remote URLs from its portable files.

## Install

Requires Node.js 20 or newer.

```sh
npm install -g dotagents
dotagents --help
```

## Start a library

Every write is a separate, explicit apply step.

```sh
# Preview a new portable library. This does not create the directory yet.
dotagents init ~/.agents --name my-agent-library --out init-plan.json

# Inspect the plan, then create exactly what it described.
dotagents apply init-plan.json --yes

# Add an owned skill from an existing local folder.
dotagents import ~/.agents \
  --owned writing="$HOME/.codex/skills/writing" \
  --out import-plan.json
dotagents apply import-plan.json --yes
```

`~/.agents` is only a convention. Use any directory you want for the canonical
library.

## Bring it to an agent

Tell `dotagents` exactly where a compatible agent should receive the library.
It previews whether a symlink, copy, or other native delivery is safe before it
touches the target.

```sh
dotagents plan ~/.agents \
  --target codex=symlink="$HOME/.codex/skills" \
  --out materialization-plan.json
dotagents apply materialization-plan.json --yes
```

Existing unmanaged files are never silently replaced. If an earlier managed
copy has local edits, the plan stops and explains what needs review.

## What belongs in the library

| Resource | What dotagents does |
| --- | --- |
| Skills | Inventories bounded Agent Skills folders, hashes their content, and materializes reviewed views. |
| Instructions, commands, and subagents | Stores them as typed portable resources and delivers them only through an adapter that explicitly supports them. |
| External skills | Keeps the upstream Git identity, immutable commit, integrity, and license in a lockfile instead of silently copying a moving source. |
| Local machine state | Keeps paths, ownership records, journals, and local overrides out of the portable Git library. |

MCP servers, hooks, installers, and executable scripts are intentionally not
portable resources yet. They need a separate execution-trust model rather than
a loose configuration field.

## Safe Git workflow

`dotagents` works with GitHub, GitLab, a private server, or a local bare
repository. It resolves remote content to an immutable commit, supports a
reviewed cooling-off period, validates in staging, and only then exposes a
clone or fast-forward update.

```sh
dotagents clone git@github.com:you/agent-library.git ~/.agents \
  --trust-source git@github.com:you/agent-library.git \
  --minimum-release-age 10080 \
  --out clone-plan.json
dotagents apply clone-plan.json --yes

dotagents sync ~/.agents --push \
  --trust-source git@github.com:you/agent-library.git \
  --out push-plan.json
dotagents apply push-plan.json --yes
```

Use `dotagents doctor`, `dotagents status`, and `dotagents audit --public`
before sharing a library. Secret findings are value-free: the report identifies
the file and rule, never prints the matched value.

## How it differs

| Tool or convention | Focus | dotagents' role |
| --- | --- | --- |
| [skills.sh](https://skills.sh/) | Discovering and installing reusable skill packages | Own and synchronize a reviewed personal or team library, including pinned external dependencies. |
| `AGENTS.md` | Guidance for one project | A portable user- or team-level library that can be projected to several compatible agents. |
| Rules/config generators | Producing project configuration | Canonical library, Git provenance, local overlays, review plans, and guarded delivery. |
| [yourconscience/dotagents](https://github.com/yourconscience/dotagents) | A broader agent-dotfiles workflow | A TypeScript, library-first CLI focused on typed portable resources and explicit preview/apply boundaries. |

The project takes inspiration from the upstream dotagents model and the
[Agent Skills compatibility discussion](https://github.com/agentskills/agentskills/discussions/210), while remaining an independent implementation.

## Documentation

- [Resource model](docs/resource-model-v2.md)
- [Agent Skills RFC compatibility](docs/rfc-210-compatibility.md)
- [Changelog](CHANGELOG.md)

## Development

```sh
bun install --frozen-lockfile
bun run check
bun run package:smoke
```

CI exercises the project on Linux, macOS, and Windows. The release workflow
builds the npm tarball, installs that exact tarball in a clean consumer folder,
generates an SBOM and checksums, and binds all artifacts to the immutable source
commit before publication.

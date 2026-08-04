<p align="center">
  <img src="docs/assets/dotagents-mark.svg" width="92" alt="dotagents" />
</p>

<h1 align="center">dotagents</h1>

<p align="center">
  <strong>Your AI-agent setup, carried forward.</strong><br />
  One portable library for the skills, instructions, and workflows you have built over time.
</p>

<p align="center">
  <a href="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml"><img src="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6d6af7.svg" alt="MIT license" /></a>
  <a href="https://github.com/beautyfree/dotagents/stargazers"><img src="https://img.shields.io/github/stars/beautyfree/dotagents?style=flat&color=6d6af7" alt="GitHub stars" /></a>
</p>

![A real dotagents setup run](docs/assets/setup.gif)

## Your tools should travel with you

The prompts, skills, and instructions you collect become part of how you work.
They should not disappear with a laptop, get scattered across agent folders, or
turn into an opaque pile of copies.

`dotagents` gives them one calm, portable home. It discovers what you already
use, explains what will happen in plain language, and lets you carry the result
between computers or share it deliberately with a team.

It is for developers, certainly — and also for designers, writers, product
managers, researchers, and anyone building a repeatable way of working with AI.

## Start here

```sh
npm install -g dotagents
dotagents setup
```

That is the friendly path. `setup` scans compatible agent folders and shows a
short review before it changes anything. It can adopt an existing
`~/.agents/skills` library in place, so your skills are not copied over or
silently replaced.

```text
Your agent setup, in one library.
Found 24 skills across 3 agents.

16 skills are ready to keep in your library.
6 skills stay linked to their original source.
2 skills need review and will stay untouched.

Nothing outside your new library will be removed or overwritten.
```

Use `--dry-run` when you only want the review, or `--yes` in an automated
workflow:

```sh
dotagents setup --dry-run
dotagents setup --yes
```

> [!TIP]
> The demo above is not a mockup. It is rendered from
> [`docs/demo/setup.tape`](docs/demo/setup.tape) with [VHS](https://github.com/charmbracelet/vhs), against a small fixture committed in this repository.

## A library, not another lock-in

Your library is an ordinary Git repository. Keep it private, publish selected
skills, use GitHub, GitLab, a company server, or a local remote — the choice is
yours. Git keeps credentials; portable dotagents files never contain them.

```sh
dotagents setup ~/my-agent-library \
  --remote git@github.com:you/my-agent-library.git
```

The command creates the local Git workspace and records `origin`. It does not
make a commit, push, or publish anything for you.

## Built to be safe without being scary

| What you need | What dotagents does |
| --- | --- |
| Keep local work | Never overwrites an unmanaged agent folder. |
| Keep source context | Records verified external skills as sources instead of mystery copies. |
| Share confidently | Flags possible secrets without displaying their values. |
| Restore reliably | Reviews a pinned Git revision before materializing it on another machine. |
| Stay in control | Every persistent change is previewed and rechecked before it runs. |

## Bring skills where you work

Many compatible agents can read the shared `.agents/skills` library directly.
For an agent that needs its own native folder, dotagents previews an explicit,
safe delivery plan:

```sh
dotagents plan ~/.agents \
  --target codex=symlink="$HOME/.codex/skills" \
  --out materialization-plan.json
dotagents apply materialization-plan.json --yes
```

The plan stops rather than replacing an existing folder it does not own.

## Learn only what you need

- [Everyday workflows](docs/workflows.md) — first setup, a second computer, sharing, and recovery.
- [Resource model](docs/resource-model-v2.md) — what is portable and why.
- [Agent Skills RFC compatibility](docs/rfc-210-compatibility.md) — compatibility decisions and boundaries.
- [CLI reference](docs/README.md) — plans, source trust, Git, and machine-readable output.

## For teams and tool builders

`dotagents` is a small TypeScript library as well as a CLI. Its portable files
are intentionally provider-neutral, while machine paths, journals, and local
credentials stay local. Integrations can use the same discovery, planning, and
apply primitives without depending on a particular agent app.

```sh
dotagents --help
```

# Everyday workflows

This guide contains the deeper operational detail behind the short path in the
project README. Every command either previews a plan or applies a plan you have
already reviewed.

## Start a personal library

```sh
dotagents setup
```

`setup` uses `~/.agents` by default. It discovers compatible agent folders,
keeps verified Skills CLI packages as source references, and leaves uncertain
or unsafe folders on the current machine.

Preview without changing anything:

```sh
dotagents setup --dry-run
```

Save a portable review artifact for a teammate or automation:

```sh
dotagents setup --out setup-plan.json
dotagents apply setup-plan.json --yes
```

## Keep the library in Git

Connect a new or existing remote while setting up:

```sh
dotagents setup ~/.agents --remote git@github.com:you/agent-library.git
```

This only initializes local Git and records the remote. Create and review a
commit separately, then push it through a reviewed plan:

```sh
dotagents commit ~/.agents --message "Build my agent library" --out commit-plan.json
dotagents apply commit-plan.json --yes

dotagents sync ~/.agents --push --trust-source git@github.com:you/agent-library.git --out push-plan.json
dotagents apply push-plan.json --yes
```

## Restore on another computer

Clone only a trusted source, pinned to the reviewed commit:

```sh
dotagents clone git@github.com:you/agent-library.git ~/.agents \
  --trust-source git@github.com:you/agent-library.git \
  --out clone-plan.json
dotagents apply clone-plan.json --yes
```

Then preview delivery to agents that do not already read the shared library:

```sh
dotagents plan ~/.agents \
  --target codex=symlink="$HOME/.codex/skills" \
  --out materialization-plan.json
dotagents apply materialization-plan.json --yes
```

## Check before sharing

```sh
dotagents doctor ~/.agents
dotagents audit ~/.agents --public
```

Secret findings identify a file and rule, but never print a matched value.

## When something needs attention

```sh
dotagents status ~/.agents
dotagents status ~/.agents --json
```

The human view gives a concise health summary. `--json` has the exact managed
paths for tooling or careful troubleshooting.

## Source trust

Network operations are denied unless you explicitly trust a source. For the
complete policy and advanced options, run:

```sh
dotagents --help
```

This separation is intentional: a simple first run never contacts a remote,
and an automated run cannot broaden trust by accident.

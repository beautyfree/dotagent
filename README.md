<p align="center">
  <img src="docs/assets/dotagents-mark.svg" width="92" alt="dotagents" />
</p>

<h1 align="center">dotagents</h1>

<p align="center">
  <strong>One portable home for the AI-agent skills you have collected.</strong><br />
  Set it up once, use it with compatible agents, and take it to another computer when you are ready.
</p>

<p align="center">
  <a href="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml"><img src="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6d6af7.svg" alt="MIT license" /></a>
  <a href="https://github.com/beautyfree/dotagents/stargazers"><img src="https://img.shields.io/github/stars/beautyfree/dotagents?style=flat&color=6d6af7" alt="GitHub stars" /></a>
</p>

![A successful dotagents setup](docs/assets/setup.gif)

## What it does

AI agents store skills in different places. `dotagents` gives you one library —
normally `~/.agents` — and safely makes its skills available to the compatible
agents already installed on your computer.

| You have | dotagents does |
| --- | --- |
| A skill in `~/.agents/skills` | Keeps it in the shared library; agents that read the shared folder use it directly. |
| A compatible agent with an empty skills folder | Creates per-skill links back to the library. No duplicate copy to maintain. |
| A non-empty or unfamiliar agent folder | Leaves it alone. It never replaces files it does not manage. |
| A skills.sh package with verifiable provenance | Records a pinned source instead of uploading another copy. |

> [!IMPORTANT]
> `dotagents setup` does **not** publish anything. It only creates or updates
> your local `~/.agents` library after one confirmation. GitHub, GitLab, a
> company Git server, or a public repository are entirely your choice and are
> configured in a separate, reviewed step.

## Start here

The npm package name is reserved for the first release. Until then, install the
current CLI directly from this repository, then run one command:

```sh
npm install -g github:beautyfree/dotagents
dotagents setup
```

The command shows what it found and asks once before it changes anything. After
you answer `y`, it:

1. creates `~/.agents` if necessary;
2. brings in skills that are safe to own, while retaining verified external
   sources as references;
3. connects compatible empty agent folders with links; and
4. reports exactly what is now available.

If you install another agent later, run this to connect it without touching
existing agent files:

```sh
dotagents connect
```

Check the current connections at any time:

```sh
dotagents status
```

## Back up or share your library

Once you like the library locally, you can put it in **any Git remote**. Create
an empty repository wherever you prefer, then replace the example URL below.
These commands first create review files; `apply --yes` is the deliberate step
that performs the reviewed local Git action.

```sh
dotagents git-init ~/.agents \
  --remote git@github.com:you/my-agent-library.git \
  --out git-init-plan.json
dotagents apply git-init-plan.json --yes

dotagents commit ~/.agents \
  --message "My agent library" \
  --out commit-plan.json
dotagents apply commit-plan.json --yes

dotagents sync ~/.agents --push \
  --trust-source git@github.com:you/my-agent-library.git \
  --out push-plan.json
dotagents apply push-plan.json --yes
```

Choose the repository visibility that fits your use: private for a backup,
team-accessible for shared work, or public only after you have reviewed its
contents. Before a public push, run:

```sh
dotagents doctor ~/.agents
dotagents audit ~/.agents --public
```

Secret checks point to a file and line but never print the matched value.

## Restore on a new computer

Clone only a remote you trust. The clone plan pins the reviewed commit before
writing your library; the final `connect` command then makes it available to
the compatible agents installed on that computer.

```sh
dotagents clone git@github.com:you/my-agent-library.git ~/.agents \
  --trust-source git@github.com:you/my-agent-library.git \
  --out clone-plan.json
dotagents apply clone-plan.json --yes
dotagents connect
```

## What dotagents will not do

- It does not create a remote repository, push to one, or make anything public
  on its own.
- It does not overwrite an existing agent skill or follow a linked file outside
  a skill folder.
- It does not silently trust a network source; network operations require an
  explicit trust rule.
- It does not run skill code while discovering, reviewing, or copying files.

## Need the deeper controls?

The normal route is `setup` → optional Git backup → `connect` on another
computer. For dry runs, automation, recovery, source trust, and the complete
command reference, see:

- [Everyday workflows](docs/workflows.md)
- [Full CLI reference](docs/README.md)
- [How resources stay portable](docs/resource-model-v2.md)
- [Supported Agent Skills conventions](docs/rfc-210-compatibility.md)

dotagents is open source, provider-neutral, and works with any Git host that
you choose.

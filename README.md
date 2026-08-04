<p align="center">
  <img src="docs/assets/dotagents-mark.svg" width="92" alt="dotagents" />
</p>

<h1 align="center">dotagents</h1>

<p align="center">
  <strong>Your AI-agent setup, carried forward.</strong><br />
  Keep the skills and workflows you have built — on every computer, with every agent.
</p>

<p align="center">
  <a href="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml"><img src="https://github.com/beautyfree/dotagents/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-6d6af7.svg" alt="MIT license" /></a>
  <a href="https://github.com/beautyfree/dotagents/stargazers"><img src="https://img.shields.io/github/stars/beautyfree/dotagents?style=flat&color=6d6af7" alt="GitHub stars" /></a>
</p>

![dotagents setup](docs/assets/setup.gif)

## The way you work is worth keeping

Every useful skill, prompt, and instruction you collect makes your work a
little more yours. Over time, they become a personal toolkit — for coding,
design, writing, research, product work, or anything else you do with AI.

`dotagents` gives that toolkit one home. It finds what you already use, keeps
it safe, and makes it easy to take with you or share deliberately.

## One command to begin

```sh
npm install -g dotagents
dotagents setup
```

That is all you need to start. dotagents looks at your existing agent skills,
shows you what it found, and asks once before changing anything. Your current
files stay where they are — nothing is silently replaced or uploaded. Empty
compatible agent folders are connected safely as part of that same setup.

Afterwards, your library has one clear job: it is the home for the skills you
choose to carry. Agents that already understand `.agents/skills` use it
directly; other compatible agents receive safe links only when their own skills
folder is empty. Existing agent files are left untouched.

## Keep your toolkit yours

- **Bring it anywhere.** Store one library in any Git host, a private server,
  or your own machine.
- **Use the agents you like.** Keep shared skills available to compatible
  agents, with safe delivery when an agent needs its own folder.
- **Share on your terms.** Make a private backup, collaborate with a team, or
  publish only the skills you want others to use.
- **Stay in control.** dotagents checks changes before applying them and never
  exposes secret values in its reports.

## When you want to go further

Everything beyond first setup is available when you need it — moving to a new
computer, connecting Git, sharing a library, or working with a team.

- [Everyday workflows](docs/workflows.md)
- [How resources stay portable](docs/resource-model-v2.md)
- [Supported Agent Skills conventions](docs/rfc-210-compatibility.md)
- [Full CLI reference](docs/README.md)

## Built for people, not lock-in

dotagents is open source, written in TypeScript, and intentionally independent
of any single AI provider or Git host. It is a portable library and CLI that
other tools can build on — not another place to trap your setup.

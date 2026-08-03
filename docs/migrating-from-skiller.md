# Migrate from a Skiller sync repository

> Existing `skiller-sync.yaml` repositories are never rewritten automatically. Create or connect a canonical library in Sync Center, review the resulting plan, and confirm the Git destination explicitly.

Skiller can read legacy sync manifests v1, v2, and v3 through `@beautyfree/dotagent/adapters/skiller`. New libraries use the canonical dotagent layout.

## Create a canonical repository in Skiller

1. Open **Sync Center** and choose **Create my library**.
2. Review which local skills are copied, which external skills remain immutable references, and which entries stay local.
3. Choose private or public visibility. Public libraries require an explicit license.
4. Choose GitHub or another Git server, then confirm creation.
5. Inspect the repository before archiving the legacy remote.

The new repository contains:

```text
skills.json       # package identity, owned paths, and dependency requests
skills.lock       # exact commits, integrity, licenses, and exported skills
dotagent.yaml     # portable per-skill routing policy
skills/           # reviewed owned skill files only
README.md
```

It does not contain absolute home paths, Git credentials, the local conflict ledger, dependency caches, or `dotagent.local.yaml`.

## Connect the library on another computer

1. Open **Sync Center** and choose **Use an existing library**.
2. Enter the Git remote. Private remotes use the machine's existing Git or SSH credentials.
3. Select the agents detected on this computer.
4. Choose **Connect & review**. This creates only a managed local Git workspace.
5. Review remote-only, local-only, and conflicting skills before applying anything to agent folders.

The selected agents are written to gitignored `dotagent.local.yaml`. Portable per-skill routes remain authoritative and are intersected with this machine selection.

## Verify from the CLI

```sh
beautyfree-dotagent inspect /path/to/library --json
beautyfree-dotagent doctor /path/to/library --json
beautyfree-dotagent audit /path/to/library --public --json
```

Use `--public` only for a repository intended for public distribution; a missing license is an error for public libraries and an advisory for private ones.

## Failure behavior

| Situation | Result |
| --- | --- |
| Legacy schema is supported | Parsed in memory; the source file is not rewritten |
| Legacy schema is newer than the adapter | Import stops with an upgrade action |
| Remote library contains a possible secret | Pull fast-forward and restore are blocked before agent writes |
| Local skill differs from the remote skill | Conflict is shown; neither side wins automatically |
| External dependency cannot be authenticated | Owned skills are not partially restored in the same operation |
| Agent is not detected on this computer | It is excluded from local materialization |

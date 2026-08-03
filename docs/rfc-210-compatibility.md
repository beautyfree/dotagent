# Agent Skills RFC compatibility

> Agent Skills discussion #210 is still a proposal. dotagent exposes only the subset below and versions its own schemas independently.

dotagent follows the proposal's decentralized Git-package direction while keeping a richer internal model for safe desktop synchronization.

## Use an RFC-style package

A canonical library separates the package manifest, immutable resolution, portable routing, and machine state:

```text
skills.json
skills.lock
dotagent.yaml
dotagent.local.yaml  # gitignored
skills/
```

Run a structural compatibility check without executing skill content:

```sh
beautyfree-dotagent inspect . --json
beautyfree-dotagent audit . --public --json
```

## Compatibility matrix

| Proposal concept | dotagent behavior | Compatibility status |
| --- | --- | --- |
| Git URL as package identity | Normalizes HTTPS, SSH/scp, and `file:` identities without retaining credentials | Implemented |
| Mutable tag or branch input | Resolves once to a 40-character commit before entering `skills.lock` | Implemented |
| Lockfile integrity | Records package SHA-256 integrity and verifies prepared content again before materialization | Implemented |
| Flat exported skill names | Rejects owned/dependency name collisions before writing a lock | Implemented |
| Repository subpath selection | Uses explicit dependency `select` entries; `.` is allowed only for a dependency root skill | Implemented extension |
| Explicit vendoring | Stores reviewed files with immutable origin, integrity, source path, and license in portable policy | Implemented extension |
| Transitive package graph | The v1 schema accepts direct dependencies only | Deliberately deferred |
| OCI transport | Git and local filesystems only | Deliberately deferred |
| Publisher signatures | Git/npm provenance is release evidence; no portable signature field is claimed | Deliberately deferred |
| Final RFC filenames and version solver | dotagent owns versioned `skills.json` and `skills.lock` schemas until the proposal stabilizes | Intentional deviation |

## Safety extensions

dotagent adds behavior that a package-format RFC alone does not define:

- machine-local agent selection stays in gitignored `dotagent.local.yaml`;
- portable per-skill routes and local agent choices are intersected with detected agents;
- plan IDs bind previews to exact inputs before apply;
- managed markers, three-way state, and journals prevent unmanaged overwrites and recover interrupted writes;
- audits report file, line, and rule for possible secrets without returning the matched value;
- agent detection never treats `.agents/skills` by itself as proof that an agent is installed.
- dependency, vendored, owned, local-only, and excluded dispositions are explicit import-plan actions; no unavailable source silently changes category.

## Unsupported input

dotagent stops instead of guessing when a manifest, lock, Skills CLI lock, or Skiller compatibility manifest uses a newer unsupported schema. Upgrade dotagent or migrate through a versioned adapter; do not edit a lockfile to downgrade its version number.

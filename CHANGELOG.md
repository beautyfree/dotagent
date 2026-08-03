# Changelog

All notable changes to `@beautyfree/dotagent` are recorded here. The project follows semantic versioning after its first public package release.

## Unreleased

### Added

- Canonical `skills.json`, `skills.lock`, portable `dotagent.yaml`, and private `dotagent.local.yaml` schemas.
- Cross-agent discovery, Skills CLI v3 and Skiller v1-v3 compatibility adapters, and a provider-neutral catalog for 49 agent integrations.
- Journaled import and materialization plans with rollback, recovery, stale-preview checks, and unmanaged-target protection.
- Immutable Git dependency resolution, package integrity, license audit, prepared checkouts, and deterministic dependency update deltas.
- Reviewed Git commit, pull, and push plans with secret-safe isolated remote inspection.
- Reviewed Git clone plans with credential-free remotes, staging validation, stale-plan checks, and atomic destination creation.
- Shared owned-skill export policy for Skiller and the CLI core, including deterministic file hashes and value-free findings.
- Explicit vendored imports with immutable origin, integrity, skill path, and license metadata; mismatched content is rejected before copy.
- Agent extension descriptors now require concrete data-only delivery roots; the unimplemented config-path placeholder was removed instead of advertising unsafe support.
- CLI library initialization is preview-only until its serialized plan is explicitly applied with `--yes`.
- Git repository initialization and origin changes now use stale-checked preview/apply plans too.
- CLI dependency resolution no longer has a direct `--write` path; a library-bound plan must be reviewed and applied explicitly.
- Git identity normalization now lives in a dependency-free leaf module shared by configuration, source resolution, and workspace plans, while the existing `sources` export remains compatible.
- Versioned JSON Schemas, compatibility fixtures, package-content verification, and macOS/Linux/Windows CI.

### Security

- Portable outputs reject embedded Git credentials, escaping paths, unsafe links, and value-bearing secret reports.
- `.agents/skills` alone is not accepted as agent-installation evidence.

### Compatibility

- Existing Skiller sync manifests remain adapter inputs and are not silently rewritten.
- Agent Skills discussion #210 is treated as directional input; claimed compatibility and deviations are documented in `docs/rfc-210-compatibility.md`.

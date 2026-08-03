# Changelog

All notable changes to `@beautyfree/dotagent` are recorded here. The project follows semantic versioning after its first public package release.

## Unreleased

### Added

- Canonical `skills.json`, `skills.lock`, portable `dotagent.yaml`, and private `dotagent.local.yaml` schemas.
- Cross-agent discovery, Skills CLI v3 and Skiller v1-v3 compatibility adapters, and a provider-neutral catalog for 49 agent integrations.
- Journaled import and materialization plans with rollback, recovery, stale-preview checks, and unmanaged-target protection.
- Immutable Git dependency resolution, package integrity, license audit, prepared checkouts, and deterministic dependency update deltas.
- Reviewed Git commit, pull, and push plans with secret-safe isolated remote inspection.
- Versioned JSON Schemas, compatibility fixtures, package-content verification, and macOS/Linux/Windows CI.

### Security

- Portable outputs reject embedded Git credentials, escaping paths, unsafe links, and value-bearing secret reports.
- `.agents/skills` alone is not accepted as agent-installation evidence.

### Compatibility

- Existing Skiller sync manifests remain adapter inputs and are not silently rewritten.
- Agent Skills discussion #210 is treated as directional input; claimed compatibility and deviations are documented in `docs/rfc-210-compatibility.md`.

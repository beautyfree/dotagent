# Resource model v2

Dotagents v2 models an agent setup as typed, immutable data instead of assuming that every portable item is a skill directory.

## Supported kinds

| Kind | Portable source | Delivery rule |
| --- | --- | --- |
| `skill` | A bounded Agent Skills directory | Delivered by the existing ownership-aware skill materializer |
| `instruction` | A regular Markdown or native text file | Projected only through an explicitly declared agent adapter |
| `command` | A regular Markdown, YAML, JSON, or native text file | Projected only through an explicitly declared agent adapter |
| `subagent` | A regular Markdown, YAML, JSON, TOML, or native text file | Projected only through an explicitly declared agent adapter |

MCP servers, hooks, installers, and executable scripts are deliberately not resource kinds. Supporting them requires a separate execution trust model; adding an unknown field or kind fails schema validation.

The portable manifest uses `schema_version: 2` and validates against [`schemas/resources.schema.json`](../schemas/resources.schema.json). Stable identity is `kind:id`; two scopes may deduplicate the same identity only when their immutable content integrity is equal.

## Capability review

Every agent declares one capability for every resource kind:

- `native`: the adapter can preserve the resource semantics;
- `lossy`: the adapter names the information it cannot preserve and requires explicit acceptance in the reviewed plan;
- `unsupported`: no output is written.

Unknown agents and unknown capabilities are unsupported. Legacy extension descriptors receive a skills-only fallback and cannot silently gain support for instructions, commands, or subagents.

## Safe projection

Projection has separate plan and apply stages:

1. The plan binds source integrity, target snapshot, local ownership snapshot, adapter, lossy acceptance, and a deterministic plan ID.
2. Secret scanning returns only rule and location metadata; a possible secret blocks delivery without serializing the matched value.
3. Apply rechecks the plan ID, source, target, ownership ledger, library root, and target root.
4. Only the exact reviewed files are staged and renamed. An adapter never replaces or traverses the agent's whole native directory.
5. An existing target is writable only when the device-local ledger proves dotagents created it and it has no local edits. Missing or unmanaged targets require a separate reviewed repair or adopt flow.

## Reviewed adoption

`planResourceAdoption` is the boundary for bringing one explicitly selected
unmanaged native resource into the canonical library. The preview records the
resource identity, destination, immutable source integrity, file/byte counts,
license decision, and value-free secret locations. It does not mutate the
native source and does not execute resource content.

Adoption is blocked when the resource identity or portable path already exists,
the canonical target contains content, a shared/public library has no reviewed
license, or a possible secret is found. `applyResourceAdoption` re-creates the
plan from current bytes and applies the resource plus `resources.json` as one
rollback-capable library transaction. The resulting operation is written to
device-local history and can use the normal reviewed Undo flow.
6. A durable journal restores previous managed files after failure or process interruption. Unmanaged siblings remain untouched.

The ownership ledger and journal live under the source library's `.dotagents/` device state. They can contain absolute machine paths and therefore must never be included in the portable library commit.

## Adapter boundary

The generic apply layer accepts exact source and target paths produced by a reviewed adapter. It does not evaluate resource content. Skills continue through the directory materialization engine; file resources use the managed resource projection engine. A future adapter must first declare its capability and loss, then prove with tests that it preserves unmanaged native files.

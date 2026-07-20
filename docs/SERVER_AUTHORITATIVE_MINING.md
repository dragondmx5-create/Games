# Server-Authoritative Mining

Mining extends the harvesting model with shared, multi-strike resource state.

## Canonical layout

`server/src/world/miningLayout.ts` deterministically derives iron veins, crystal geodes, and ancient seams from the global world seed and region. Placement is checked against the canonical overworld topology and kept away from harvesting nodes, settlements, portals, and other veins.

Mutable integrity, cooldown, extraction count, and last miner live in `WorldMiningState`; the client receives only the current projection.

## Strike transaction

A strike submits only:

- canonical `nodeId`;
- inventory `expectedRevision`;
- idempotency key.

The server validates fresh presence, region, distance, pickaxe ownership, cooldown, and the row-locked integrity state. Each accepted strike is an inventory-ledger command. Non-collapsing strikes return no item delta. The one strike that collapses the vein rolls the canonical yield, updates cooldown/extraction count, awards progression, and emits one deduplicated story event in the same serializable transaction.

Exact retries replay the original inventory receipt and never collapse or reward the node twice. Stale revisions, depleted nodes, invalid IDs, missing tools, and client-authored amounts or rewards fail closed.

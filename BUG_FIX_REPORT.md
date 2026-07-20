# Reliability and Security Fix Summary

The project retains the earlier persistence, Vault and WebSocket hardening:

- Server-derived Vault contribution from persisted bag IDs.
- Atomic death save and bag forfeiture.
- Idempotent Vault claims.
- Stable dungeon run identity.
- Save request serialization to prevent stale overwrite.
- Persisted Loot Bags and farm crop type.
- WebSocket connection sequencing and ghost-player cleanup.
- Atomic Red Zone kill settlement.
- Message size/protocol validation.

The six-land phase adds:

- Save v3 instance metadata.
- Version migration for old saves.
- Regional death rules.
- Correct source-land respawn.
- Dungeon-only floor semantics.
- Exact Dungeon and Black Market return coordinates.

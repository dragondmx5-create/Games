# Server-Authoritative NPC Interactions

Settlement NPC identity, role, name, and interaction anchor are generated canonically by `server/src/world/npcLayout.ts`. Each settlement exposes a merchant, Archivist, and scout at walkable coordinates derived from the shared overworld topology.

The client requests an interaction using only `npcId` and an idempotency key. The server independently verifies:

- the NPC ID belongs to the current world layout;
- fresh overworld presence exists;
- the player is in the NPC's region;
- the player is within the canonical interaction radius.

`NpcInteractionReceipt` makes retries replay-safe. Dialogue and reaction are selected after locks from current server state. The Archivist reacts to the player's story stage and can advance the final story objective only through the verified interaction receipt. The merchant opens the shop only after a successful server response.

Dynamic NPC movement is deliberately fail-closed. All interaction anchors are stationary until a server-owned NPC motion stream is implemented; the browser does not patrol or relocate authoritative NPCs locally.

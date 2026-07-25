# UNDRAL Core 3D

A deliberately small extraction of the project that keeps only gameplay logic and a minimal Three.js presentation layer.

## Included

- Game loop and state
- Player movement
- Collision against world bounds and rectangular walls
- Enemy aggro and chase AI
- Melee attacks, health, death and respawn
- XP and level progression
- Minimal Three.js scene using primitive geometry only

## Intentionally excluded

- 3D modeling toolkit and authored models
- PBR textures and texture-generation scripts
- Post-processing and cinematic shaders
- Weather, particles, audio and visual effects
- Accounts, database, online services and Android shell
- Large UI panels and content-production tools

## Run

```bash
cd core3d
npm install
npm run dev
```

Production check:

```bash
npm run build
```

## Structure

```text
src/core/types.ts       Domain types and vector helpers
src/core/World.ts       Movement and collision
src/core/Combat.ts      Damage, cooldowns and progression
src/core/Game.ts        Game loop, state and enemy AI
src/render/Renderer3D.ts Minimal primitive-only Three.js renderer
src/main.ts             Input, HUD and animation loop
```

The game core has no dependency on Three.js. Only `src/render/Renderer3D.ts` imports the rendering library, so the renderer can be replaced without rewriting gameplay rules.

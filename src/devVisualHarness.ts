// Dev-only visual harness: renders the real Renderer + a locally generated
// World with no backend, so shader changes can be verified in a browser
// without an account. Reached only via ?visual-harness on the dev server;
// never part of the shipped UI flow. Presentation-only by construction —
// it renders local state and submits nothing.
import { Assets } from './assets';
import { Renderer } from './render3d';
import { generateRegion, setRegionResourceUnavailable } from './world';
import { newAnimal, newPlayer, newEnemy, type Animal, type Enemy } from './entities';

export async function startVisualHarness(rx = 0, ry = 0): Promise<void> {
  const assets = new Assets();
  await assets.load();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  canvas.style.display = 'block';
  const renderer = new Renderer(canvas, assets);
  // (0,0) is Evergrove — the green-land capital region, houses + plaza + gates
  const world = generateRegion(rx, ry, 424242);
  const player = newPlayer(world);
  // spawn on the village plaza (the region heart), not the random entrance tile
  player.x = (Math.floor(world.w / 2) + 0.5) * 16;
  player.y = (Math.floor(world.h / 2) + 0.5) * 16;
  // demo: fell one tree so the stump art is visible in review screenshots
  const felled = world.resourceNodes.find((node) => node.kind === 'tree');
  if (felled) setRegionResourceUnavailable(world, felled.id, new Date(Date.now() + 60_000).toISOString());

  const enemies: Enemy[] = [
    newEnemy('bug', player.x + 40, player.y - 20, 1),
    newEnemy('shellbug', player.x + 70, player.y + 10, 1),
    newEnemy('wallworm', player.x - 60, player.y + 30, 1),
    newEnemy('spitter', player.x - 40, player.y - 45, 1),
  ];
  const animals: Animal[] = world.animalSpawns.slice(0, 5).map((spawn) => newAnimal(spawn));
  player.swingT = 0.1;
  player.swingArc = Math.PI * 0.9;
  player.swingRange = 30;
  player.moving = true;
  player.running = true;

  let last = performance.now();
  const frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    player.animTime += dt;
    player.swingT = 0.08 + 0.07 * Math.sin(now / 400);
    renderer.render(world, player, enemies, [], animals, null, [], [], 0, dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  (window as unknown as { __undralHarness: object }).__undralHarness = { world, player, renderer };
}

import { Game } from './core/Game';
import { Renderer3D } from './render/Renderer3D';

const app = document.querySelector<HTMLElement>('#app');
const stats = document.querySelector<HTMLElement>('#stats');
const message = document.querySelector<HTMLElement>('#message');

if (!app || !stats || !message) {
  throw new Error('Required application elements are missing.');
}

const game = new Game();
const view = new Renderer3D(app, game.snapshot());
const keys = new Set<string>();
let attackQueued = false;
let lastTime = performance.now();
let messageTimer = 0;

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'Space') {
    event.preventDefault();
    attackQueued = true;
  }
});

window.addEventListener('keyup', (event) => keys.delete(event.code));

const movement = () => ({
  x: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
    - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
  z: (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
    - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0),
});

const frame = (now: number): void => {
  const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  game.update(delta, { move: movement(), attack: attackQueued });
  attackQueued = false;

  const snapshot = game.snapshot();
  view.render(snapshot);

  const aliveEnemies = snapshot.enemies.filter((enemy) => enemy.alive).length;
  stats.textContent = `HP ${snapshot.player.hp}/${snapshot.player.maxHp} · Level ${snapshot.player.level} · XP ${snapshot.player.xp} · Enemies ${aliveEnemies}`;

  const events = game.drainEvents();
  if (events.length > 0) {
    message.textContent = events.at(-1)?.text ?? '';
    messageTimer = 2;
  } else if (messageTimer > 0) {
    messageTimer -= delta;
    if (messageTimer <= 0) message.textContent = '';
  }

  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);

window.addEventListener('beforeunload', () => view.dispose());

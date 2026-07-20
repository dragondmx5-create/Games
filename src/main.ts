// Self-hosted UI fonts (Inter for body/labels, Sora for display). Bundled and
// served from our own origin so the game never depends on an external font CDN
// — no blocking request to fonts.googleapis.com, works fully offline.
import '@fontsource-variable/inter';
import '@fontsource-variable/sora';
import './styles.css';
import { initNativeRuntime } from './native';
import { Game } from './game';
import { RedZoneGame } from './redZoneGame';
import { Assets } from './assets';
import { TouchControls } from './touch';
import { AudioManager } from './audio';
import { initFullscreenButton, initRotateHint, requestFullscreenFromGesture } from './fullscreen';
import { loadStats } from './stats';
import { initAuthPanel } from './authPanel';
import { AuthUser, me, getSave, getVault, getWorldSeed, backendUp, type ServerPvpAdmissionResponse, type ServerPvpReturnResponse } from './api';
import { SaveData } from './save';
import { WebGL2NotSupportedError } from './rendering/core/WebGLSupportError';
import { cycleGraphicsQuality, getGraphicsQuality, qualityLabel } from './rendering/quality/QualityManager';
import { UiShell } from './ui/shell';
import { notify, setConnection, updateRuntime } from './ui/events';
import { initInterfaceExperience } from './ui/experience';
import { preloadPbrTextures } from './art3d/pbrTextureManifest';

void initNativeRuntime();

const wrap = document.getElementById('wrap')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const startBtn = document.getElementById('start-btn')!;
const newGameBtn = document.getElementById('new-game-btn')!;
const fullscreenBtn = document.getElementById('fullscreen-btn')!;
const muteBtn = document.getElementById('mute-btn')!;
const graphicsBtn = document.getElementById('graphics-btn')!;
const rotateHint = document.getElementById('rotate-hint')!;
const storyEl = document.getElementById('story')!;
const hintEl = document.getElementById('controls-hint')!;
const vaultInfoEl = document.getElementById('vault-info')!;
const ui = new UiShell();
let bootEndpointFailed = false;

// assets are owner-controlled only (deployed manifest + built-in pack) —
// the player-facing CUSTOM ASSETS upload panel was removed per owner request
const assets = new Assets();
ui.setBoot('Loading visual atlas', 12);
const loading = Promise.all([
  assets.load(),
  preloadPbrTextures((loaded, total) => {
    if (!bootEndpointFailed) ui.setBoot(`Streaming PBR materials ${loaded}/${total}`, 12 + Math.round((loaded / total) * 24));
  }),
]).then(() => {
  if (!bootEndpointFailed) ui.setBoot('Visual atlas and PBR library ready', 36);
});
const touch = new TouchControls();
const audio = new AudioManager();
// Interface experience needs the audio manager so the settings panel can drive
// master volume/mute; bind it once the manager exists.
initInterfaceExperience(audio);

function refreshMuteBtn(): void {
  muteBtn.classList.toggle('is-muted', audio.isMuted);
  muteBtn.classList.toggle('active', !audio.isMuted);
  muteBtn.setAttribute('aria-label', audio.isMuted ? 'Unmute audio' : 'Mute audio');
}
refreshMuteBtn();
// the settings panel's mute toggle emits this so the corner button re-syncs.
window.addEventListener('undral:audio-sync', refreshMuteBtn);

function refreshGraphicsBtn(): void {
  const current = getGraphicsQuality();
  const label = qualityLabel(current);
  const badge = graphicsBtn.querySelector<HTMLElement>('.quality-letter');
  if (badge) badge.textContent = label.slice(0, 1);
  graphicsBtn.title = `Graphics quality: ${label} (click to change)`;
  graphicsBtn.setAttribute('aria-label', `Graphics quality: ${label}. Click to change.`);
}
refreshGraphicsBtn();
// the settings panel's quality selector emits this so the corner badge re-syncs.
window.addEventListener('undral:graphics-sync', refreshGraphicsBtn);
graphicsBtn.addEventListener('click', () => {
  cycleGraphicsQuality();
  refreshGraphicsBtn();
  window.dispatchEvent(new CustomEvent('undral:graphics-sync'));
});

window.addEventListener('undral:webgl-context-lost', () => {
  ui.setRuntimeMode('menu');
  storyEl.textContent = 'The WebGL2 context was lost. Reload the page to rebuild GPU resources.';
  ui.setStartLabel('Reload');
  setConnection('offline', 'Graphics context lost');
  startBtn.onclick = () => location.reload();
});
muteBtn.addEventListener('click', () => {
  audio.toggleMute();
  refreshMuteBtn();
  window.dispatchEvent(new CustomEvent('undral:audio-sync'));
});

// ---- an account is required for all play — see CLAUDE.md's "mandatory
// accounts" note for why this isn't additive/optional anymore ----
let currentUser: AuthUser | null = null;
let pendingSave: SaveData | null = null;
// the shared world's global seed — fetched from the server so every player
// generates the identical overworld (see docs/REGION_WORLD_PLAN.md §2)
let worldSeed: number | null = null;
// false when /api/health is unreachable — e.g. the standalone single-file
// build opened without a backend origin baked in via VITE_API_URL, or the
// server is down. Shown honestly instead of a dead LOG IN TO PLAY button.
let serverReachable = true;

function refreshContinueUi(): void {
  const canContinue = !!currentUser && !!pendingSave;
  if (!serverReachable) {
    ui.setStartLabel('Server unreachable');
    newGameBtn.classList.add('ath-hidden');
    return;
  }
  if (!currentUser) {
    ui.setStartLabel('Log in to play');
  } else {
    ui.setStartLabel(canContinue ? 'Continue expedition' : loadStats().sessions > 0 ? 'Explore again' : 'Enter world');
  }
  newGameBtn.classList.toggle('ath-hidden', !canContinue);
}

const authPanel = initAuthPanel((user) => {
  currentUser = user;
  ui.setUser(user);
  if (!user) {
    pendingSave = null;
    refreshContinueUi();
    return;
  }
  getSave()
    .then((save) => {
      pendingSave = save;
      refreshContinueUi();
    })
    .catch(() => {
      pendingSave = null;
      refreshContinueUi();
    });
});

backendUp().then(async (up) => {
  serverReachable = up;
  bootEndpointFailed = !up;
  ui.setBoot(up ? 'Realm endpoint confirmed' : 'Realm endpoint unavailable', up ? 58 : 0);
  setConnection(up ? 'pending' : 'offline', up ? 'Authenticating session' : 'Realm unavailable');
  if (!up) {
    refreshContinueUi();
    return;
  }
  getWorldSeed()
    .then((seed) => (worldSeed = seed))
    .catch(() => {});
  const user = await me();
  currentUser = user;
  ui.setUser(user);
  authPanel.setUser(user);
  pendingSave = user ? await getSave().catch(() => null) : null;
  refreshContinueUi();
  ui.setBoot('Ready to enter', 100);
  setConnection('online', 'Realm online');
}).catch((error: unknown) => {
  serverReachable = false;
  bootEndpointFailed = true;
  refreshContinueUi();
  ui.setBoot('Realm handshake failed', 0);
  setConnection('offline', 'Realm unavailable');
  notify({ title: 'Realm handshake failed', message: error instanceof Error ? error.message : String(error), tone: 'error' });
});

// public — shows even to logged-out visitors, no auth needed to view
getVault()
  .then(({ layer0, layer1, layer5 }) => {
    vaultInfoEl.textContent = `Realm vault reserves — Fracture ${layer0} crystals · Shallow depths ${layer1} · Deep vault ${layer5}`;
  })
  .catch(() => {
    /* offline / no backend configured — just stays empty */
  });

initFullscreenButton(fullscreenBtn, wrap);
initRotateHint(rotateHint, touch.active);

// ---- title text knows you've been here before ----
{
  const stats = loadStats();
  const s = stats.sessions;
  const d = stats.deaths;
  let lines: string[];
  if (s <= 0) {
    lines = ['Six lands. Hidden roads. Different rules for every threshold.', 'Learn the ecosystems before you risk what you carry.'];
  } else if (s === 1) {
    lines = ['Welcome back to the world.', 'The routes you discovered are still waiting.'];
  } else if (s === 2) {
    lines = d > 0 ? [`Back again. ${d} death${d === 1 ? '' : 's'} so far.`, 'Choose your next territory carefully.'] : ['Back again.', 'A new land is only a border crossing away.'];
  } else {
    const pool = [
      ['Another route waits beyond the frontier.', 'Not every road leads home safely.'],
      [`${d} deaths and counting.`, 'The six lands remember every crossing.'],
      ['The Underway has new stock.', 'Its brokers remember your reputation.'],
      ['Still standing.', 'That already puts you ahead of some expeditions.'],
    ];
    lines = pool[(Math.random() * pool.length) | 0];
  }
  storyEl.innerHTML = lines.map((l) => escapeHtml(l)).join('<br />');
  // startBtn's actual text is owned by refreshContinueUi() once login state
  // is known — do not flash a
  // pre-login guess here now that login state changes what the button means
  if (touch.active) {
    hintEl.textContent = 'Touch movement · attack · ability · interact · switch weapon · map';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

let activePvpGame: RedZoneGame | null = null;

function launchPvp(admission: ServerPvpAdmissionResponse, game: Game): void {
  activePvpGame?.stop();
  activePvpGame = new RedZoneGame(canvas, assets, touch, audio, admission, (result: ServerPvpReturnResponse) => {
    activePvpGame = null;
    void game.resumeFromPvp(result).catch((error: unknown) => {
      const message = `PvP return failed: ${error instanceof Error ? error.message : String(error)}`;
      storyEl.textContent = message;
      ui.showFatal(message);
    });
  });
  activePvpGame.start();
}

async function launchGame(loadFromSave: SaveData | null, seed: number, online = true): Promise<void> {
  ui.setRuntimeMode('game');
  ui.setBoot('Entering world', 100);
  audio.resume(); // must run from this real user-gesture handler — browsers block audio otherwise
  try {
    const game = new Game(canvas, assets, touch, audio, seed, launchPvp);
    updateRuntime({ mode: 'game' });
    if (loadFromSave) game.applySave(loadFromSave);
    const activePvp = online ? await game.initializeOnline() : null;
    (window as unknown as { __undral: Game }).__undral = game; // debug/test handle
    if (activePvp) {
      launchPvp({ replayed: true, pvp: activePvp }, game);
      return;
    }
    game.start();
  } catch (error) {
    const message = error instanceof WebGL2NotSupportedError
      ? error.message
      : `Game startup failed: ${error instanceof Error ? error.message : String(error)}`;
    storyEl.textContent = message;
    ui.showFatal(message);
    console.error(error);
  }
}

/** the shared world seed is required to build any world — retry the fetch
 * here in case the boot-time attempt raced a slow backend */
async function ensureWorldSeed(): Promise<number | null> {
  if (worldSeed === null) worldSeed = await getWorldSeed().catch(() => null);
  return worldSeed;
}

startBtn.addEventListener('click', async () => {
  if (!serverReachable) {
    // maybe the server came back since load — re-check instead of staying dead
    setConnection('pending', 'Checking realm endpoint');
    serverReachable = await backendUp();
    setConnection(serverReachable ? 'online' : 'offline', serverReachable ? 'Realm online' : 'Realm unavailable');
    refreshContinueUi();
    return;
  }
  if (!currentUser) {
    document.getElementById('account-btn')!.click();
    return;
  }
  if (touch.active) requestFullscreenFromGesture(wrap); // must run before any await to count as a user gesture
  ui.setBoot('Loading visual atlas', 72);
  await loading;
  ui.setBoot('Resolving shared world seed', 82);
  const seed = await ensureWorldSeed();
  if (seed === null) {
    serverReachable = false;
    refreshContinueUi();
    return;
  }
  ui.setBoot('Synchronizing canonical state', 92);
  await launchGame(pendingSave, seed);
});

newGameBtn.addEventListener('click', async () => {
  if (!window.confirm('Begin a new expedition? World exploration checkpoints restart, but your server-owned inventory and progression remain.')) return;
  if (touch.active) requestFullscreenFromGesture(wrap);
  ui.setBoot('Loading visual atlas', 72);
  await loading;
  ui.setBoot('Resolving shared world seed', 82);
  const seed = await ensureWorldSeed();
  if (seed === null) {
    serverReachable = false;
    refreshContinueUi();
    return;
  }
  ui.setBoot('Creating expedition', 92);
  await launchGame(null, seed);
});

// The legacy standalone PvP arena is no longer exposed from the title screen.
// Fracture and Lost Territory access now begins inside the overworld.

// Browser-only visual regression entry point. It is tree-shaken from production
// builds and lets CI/screenshot tooling exercise the real Game + WebGL2 renderer
// without needing an auth server or mutating a player's cloud save.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('render-test')) {
  void loading.then(() => launchGame(null, 0x5eeda11, false));
}

// Backend-free renderer harness (dev only, tree-shaken from production): renders
// a locally generated region so terrain/prop art can be reviewed without an
// account. `?visual-harness` or `?visual-harness=rx,ry` to pick a region.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('visual-harness')) {
  const raw = new URLSearchParams(location.search).get('visual-harness') ?? '';
  const [rx, ry] = raw.split(',').map((n) => Number.parseInt(n, 10));
  void import('./devVisualHarness').then((m) =>
    m.startVisualHarness(Number.isFinite(rx) ? rx : 0, Number.isFinite(ry) ? ry : 0),
  );
}

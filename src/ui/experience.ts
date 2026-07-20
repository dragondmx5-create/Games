import { setPanelOpen } from '../tween';
import type { AudioManager } from '../audio';
import { getGraphicsQuality, setGraphicsQuality, type GraphicsQuality } from '../rendering/quality/QualityManager';
import { iconSvg } from './gameIcons';
import { hydrateLucide } from './lucideIcons';
import autoAnimate from '@formkit/auto-animate';

interface UiPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
  compactHud: boolean;
  hudScale: number;
  grain: boolean;
}

interface LandPreview {
  title: string;
  tag: string;
  copy: string;
  accent: string;
  accentRgb: string;
  secondary: string;
}

const STORAGE_KEY = 'undral-ui-preferences-v2';
const LAND_PREVIEWS: Record<string, LandPreview> = {
  witchlands: {
    title: 'The Witchlands',
    tag: 'VEIL / MIASMA',
    copy: 'A drowned frontier of crooked towers, witch-lights and roads that move after dusk.',
    accent: '#b28be1',
    accentRgb: '178, 139, 225',
    secondary: '#84d8bd',
  },
  green: {
    title: 'Green Land',
    tag: 'GROVE / KINGDOM',
    copy: 'Old roads cut through living valleys where fortress towns bargain with the forest.',
    accent: '#91c96e',
    accentRgb: '145, 201, 110',
    secondary: '#e0c46f',
  },
  rainforest: {
    title: 'Rainforest',
    tag: 'MONSOON / RUINS',
    copy: 'A vertical wilderness of flooded temples, luminous canopies and predators below the rain.',
    accent: '#54c8a2',
    accentRgb: '84, 200, 162',
    secondary: '#78b8df',
  },
  frost: {
    title: 'Frostlands',
    tag: 'WHITEOUT / RELICS',
    copy: 'Glacial roads, buried halls and blue fires mark a land where warmth is a resource.',
    accent: '#8fcceb',
    accentRgb: '143, 204, 235',
    secondary: '#c0a7ee',
  },
  desert: {
    title: 'Sunscorched Desert',
    tag: 'DUNE / MIRAGE',
    copy: 'Caravan citadels rise between glass dunes, solar tombs and storms that erase the map.',
    accent: '#e4b665',
    accentRgb: '228, 182, 101',
    secondary: '#e77b62',
  },
  cinder: {
    title: 'Cinder Coast',
    tag: 'ASH / TIDE',
    copy: 'Black beaches and furnace ports face a burning sea threaded with smuggler routes.',
    accent: '#e17563',
    accentRgb: '225, 117, 99',
    secondary: '#d8aa68',
  },
};

const systemReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function defaults(): UiPreferences {
  return {
    reducedMotion: systemReducedMotion(),
    highContrast: false,
    compactHud: false,
    hudScale: 100,
    grain: true,
  };
}

function loadPreferences(): UiPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : systemReducedMotion(),
      highContrast: parsed.highContrast === true,
      compactHud: parsed.compactHud === true,
      hudScale: typeof parsed.hudScale === 'number' ? Math.max(82, Math.min(118, parsed.hudScale)) : 100,
      grain: parsed.grain !== false,
    };
  } catch {
    return defaults();
  }
}

function savePreferences(preferences: UiPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Presentation preferences are non-critical; private browsing may block storage.
  }
}

function seedRuneField(): void {
  const field = document.getElementById('rune-field');
  if (!field || field.childElementCount > 0) return;
  const glyphs = ['◇', 'ᚨ', 'ᛏ', 'ᚱ', 'ᛇ', '✦', '⌁', 'ᚾ'];
  let seed = 0x5eeda11;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let index = 0; index < 28; index++) {
    const rune = document.createElement('span');
    rune.textContent = glyphs[index % glyphs.length];
    rune.style.setProperty('--x', `${Math.round(random() * 100)}%`);
    rune.style.setProperty('--y', `${Math.round(random() * 100)}%`);
    rune.style.setProperty('--size', `${8 + Math.round(random() * 15)}px`);
    rune.style.setProperty('--delay', `${(-random() * 18).toFixed(2)}s`);
    rune.style.setProperty('--duration', `${(13 + random() * 17).toFixed(2)}s`);
    rune.style.setProperty('--drift', `${Math.round(-34 + random() * 68)}px`);
    field.appendChild(rune);
  }
}

function bindTitleParallax(): void {
  const title = document.getElementById('title');
  if (!title) return;
  let frame = 0;
  title.addEventListener('pointermove', (event) => {
    if (title.closest('[data-motion="reduced"]')) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rect = title.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      title.style.setProperty('--pointer-x', `${(x * 100).toFixed(2)}%`);
      title.style.setProperty('--pointer-y', `${(y * 100).toFixed(2)}%`);
      title.style.setProperty('--tilt-x', `${((0.5 - y) * 4).toFixed(2)}deg`);
      title.style.setProperty('--tilt-y', `${((x - 0.5) * 5).toFixed(2)}deg`);
    });
  });
  title.addEventListener('pointerleave', () => {
    title.style.setProperty('--pointer-x', '50%');
    title.style.setProperty('--pointer-y', '50%');
    title.style.setProperty('--tilt-x', '0deg');
    title.style.setProperty('--tilt-y', '0deg');
  });
}

function bindLandPreviews(): void {
  const title = document.getElementById('title');
  const titleLabel = document.getElementById('land-preview-title');
  const tag = document.getElementById('land-preview-tag');
  const copy = document.getElementById('land-preview-copy');
  if (!title || !titleLabel || !tag || !copy) return;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-land]'));

  const select = (key: string, button: HTMLButtonElement): void => {
    const preview = LAND_PREVIEWS[key];
    if (!preview) return;
    buttons.forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    title.dataset.landTheme = key;
    title.style.setProperty('--realm-accent', preview.accent);
    title.style.setProperty('--realm-accent-rgb', preview.accentRgb);
    title.style.setProperty('--realm-secondary', preview.secondary);
    titleLabel.textContent = preview.title;
    tag.textContent = preview.tag;
    copy.textContent = preview.copy;
  };

  buttons.forEach((button) => button.addEventListener('click', () => select(button.dataset.land ?? '', button)));
  const initial = buttons.find((button) => button.classList.contains('active')) ?? buttons[0];
  if (initial) select(initial.dataset.land ?? 'witchlands', initial);
}

function bindRuntimeMirrors(): void {
  const walletButton = document.getElementById('resource-inventory-btn') as HTMLButtonElement | null;
  const inventoryButton = document.getElementById('inv-corner-btn') as HTMLButtonElement | null;
  walletButton?.addEventListener('click', () => inventoryButton?.click());

  const weapon = document.getElementById('weapon-label');
  const hotbarWeapon = document.getElementById('hotbar-weapon');
  if (weapon && hotbarWeapon) {
    const update = () => {
      const label = (weapon.textContent ?? 'Unarmed').split(' — ')[0].replace(' [Q]', '').trim();
      hotbarWeapon.textContent = label || 'Unarmed';
    };
    new MutationObserver(update).observe(weapon, { childList: true, characterData: true, subtree: true });
    update();
  }
}

function updateToggle(button: HTMLButtonElement, enabled: boolean): void {
  button.setAttribute('aria-pressed', String(enabled));
  button.classList.toggle('is-on', enabled);
  const label = button.querySelector('span');
  if (label) label.textContent = enabled ? 'On' : 'Off';
}

function bindInterfaceSettings(): void {
  const wrap = document.getElementById('wrap');
  const panel = document.getElementById('interface-panel');
  const openButton = document.getElementById('interface-btn') as HTMLButtonElement | null;
  const closeButton = document.getElementById('interface-close') as HTMLButtonElement | null;
  const motionButton = document.getElementById('motion-toggle') as HTMLButtonElement | null;
  const contrastButton = document.getElementById('contrast-toggle') as HTMLButtonElement | null;
  const compactButton = document.getElementById('compact-toggle') as HTMLButtonElement | null;
  const grainButton = document.getElementById('grain-toggle') as HTMLButtonElement | null;
  const scaleInput = document.getElementById('hud-scale') as HTMLInputElement | null;
  const scaleOutput = document.getElementById('hud-scale-output') as HTMLOutputElement | null;
  const resetButton = document.getElementById('interface-reset') as HTMLButtonElement | null;
  if (!wrap || !panel || !openButton || !closeButton || !motionButton || !contrastButton || !compactButton || !grainButton || !scaleInput || !scaleOutput || !resetButton) return;

  let preferences = loadPreferences();

  const apply = (): void => {
    wrap.dataset.motion = preferences.reducedMotion ? 'reduced' : 'full';
    wrap.dataset.contrast = preferences.highContrast ? 'high' : 'standard';
    wrap.dataset.hud = preferences.compactHud ? 'compact' : 'expanded';
    wrap.dataset.grain = preferences.grain ? 'on' : 'off';
    document.body.dataset.grain = preferences.grain ? 'on' : 'off';
    wrap.style.setProperty('--hud-scale', String(preferences.hudScale / 100));
    updateToggle(motionButton, preferences.reducedMotion);
    updateToggle(contrastButton, preferences.highContrast);
    updateToggle(compactButton, preferences.compactHud);
    updateToggle(grainButton, preferences.grain);
    scaleInput.value = String(preferences.hudScale);
    scaleOutput.value = `${preferences.hudScale}%`;
    savePreferences(preferences);
  };

  const closeAnyOpenPanel = (): void => {
    const openPanel = Array.from(document.querySelectorAll<HTMLElement>('.game-panel')).find((candidate) => candidate !== panel && !candidate.classList.contains('hidden'));
    openPanel?.querySelector<HTMLButtonElement>('.close-button')?.click();
  };

  openButton.addEventListener('click', () => {
    closeAnyOpenPanel();
    setPanelOpen(panel, true, 'hidden', false);
    openButton.classList.add('active');
  });
  closeButton.addEventListener('click', () => {
    setPanelOpen(panel, false, 'hidden', false);
    openButton.classList.remove('active');
  });

  motionButton.addEventListener('click', () => {
    preferences.reducedMotion = !preferences.reducedMotion;
    apply();
  });
  contrastButton.addEventListener('click', () => {
    preferences.highContrast = !preferences.highContrast;
    apply();
  });
  compactButton.addEventListener('click', () => {
    preferences.compactHud = !preferences.compactHud;
    apply();
  });
  grainButton.addEventListener('click', () => {
    preferences.grain = !preferences.grain;
    apply();
  });
  scaleInput.addEventListener('input', () => {
    preferences.hudScale = Number(scaleInput.value);
    apply();
  });
  resetButton.addEventListener('click', () => {
    preferences = defaults();
    apply();
  });

  apply();
}

function bindAudioSettings(audio: AudioManager): void {
  const volumeRange = document.getElementById('volume-range') as HTMLInputElement | null;
  const volumeOutput = document.getElementById('volume-output') as HTMLOutputElement | null;
  const muteToggle = document.getElementById('mute-toggle') as HTMLButtonElement | null;
  if (!volumeRange || !volumeOutput || !muteToggle) return;

  const syncFromAudio = (): void => {
    const pct = Math.round(audio.masterVolume * 100);
    volumeRange.value = String(pct);
    volumeOutput.value = `${pct}%`;
    updateToggle(muteToggle, audio.isMuted);
  };

  volumeRange.addEventListener('input', () => {
    audio.setVolume(Number(volumeRange.value) / 100);
    volumeOutput.value = `${volumeRange.value}%`;
  });
  muteToggle.addEventListener('click', () => {
    audio.setMuted(!audio.isMuted);
    updateToggle(muteToggle, audio.isMuted);
    // keep the always-visible corner mute button in step with the panel.
    window.dispatchEvent(new CustomEvent('undral:audio-sync'));
  });
  // the corner mute button and this toggle share one state — re-sync on change.
  window.addEventListener('undral:audio-sync', syncFromAudio);

  syncFromAudio();
}

function bindGraphicsSettings(): void {
  const group = document.getElementById('quality-segmented');
  if (!group) return;
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>('button[data-quality]'));

  const sync = (): void => {
    const current = getGraphicsQuality();
    buttons.forEach((button) => button.classList.toggle('is-active', button.dataset.quality === current));
  };
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      setGraphicsQuality((button.dataset.quality as GraphicsQuality) ?? 'auto');
      sync();
      // let the corner graphics badge refresh its letter.
      window.dispatchEvent(new CustomEvent('undral:graphics-sync'));
    }),
  );
  window.addEventListener('undral:graphics-sync', sync);
  sync();
}

/** Swap the flat line-icons in the utility dock for richer game-icons glyphs. */
function applyGraphicalIcons(): void {
  const map: Array<[string, string]> = [
    ['journal-corner-btn', 'book'],
    ['inv-corner-btn', 'backpack'],
    ['map-corner-btn', 'map'],
    ['interface-btn', 'gear'],
  ];
  for (const [id, icon] of map) {
    const button = document.getElementById(id);
    if (button) button.innerHTML = iconSvg(icon, 22);
  }
}

/** Smooth add/remove/reorder transitions for the dynamic UI lists. */
function animateDynamicLists(): void {
  for (const id of ['inv-list', 'quest-list', 'resource-feed', 'sp-list', 'world-map-grid']) {
    const el = document.getElementById(id);
    if (el) autoAnimate(el, { duration: 180 });
  }
}

export function initInterfaceExperience(audio?: AudioManager): void {
  applyGraphicalIcons();
  hydrateLucide();
  animateDynamicLists();
  seedRuneField();
  bindTitleParallax();
  bindLandPreviews();
  bindRuntimeMirrors();
  bindInterfaceSettings();
  if (audio) bindAudioSettings(audio);
  bindGraphicsSettings();
}

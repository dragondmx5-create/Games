import type { AuthUser } from '../api';
import type { ConnectionState, RuntimeDetail, RuntimeResources, SaveState, ToastDetail } from './events';

const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required UI element #${id}`);
  return element as T;
};

function setDot(dot: HTMLElement, state: ConnectionState): void {
  dot.classList.remove('is-online', 'is-offline', 'is-pending');
  dot.classList.add(state === 'online' ? 'is-online' : state === 'offline' ? 'is-offline' : 'is-pending');
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export class UiShell {
  private readonly wrap = $('wrap');
  private readonly title = $('title');
  private readonly bootState = $('boot-state');
  private readonly bootStage = $('boot-stage');
  private readonly bootPercent = $('boot-percent');
  private readonly bootProgress = $('boot-progress');
  private readonly startLabel = $('start-label');
  private readonly serverDot = $('server-dot');
  private readonly serverLabel = $('server-label');
  private readonly titleServerDot = $('title-server-dot');
  private readonly titleServerLabel = $('title-server-label');
  private readonly saveLabel = $('save-state');
  private readonly scrim = $('panel-scrim');
  private readonly toastRegion = $('toast-region');
  private readonly compassLocation = $('compass-location');
  private readonly compassRisk = $('compass-risk');
  private readonly hitFlash = $('hit-flash');
  private previousHpPercent = 100;
  private hitFlashTimer = 0;
  private modalObserver: MutationObserver | null = null;
  private previousResources: Partial<RuntimeResources> = {};
  private resourceFeedTimer = 0;

  constructor() {
    this.bindTitleTabs();
    this.bindJournalTabs();
    this.bindPanelCoordinator();
    this.bindGlobalEvents();
    this.bindNetworkEvents();
    this.setRuntimeMode('menu');
  }

  setBoot(stage: string, percent: number): void {
    const value = Math.round(clampPercent(percent));
    this.bootStage.textContent = stage;
    this.bootPercent.textContent = `${value}%`;
    this.bootProgress.style.width = `${value}%`;
    this.bootState.classList.toggle('is-complete', value >= 100);
  }

  setStartLabel(label: string): void {
    this.startLabel.textContent = label;
  }

  setServerStatus(state: ConnectionState, label: string): void {
    setDot(this.serverDot, state);
    setDot(this.titleServerDot, state);
    this.serverLabel.textContent = label;
    this.titleServerLabel.textContent = label;
  }

  setSaveStatus(state: SaveState, label?: string): void {
    const fallback: Record<SaveState, string> = {
      idle: 'Cloud idle',
      saving: 'Saving…',
      saved: 'Cloud saved',
      error: 'Save failed',
    };
    this.saveLabel.textContent = label ?? fallback[state];
    this.saveLabel.dataset.state = state;
  }

  setUser(user: AuthUser | null): void {
    const accountButton = $('account-btn');
    accountButton.textContent = user ? user.username : 'Account';
    accountButton.setAttribute('aria-label', user ? `Account: ${user.username}` : 'Open account panel');
  }

  setRuntimeMode(mode: 'menu' | 'game'): void {
    this.wrap.dataset.runtime = mode;
    this.title.classList.toggle('hidden', mode === 'game');
  }

  showFatal(message: string): void {
    this.setRuntimeMode('menu');
    this.setBoot('Startup interrupted', 0);
    this.setStartLabel('Retry');
    this.showToast({ title: 'Unable to enter the realm', message, tone: 'error', durationMs: 12_000 });
  }

  showToast(detail: ToastDetail): void {
    const toast = document.createElement('article');
    toast.className = `toast ${detail.tone ?? 'neutral'}`;
    toast.innerHTML = `
      <div><strong></strong><p></p></div>
      <button type="button" aria-label="Dismiss notification">×</button>
    `;
    toast.querySelector('strong')!.textContent = detail.title;
    const message = toast.querySelector('p')!;
    message.textContent = detail.message ?? '';
    if (!detail.message) message.remove();

    const dismiss = () => {
      if (toast.classList.contains('is-leaving')) return;
      toast.classList.add('is-leaving');
      window.setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector('button')!.addEventListener('click', dismiss);
    this.toastRegion.appendChild(toast);
    window.setTimeout(dismiss, detail.durationMs ?? 5_200);
  }

  private bindTitleTabs(): void {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-title-tab]'));
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.titleTab!;
        buttons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        for (const panelName of ['briefing', 'systems', 'controls']) {
          $(`title-panel-${panelName}`).classList.toggle('hidden', panelName !== name);
        }
      });
    });
  }

  private bindJournalTabs(): void {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-journal-tab]'));
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const name = button.dataset.journalTab!;
        buttons.forEach((candidate) => candidate.classList.toggle('active', candidate === button));
        for (const pageName of ['story', 'daily', 'systems']) {
          $(`journal-${pageName}`).classList.toggle('hidden', pageName !== name);
        }
      });
    });
  }

  private bindPanelCoordinator(): void {
    const panels = Array.from(document.querySelectorAll<HTMLElement>('.game-panel'));
    const refreshScrim = () => {
      const openPanel = panels.find((panel) => !panel.classList.contains('hidden'));
      this.scrim.classList.toggle('hidden', !openPanel);
      this.scrim.setAttribute('aria-hidden', String(!openPanel));
    };
    this.modalObserver = new MutationObserver(refreshScrim);
    panels.forEach((panel) => this.modalObserver!.observe(panel, { attributes: true, attributeFilter: ['class'] }));
    this.scrim.addEventListener('click', () => {
      const openPanel = panels.find((panel) => !panel.classList.contains('hidden'));
      if (!openPanel) return;
      const closeButton = openPanel.querySelector<HTMLButtonElement>('.close-button');
      closeButton?.click();
    });

    document.addEventListener('keydown', (event) => {
      if (event.code !== 'Escape') return;
      const openPanel = panels.find((panel) => !panel.classList.contains('hidden'));
      if (!openPanel) return;
      event.preventDefault();
      const closeButton = openPanel.querySelector<HTMLButtonElement>('.close-button');
      closeButton?.click();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const panel = panels.find((candidate) => !candidate.classList.contains('hidden'));
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  private bindGlobalEvents(): void {
    window.addEventListener('undral:toast', (event) => this.showToast((event as CustomEvent<ToastDetail>).detail));
    window.addEventListener('undral:connection', (event) => {
      const { state, label } = (event as CustomEvent<{ state: ConnectionState; label?: string }>).detail;
      this.setServerStatus(state, label ?? (state === 'online' ? 'Realm online' : state === 'offline' ? 'Realm unavailable' : 'Reconnecting'));
    });
    window.addEventListener('undral:save-state', (event) => {
      const { state, label } = (event as CustomEvent<{ state: SaveState; label?: string }>).detail;
      this.setSaveStatus(state, label);
    });
    window.addEventListener('undral:runtime', (event) => this.applyRuntime((event as CustomEvent<RuntimeDetail>).detail));
  }

  private bindNetworkEvents(): void {
    window.addEventListener('offline', () => this.setServerStatus('offline', 'Browser offline'));
    window.addEventListener('online', () => this.setServerStatus('pending', 'Network restored'));
  }

  private applyRuntime(detail: RuntimeDetail): void {
    if (detail.mode) this.setRuntimeMode(detail.mode);
    if (detail.location) {
      $('depth').textContent = detail.location;
      this.compassLocation.textContent = detail.location;
    }
    if (detail.risk) {
      $('risk-indicator').textContent = detail.risk;
      this.compassRisk.textContent = detail.risk;
      const normalizedRisk = detail.risk.toLowerCase();
      this.wrap.dataset.risk = normalizedRisk.includes('lost')
        ? 'lost'
        : normalizedRisk.includes('fracture')
          ? 'fracture'
          : normalizedRisk.includes('frontier')
            ? 'frontier'
            : normalizedRisk.includes('sanctuary')
              ? 'sanctuary'
              : 'unknown';
    }
    if (detail.inventoryRevision !== undefined) {
      $('inventory-revision').textContent = `REV ${detail.inventoryRevision}`;
      $('wallet-revision').textContent = `REV ${detail.inventoryRevision}`;
    }
    if (detail.hpPercent !== undefined) {
      const hp = clampPercent(detail.hpPercent);
      $('hp-text').textContent = `${Math.round(hp)}%`;
      $('hp-fill').style.width = `${hp}%`;
      this.wrap.style.setProperty('--hp-level', String(hp / 100));
      this.wrap.dataset.health = hp <= 25 ? 'critical' : hp <= 55 ? 'wounded' : 'stable';
      if (hp < this.previousHpPercent - 0.4) {
        window.clearTimeout(this.hitFlashTimer);
        this.hitFlash.classList.remove('is-hit');
        void this.hitFlash.offsetWidth;
        this.hitFlash.classList.add('is-hit');
        this.hitFlashTimer = window.setTimeout(() => this.hitFlash.classList.remove('is-hit'), 420);
      }
      this.previousHpPercent = hp;
    }
    if (detail.hpCurrent !== undefined && detail.hpMax !== undefined) {
      $('hp-text').textContent = `${Math.max(0, Math.ceil(detail.hpCurrent))} / ${Math.max(1, Math.ceil(detail.hpMax))}`;
    }
    if (detail.xpPercent !== undefined) {
      const xp = clampPercent(detail.xpPercent);
      $('xp-fill').style.width = `${xp}%`;
    }
    if (detail.xpCurrent !== undefined && detail.xpTarget !== undefined) {
      $('xp-text').textContent = `${Math.max(0, Math.floor(detail.xpCurrent))} / ${Math.max(1, Math.floor(detail.xpTarget))}`;
    }
    if (detail.level !== undefined) $('level-value').textContent = String(Math.max(1, Math.floor(detail.level)));
    if (detail.hpPercent !== undefined) {
      const hp = clampPercent(detail.hpPercent);
      $('condition-text').textContent = hp <= 25 ? 'CRITICAL' : hp <= 55 ? 'WOUNDED' : 'READY';
    }
    if (detail.abilityName) $('hotbar-ability-label').textContent = detail.abilityName;
    if (detail.abilityCooldownPercent !== undefined) {
      const cooldown = clampPercent(detail.abilityCooldownPercent);
      const slot = $('hotbar-ability-slot');
      const charge = $('hotbar-ability-charge');
      slot.classList.toggle('is-cooling', cooldown > 0.5);
      charge.style.setProperty('--cooldown', `${cooldown}%`);
      $('hotbar-ability-time').textContent = cooldown > 0.5
        ? `${Math.max(0.1, detail.abilityCooldownSeconds ?? 0).toFixed(1)}s`
        : 'READY';
    }
    if (detail.resources) this.applyResources(detail.resources);
  }

  private applyResources(resources: RuntimeResources): void {
    // The field wallet no longer surfaces Crystals (the Gold Crowns card already
    // denominates canonical crystal value) or Shrooms; those tiles were removed.
    const entries: Array<[keyof RuntimeResources, string]> = [
      ['coins', 'resource-coins'],
      ['wood', 'resource-wood'],
      ['iron', 'resource-iron'],
      ['meat', 'resource-meat'],
      ['hide', 'resource-hide'],
      ['feathers', 'resource-feathers'],
      ['crates', 'resource-crates'],
    ];
    const format = (value: number) => Math.max(0, Math.floor(value)).toLocaleString('en-US');

    let changed = false;
    for (const [key, id] of entries) {
      const element = $(id);
      const value = Math.max(0, Math.floor(resources[key]));
      const previous = this.previousResources[key];
      if (previous === value) continue;
      changed = true;
      element.textContent = format(value);
      if (previous !== undefined) {
        const delta = value - previous;
        const host = element.closest<HTMLElement>('.wallet-resource, .crown-balance');
        if (host) {
          host.classList.remove('is-gain', 'is-loss');
          void host.offsetWidth;
          host.classList.add(delta > 0 ? 'is-gain' : 'is-loss');
          host.dataset.delta = `${delta > 0 ? '+' : ''}${delta}`;
          window.setTimeout(() => {
            host.classList.remove('is-gain', 'is-loss');
            delete host.dataset.delta;
          }, 760);
        }
        if (key !== 'coins' && delta !== 0) this.pushResourceFeed(key, delta);
      }
      this.previousResources[key] = value;
    }
    if (!changed) return;

    $('merchant-coins').textContent = format(resources.coins);
    $('merchant-crystals').textContent = format(resources.crystals);
    $('inventory-coins').textContent = format(resources.coins);
    $('inventory-wood').textContent = format(resources.wood);
    $('inventory-iron').textContent = format(resources.iron);
    $('inventory-provisions').textContent = format(resources.shrooms + resources.meat);
    const craftingTotal = resources.wood + resources.iron + resources.hide + resources.feathers;
    const provisionTotal = resources.shrooms + resources.meat;
    const totalLoad = craftingTotal + provisionTotal + resources.crates;
    $('inventory-crafting').textContent = format(craftingTotal);
    $('resource-total').textContent = format(totalLoad);
    $('loot').textContent = `${format(totalLoad)} carried · ${format(provisionTotal)} provisions · ${format(resources.coins)} crowns`;
  }

  private pushResourceFeed(key: keyof RuntimeResources, delta: number): void {
    const labels: Record<keyof RuntimeResources, string> = {
      coins: 'Crowns', crystals: 'Crystals', shrooms: 'Shrooms', wood: 'Wood', iron: 'Iron',
      meat: 'Meat', hide: 'Hide', feathers: 'Feathers', crates: 'Crates',
    };
    const feed = $('resource-feed');
    window.clearTimeout(this.resourceFeedTimer);
    feed.innerHTML = `<span class="feed-icon">${delta > 0 ? '↗' : '↘'}</span><span><strong>${delta > 0 ? 'SUPPLY ACQUIRED' : 'SUPPLY SPENT'}</strong><small>${delta > 0 ? '+' : ''}${delta} ${labels[key]}</small></span>`;
    feed.classList.remove('is-gain', 'is-loss');
    void feed.offsetWidth;
    feed.classList.add(delta > 0 ? 'is-gain' : 'is-loss');
    this.resourceFeedTimer = window.setTimeout(() => {
      feed.classList.remove('is-gain', 'is-loss');
      feed.innerHTML = '<span class="feed-idle">Ledger synchronized</span>';
    }, 2600);
  }
}

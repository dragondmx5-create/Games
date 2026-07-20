// Mobile touch controls: floating virtual joystick on the left half,
// attack / interact / weapon-switch buttons bottom-right.
// Inactive (no DOM, no cost) on devices without a touchscreen.

const STICK_RANGE = 40; // px of thumb travel for full deflection
const DEADZONE = 0.22;
const RUN_THRESHOLD = 0.85;

export class TouchControls {
  readonly active: boolean;
  moveX = 0;
  moveY = 0;
  running = false;
  attackHeld = false;
  private interactQ = false;
  private switchQ = false;
  private abilityQ = false;
  private stickId: number | null = null;
  private cx = 0;
  private cy = 0;
  private base!: HTMLElement;
  private nub!: HTMLElement;
  private abilityBtn: HTMLElement | null = null;
  private ui: HTMLElement | null = null;
  private gameplayEnabled = true;
  private attackPointerId: number | null = null;
  private readonly onWindowBlur = (): void => this.resetInput();
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.resetInput();
  };
  private readonly onPageHide = (): void => this.resetInput();

  constructor() {
    this.active = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;
    if (!this.active) return;
    document.body.classList.add('touch');
    this.build();
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('pagehide', this.onPageHide);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  consumeInteract(): boolean {
    const v = this.interactQ;
    this.interactQ = false;
    return v;
  }

  consumeSwitch(): boolean {
    const v = this.switchQ;
    this.switchQ = false;
    return v;
  }

  consumeAbility(): boolean {
    const v = this.abilityQ;
    this.abilityQ = false;
    return v;
  }

  setGameplayEnabled(enabled: boolean): void {
    if (this.gameplayEnabled === enabled) return;
    this.gameplayEnabled = enabled;
    this.ui?.classList.toggle('touch-disabled', !enabled);
    if (!enabled) this.resetInput();
  }

  dispose(): void {
    if (!this.active) return;
    this.resetInput();
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('pagehide', this.onPageHide);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.ui?.remove();
    this.ui = null;
  }

  private resetInput(): void {
    this.stickId = null;
    this.attackPointerId = null;
    this.moveX = 0;
    this.moveY = 0;
    this.running = false;
    this.attackHeld = false;
    this.interactQ = false;
    this.switchQ = false;
    this.abilityQ = false;
    if (this.base) this.base.style.display = 'none';
    if (this.nub) this.nub.style.display = 'none';
  }

  setAbilityCooldown(onCooldown: boolean): void {
    this.abilityBtn?.classList.toggle('on-cooldown', onCooldown);
  }

  private build(): void {
    const ui = document.createElement('div');
    ui.id = 'touch-ui';
    this.ui = ui;

    // ---- floating joystick (left half of the screen) ----
    const zone = document.createElement('div');
    zone.id = 'stick-zone';
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.nub = document.createElement('div');
    this.nub.className = 'stick-nub';
    zone.append(this.base, this.nub);

    zone.addEventListener('pointerdown', (e) => {
      if (!this.gameplayEnabled || this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const bounds = zone.getBoundingClientRect();
      this.cx = Math.max(bounds.left + STICK_RANGE, Math.min(bounds.right - STICK_RANGE, e.clientX));
      this.cy = Math.max(bounds.top + STICK_RANGE, Math.min(bounds.bottom - STICK_RANGE, e.clientY));
      this.showStick(this.cx, this.cy, this.cx, this.cy);
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this.gameplayEnabled || e.pointerId !== this.stickId) return;
      e.preventDefault();
      let dx = (e.clientX - this.cx) / STICK_RANGE;
      let dy = (e.clientY - this.cy) / STICK_RANGE;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      const mag = Math.min(1, len);
      if (mag < DEADZONE) {
        this.moveX = 0;
        this.moveY = 0;
        this.running = false;
      } else {
        this.moveX = dx;
        this.moveY = dy;
        this.running = mag > RUN_THRESHOLD;
      }
      this.showStick(this.cx, this.cy, this.cx + dx * STICK_RANGE, this.cy + dy * STICK_RANGE);
    });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.running = false;
      this.base.style.display = 'none';
      this.nub.style.display = 'none';
    };
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);

    // ---- buttons ----
    const btns = document.createElement('div');
    btns.id = 'touch-btns';
    const mk = (label: string, cls: string, ariaLabel: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbtn ' + cls;
      b.textContent = label;
      b.setAttribute('aria-label', ariaLabel);
      btns.appendChild(b);
      return b;
    };
    const qBtn = mk('Q', 'tbtn-small', 'Switch weapon');
    const eBtn = mk('E', 'tbtn-small', 'Interact');
    const abilityBtn = mk('F', 'tbtn-ability', 'Use weapon ability');
    this.abilityBtn = abilityBtn;
    const atkBtn = mk('ATK', 'tbtn-big', 'Attack');

    atkBtn.addEventListener('pointerdown', (e) => {
      if (!this.gameplayEnabled || this.attackPointerId !== null) return;
      e.preventDefault();
      this.attackPointerId = e.pointerId;
      atkBtn.setPointerCapture(e.pointerId);
      this.attackHeld = true;
    });
    const endAttack = (e: PointerEvent): void => {
      if (e.pointerId !== this.attackPointerId) return;
      this.attackPointerId = null;
      this.attackHeld = false;
      if (atkBtn.hasPointerCapture(e.pointerId)) atkBtn.releasePointerCapture(e.pointerId);
    };
    atkBtn.addEventListener('pointerup', endAttack);
    atkBtn.addEventListener('pointercancel', endAttack);
    atkBtn.addEventListener('lostpointercapture', endAttack);
    eBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.gameplayEnabled) this.interactQ = true;
    });
    qBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.gameplayEnabled) this.switchQ = true;
    });
    abilityBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.gameplayEnabled) this.abilityQ = true;
    });

    ui.append(zone, btns);
    document.getElementById('wrap')!.appendChild(ui);
  }

  private showStick(bx: number, by: number, nx: number, ny: number): void {
    this.base.style.display = 'block';
    this.nub.style.display = 'block';
    this.base.style.left = `${bx}px`;
    this.base.style.top = `${by}px`;
    this.nub.style.left = `${nx}px`;
    this.nub.style.top = `${ny}px`;
  }
}

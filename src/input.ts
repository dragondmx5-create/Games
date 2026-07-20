export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private disposed = false;
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => { this.down.delete(e.code); };
  private readonly onBlur = (): void => { this.down.clear(); this.pressed.clear(); };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.onBlur();
  }

  held(code: string): boolean { return this.down.has(code); }
  justPressed(code: string): boolean { return this.pressed.has(code); }
  endFrame(): void { this.pressed.clear(); }
  get moveX(): number {
    return (this.held('KeyD') || this.held('ArrowRight') ? 1 : 0) - (this.held('KeyA') || this.held('ArrowLeft') ? 1 : 0);
  }
  get moveY(): number {
    return (this.held('KeyS') || this.held('ArrowDown') ? 1 : 0) - (this.held('KeyW') || this.held('ArrowUp') ? 1 : 0);
  }
}

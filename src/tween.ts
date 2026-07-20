// Shared DOM/UI animation helpers. Scoped to DOM-level polish (panels,
// future HUD tweens) — the game loop's own dt-driven animation state
// (swing trails, walk cycles, screen shake, hit flash, floating text)
// stays exactly where it is and keeps advancing in update()/render().

export const EASE = {
  linear: (t: number) => t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/** Drives a value from 0 to 1 over durationMs via requestAnimationFrame. Returns a cancel fn. */
export function animate(
  durationMs: number,
  onUpdate: (t: number) => void,
  opts?: { ease?: (t: number) => number; onDone?: () => void }
): () => void {
  const ease = opts?.ease ?? EASE.linear;
  const start = performance.now();
  let raf = 0;
  let cancelled = false;
  const step = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, (now - start) / durationMs);
    onUpdate(ease(t));
    if (t < 1) {
      raf = requestAnimationFrame(step);
    } else {
      opts?.onDone?.();
    }
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

const panelGen = new WeakMap<HTMLElement, number>();

/**
 * Opens/closes a panel that's gated by a display:none-toggling class
 * (hiddenClass), fading/scaling it via a `.open` class + CSS transition
 * defined on the element (see `.panel-fade` in index.html). Handles both
 * hidden-by-default (open adds hiddenClass=false i.e. removes it) and
 * shown-by-default (open removes hiddenClass) panel polarities via the
 * `showAdds` flag: true means hiddenClass is added to SHOW the panel
 * (e.g. `#death.visible`), false means hiddenClass is added to HIDE it
 * (e.g. `#shop-panel.hidden`).
 */
export function setPanelOpen(
  el: HTMLElement,
  open: boolean,
  hiddenClass: string,
  showAdds: boolean,
  durationMs = 180
): void {
  const gen = (panelGen.get(el) ?? 0) + 1;
  panelGen.set(el, gen);

  if (open) {
    if (showAdds) el.classList.add(hiddenClass);
    else el.classList.remove(hiddenClass);
    // force layout so the next class add actually transitions instead of
    // being coalesced with the display change in the same frame
    void el.offsetWidth;
    requestAnimationFrame(() => {
      if (panelGen.get(el) !== gen) return;
      el.classList.add('open');
    });
  } else {
    el.classList.remove('open');
    setTimeout(() => {
      if (panelGen.get(el) !== gen) return;
      if (showAdds) el.classList.remove(hiddenClass);
      else el.classList.add(hiddenClass);
    }, durationMs);
  }
}

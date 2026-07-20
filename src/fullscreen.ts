import { Capacitor } from '@capacitor/core';

// Fullscreen + orientation helpers for mobile.
//
// Several ways this can legitimately not work, handled differently:
// 1. The browser has no element Fullscreen API at all (iOS Safari) — the
//    button hides itself, since nothing we do here will change that.
// 2. The page is embedded in an iframe whose `allow` attribute doesn't
//    include "fullscreen" (common for embedded viewers, including how a
//    published Artifact is likely shown) — the API exists but every call
//    is rejected outright by the Permissions Policy.
// 3. The API exists, isn't blocked by policy, and the promise even
//    resolves — but nothing visibly happens anyway. This shows up inside
//    native-app WebViews (e.g. a mobile app's in-app browser) whose host
//    app never wired up the native fullscreen callback the OS requires;
//    the web page has no way to detect that in advance, only after trying.
//
// For (2) and (3) there's no permission we can grant ourselves from in
// here — the fix is a top-level tab, which isn't subject to either
// restriction. So: attempt real fullscreen, then verify it actually took
// effect; if not, fall back to opening a new tab instead of failing silently.

type FSDoc = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void>;
};
type FSElem = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

function isFullscreen(): boolean {
  const d = document as FSDoc;
  return !!(document.fullscreenElement ?? d.webkitFullscreenElement);
}

/** tries real fullscreen and reports whether it actually took effect, not just whether the promise resolved */
async function tryEnter(el: HTMLElement): Promise<boolean> {
  const e = el as FSElem;
  try {
    if (e.requestFullscreen) await e.requestFullscreen();
    else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
    else return false;
  } catch {
    return false; // rejected — blocked by Permissions Policy or no user-gesture credit
  }
  // some WebViews resolve the promise without ever actually going fullscreen
  await new Promise((r) => setTimeout(r, 50));
  if (!isFullscreen()) return false;
  try {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    // orientation lock is best-effort — unsupported on iOS and outside fullscreen on some Android browsers
  }
  return true;
}

async function exit(): Promise<void> {
  const d = document as FSDoc;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
  } catch {
    // ignore
  }
}

function openInNewTab(): void {
  window.open(window.location.href, '_blank', 'noopener,noreferrer');
}

/** the Fullscreen API exists on this element */
function hasFullscreenMethod(): boolean {
  const e = document.documentElement as FSElem;
  return !!(e.requestFullscreen || e.webkitRequestFullscreen);
}

/** the method exists AND the Permissions Policy actually allows using it here (necessary but not sufficient — see tryEnter) */
export function supportsFullscreen(): boolean {
  return hasFullscreenMethod() && document.fullscreenEnabled !== false;
}

export function toggleFullscreen(el: HTMLElement): void {
  if (Capacitor.isNativePlatform()) return;
  if (isFullscreen()) void exit();
  else void tryEnter(el);
}

/** Best-effort fullscreen request meant to run inside a touch-tap handler, before any await. */
export function requestFullscreenFromGesture(el: HTMLElement): void {
  if (Capacitor.isNativePlatform()) return;
  if (supportsFullscreen() && !isFullscreen()) void tryEnter(el);
}

function switchButtonToNewTabMode(btn: HTMLElement): void {
  // different icon on purpose: mobile taps don't show the tooltip, so the
  // glyph itself has to signal "this opens a tab", not "this goes fullscreen"
  btn.textContent = '↗';
  btn.title = 'Open in a new tab for fullscreen';
}

export function initFullscreenButton(btn: HTMLElement, target: HTMLElement): void {
  if (Capacitor.isNativePlatform()) {
    btn.classList.add('hidden');
    return;
  }
  if (!hasFullscreenMethod()) {
    // no Fullscreen API at all (e.g. iOS Safari) — nothing we can offer here
    btn.classList.add('hidden');
    return;
  }
  btn.classList.remove('hidden');

  if (!supportsFullscreen()) {
    // blocked outright by Permissions Policy — go straight to the new-tab fallback
    switchButtonToNewTabMode(btn);
    btn.addEventListener('click', openInNewTab);
    return;
  }

  const onClick = async () => {
    if (isFullscreen()) {
      void exit();
      return;
    }
    const ok = await tryEnter(target);
    if (!ok) {
      // the API existed and didn't reject, but fullscreen never actually
      // engaged (e.g. a WebView with no native hook) — switch this button
      // to the reliable fallback for this tap and any future ones
      switchButtonToNewTabMode(btn);
      btn.removeEventListener('click', onClick);
      btn.addEventListener('click', openInNewTab);
      openInNewTab();
    }
  };
  btn.addEventListener('click', onClick);
  document.addEventListener('fullscreenchange', () => btn.classList.toggle('active', isFullscreen()));
  document.addEventListener('webkitfullscreenchange', () => btn.classList.toggle('active', isFullscreen()));
}

/** Shows a "rotate your device" hint while a touch device is in portrait orientation. */
export function initRotateHint(hintEl: HTMLElement, active: boolean): void {
  if (!active) return;
  const mq = window.matchMedia('(orientation: portrait)');
  const update = () => hintEl.classList.toggle('visible', mq.matches);
  update();
  mq.addEventListener('change', update);
}

import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';

/** Native-only boot adjustments. The web build remains unchanged. */
export async function initNativeRuntime(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  document.documentElement.classList.add('native-app');
  document.body.classList.add('native-app');

  const applyNativeDisplayMode = async (): Promise<void> => {
    await Promise.allSettled([
      ScreenOrientation.lock({ orientation: 'landscape' }),
      StatusBar.hide(),
    ]);
  };

  await applyNativeDisplayMode();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void applyNativeDisplayMode();
  });
}

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar } from '@capacitor/status-bar';

/** Piccolo strato sulle funzioni native: sul web diventano tutte innocue. */

const native = Capacitor.isNativePlatform();
let enabled = true;

export function setHaptics(on: boolean) {
  enabled = on;
}

export function tap(kind: 'light' | 'medium' | 'heavy' = 'light') {
  if (!native || !enabled) return;
  const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
  void Haptics.impact({ style }).catch(() => undefined);
}

export function notify(kind: 'success' | 'warning' | 'error') {
  if (!native || !enabled) return;
  const type = kind === 'success' ? NotificationType.Success : kind === 'warning' ? NotificationType.Warning : NotificationType.Error;
  void Haptics.notification({ type }).catch(() => undefined);
}

export async function initNative() {
  if (!native) return;
  try {
    await StatusBar.hide();
  } catch {
    /* ignorato */
  }
}

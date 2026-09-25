import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Progressi del giocatore. Restano solo sul dispositivo. */
export interface Save {
  version: 1;
  /** Livello più alto sbloccato. */
  unlocked: number;
  /** Stelle migliori per livello. */
  stars: Record<number, number>;
  candies: number;
  outfit: string;
  owned: string[];
  music: boolean;
  sfx: boolean;
  haptics: boolean;
}

const KEY = 'attraversa-nonna-save';

export function defaultSave(): Save {
  return {
    version: 1,
    unlocked: 1,
    stars: {},
    candies: 0,
    outfit: 'classic',
    owned: ['classic'],
    music: true,
    sfx: true,
    haptics: true,
  };
}

function parse(raw: string | null): Save {
  if (!raw) return defaultSave();
  try {
    const data = JSON.parse(raw) as Partial<Save>;
    return { ...defaultSave(), ...data, version: 1 };
  } catch {
    return defaultSave();
  }
}

// Su iOS i dati di localStorage di una WebView possono essere eliminati dal sistema:
// nell'app nativa si usano le Preferences (UserDefaults), che sono persistenti.
const native = Capacitor.isNativePlatform();

export async function loadSave(): Promise<Save> {
  if (native) {
    const { value } = await Preferences.get({ key: KEY });
    return parse(value);
  }
  try {
    return parse(localStorage.getItem(KEY));
  } catch {
    return defaultSave();
  }
}

let pending: number | null = null;

export function storeSave(save: Save) {
  // piccole raffiche di modifiche diventano una sola scrittura
  if (pending !== null) window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = null;
    const raw = JSON.stringify(save);
    if (native) void Preferences.set({ key: KEY, value: raw });
    else {
      try {
        localStorage.setItem(KEY, raw);
      } catch {
        /* archiviazione non disponibile (es. navigazione privata) */
      }
    }
  }, 150);
}

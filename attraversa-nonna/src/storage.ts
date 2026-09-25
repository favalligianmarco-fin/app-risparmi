import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { FREE_NONNE } from './nonne';

/** Progressi del giocatore. Restano solo sul dispositivo. */
export interface Save {
  version: 2;
  /** Record di distanza, in metri. */
  best: number;
  candies: number;
  /** Nonna scelta e nonne sbloccate. */
  nonna: string;
  owned: string[];
  runs: number;
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  /** I suggerimenti iniziali sono già stati mostrati. */
  tutorial: boolean;
}

// Chiave nuova: con la modalità infinita i vecchi progressi a livelli ripartono da zero.
const KEY = 'attraversa-nonna-v2';

export function defaultSave(): Save {
  return {
    version: 2,
    best: 0,
    candies: 0,
    nonna: 'campania',
    owned: [...FREE_NONNE],
    runs: 0,
    music: true,
    sfx: true,
    haptics: true,
    tutorial: false,
  };
}

function parse(raw: string | null): Save {
  if (!raw) return defaultSave();
  try {
    const data = JSON.parse(raw) as Partial<Save>;
    const save = { ...defaultSave(), ...data, version: 2 as const };
    for (const id of FREE_NONNE) if (!save.owned.includes(id)) save.owned.push(id);
    return save;
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

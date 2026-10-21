// Impostazioni condivise: accordatura attiva, La di riferimento, notazione, URL backend.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TUNING_BY_ID, tuningMidis, type Tuning } from './music/tunings';
import type { Notation } from './music/theory';

export interface Settings {
  tuningId: string;
  a4: number;
  notation: Notation;
  backendUrl: string;
  leftHanded: boolean;
}

const DEFAULTS: Settings = {
  tuningId: 'standard',
  a4: 440,
  notation: 'intl',
  backendUrl: 'http://localhost:8000',
  leftHanded: false,
};

const KEY = 'plettro.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* storage non disponibile: si usano i default */
  }
  return DEFAULTS;
}

interface Ctx extends Settings {
  tuning: Tuning;
  tuningMidi: number[];
  isStandard: boolean;
  set: (patch: Partial<Settings>) => void;
}

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Settings>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignora */
    }
  }, [s]);
  const value = useMemo<Ctx>(() => {
    const tuning = TUNING_BY_ID[s.tuningId] ?? TUNING_BY_ID['standard'];
    return {
      ...s,
      tuning,
      tuningMidi: tuningMidis(tuning),
      isStandard: tuning.id === 'standard',
      set: (patch) => setS((prev) => ({ ...prev, ...patch })),
    };
  }, [s]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export function useSettings(): Ctx {
  const c = useContext(SettingsCtx);
  if (!c) throw new Error('SettingsProvider mancante');
  return c;
}

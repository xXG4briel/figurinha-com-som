// Preferências do usuário em localStorage (nunca mídia). Sempre com try/catch.

import { DEFAULT_DURATION_PRESET_MS, DURATION_PRESETS_MS, type DurationPresetMs } from "@/lib/limits";

export const BACKGROUNDS = ["#ffffff", "#000000"] as const;
export type Background = (typeof BACKGROUNDS)[number];

type Prefs = { presetMs: DurationPresetMs; background: Background };

const KEY = "figurinhacomsom:prefs";
const DEFAULTS: Prefs = { presetMs: DEFAULT_DURATION_PRESET_MS, background: "#ffffff" };

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<keyof Prefs, unknown>>;
    return {
      presetMs: DURATION_PRESETS_MS.find((p) => p === raw.presetMs) ?? DEFAULTS.presetMs,
      background: BACKGROUNDS.find((b) => b === raw.background) ?? DEFAULTS.background,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    // modo privado / armazenamento bloqueado: ignora
  }
}

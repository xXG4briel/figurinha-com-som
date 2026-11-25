// Regras do recorte de tempo. Puro.

export type Selection = { startMs: number; endMs: number };
export type TrimBounds = {
  /** Limites onde as alças podem ir (a janela visível da timeline, ou a origem toda). */
  lo: number;
  hi: number;
  minMs: number;
  maxMs: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Seleção inicial: do começo até o preset (ou a origem inteira, se for menor). */
export function initialSelection(durationMs: number, maxMs: number): Selection {
  return { startMs: 0, endMs: Math.min(durationMs, maxMs) };
}

/**
 * Move uma alça. Se o trecho passar do máximo, a outra alça vem junto;
 * nunca fica menor que o mínimo.
 */
export function moveEdge(sel: Selection, edge: "start" | "end", ms: number, b: TrimBounds): Selection {
  if (edge === "start") {
    const startMs = clamp(ms, b.lo, sel.endMs - b.minMs);
    return { startMs, endMs: Math.min(sel.endMs, startMs + b.maxMs) };
  }
  const endMs = clamp(ms, sel.startMs + b.minMs, b.hi);
  return { startMs: Math.max(sel.startMs, endMs - b.maxMs), endMs };
}

/** Arrasta o trecho inteiro mantendo a duração. */
export function moveBy(sel: Selection, deltaMs: number, b: Pick<TrimBounds, "lo" | "hi">): Selection {
  const len = sel.endMs - sel.startMs;
  const startMs = clamp(sel.startMs + deltaMs, b.lo, b.hi - len);
  return { startMs, endMs: startMs + len };
}

/**
 * Ao trocar o preset: encurta o trecho se passar do novo máximo; se ele estava
 * "cheio" no máximo antigo, estende até o novo máximo (limitado ao fim da origem).
 * Um trecho que o usuário deixou menor de propósito não muda.
 */
export function changeMax(sel: Selection, oldMax: number, newMax: number, durationMs: number): Selection {
  const len = sel.endMs - sel.startMs;
  if (len > newMax) return { startMs: sel.startMs, endMs: sel.startMs + newMax };
  const wasFull = len >= Math.min(oldMax, durationMs) - 1;
  if (newMax > oldMax && wasFull) return { startMs: sel.startMs, endMs: Math.min(durationMs, sel.startMs + newMax) };
  return sel;
}

/** "1,5s" */
export function formatSeconds(ms: number) {
  return `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}s`;
}

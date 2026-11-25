// Matemática do enquadramento 1:1. Pura, sem DOM.
//
// O estado é independente de resolução: `cx`/`cy` em [0, 1] dizem onde o quadrado
// está dentro da folga (0 = encostado à esquerda/topo, 1 = à direita/base) e `zoom`
// ≥ 1 encolhe o lado do quadrado em relação ao menor lado da origem.

import { CROP } from "@/lib/limits";

export type CropState = { cx: number; cy: number; zoom: number };

/** Retângulo normalizado (frações da largura/altura da origem). */
export type NormalizedRect = { left: number; top: number; width: number; height: number };

export const CENTERED: CropState = { cx: 0.5, cy: 0.5, zoom: 1 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Quadrado em pixels da origem. */
export function cropRect(w: number, h: number, c: CropState) {
  const size = Math.min(w, h) / clamp(c.zoom, 1, CROP.maxZoom);
  return { x: clamp(c.cx, 0, 1) * (w - size), y: clamp(c.cy, 0, 1) * (h - size), size };
}

export function toNormalized(w: number, h: number, c: CropState): NormalizedRect {
  const r = cropRect(w, h, c);
  return { left: r.x / w, top: r.y / h, width: r.size / w, height: r.size / h };
}

/**
 * Arrasto: o dedo move a imagem, então o quadrado anda no sentido oposto.
 * `dx`/`dy` em px da tela; `viewPx` é o lado do quadrado na tela.
 */
export function panBy(w: number, h: number, c: CropState, dx: number, dy: number, viewPx: number): CropState {
  const { size } = cropRect(w, h, c);
  const scale = size / viewPx; // px da origem por px da tela
  const slackX = w - size;
  const slackY = h - size;
  return {
    ...c,
    cx: slackX > 0 ? clamp(c.cx - (dx * scale) / slackX, 0, 1) : 0.5,
    cy: slackY > 0 ? clamp(c.cy - (dy * scale) / slackY, 0, 1) : 0.5,
  };
}

/**
 * Posição CSS (em %) do elemento de mídia dentro do quadrado de visualização,
 * para que a área visível seja exatamente o recorte.
 */
export function previewStyle(w: number, h: number, c: CropState) {
  const r = cropRect(w, h, c);
  return {
    width: `${(w / r.size) * 100}%`,
    height: `${(h / r.size) * 100}%`,
    left: `${(-r.x / r.size) * 100}%`,
    top: `${(-r.y / r.size) * 100}%`,
  };
}

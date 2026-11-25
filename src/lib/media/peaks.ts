// Picos da forma de onda (puro, sem DOM nem Mediabunny: usado pela UI).

export type Peaks = { peaks: Float32Array; binsPerSecond: number };

/** Puro: picos de uma janela [fromS, toS) em `bars` barras, normalizados 0..1. */
export function barsFor({ peaks, binsPerSecond }: Peaks, fromS: number, toS: number, bars: number) {
  const out = new Float32Array(bars);
  const span = (toS - fromS) / bars;
  for (let j = 0; j < bars; j++) {
    const a = Math.floor((fromS + j * span) * binsPerSecond);
    const b = Math.max(a + 1, Math.floor((fromS + (j + 1) * span) * binsPerSecond));
    let max = 0;
    for (let k = Math.max(0, a); k < Math.min(b, peaks.length); k++) if (peaks[k] > max) max = peaks[k];
    out[j] = max;
  }
  return out;
}

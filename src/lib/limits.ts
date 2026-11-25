// TODAS as constantes de limite ficam aqui. Ao mudar, atualize a seção do CLAUDE.md.

export const MB = 1024 * 1024;

export const INPUT_LIMITS = {
  videoMaxBytes: 200 * MB,
  audioMaxBytes: 25 * MB,
  imageMaxBytes: 20 * MB,
  sourceMaxDurationMs: 10 * 60 * 1000,
  imageMaxSidePx: 8000,
  imageMaxPixels: 40_000_000,
  /** Quadros de GIF/WebP animado decodificados no máximo (o resto é ignorado). */
  animatedMaxFrames: 300,
} as const;

export const DURATION_PRESETS_MS = [5_000, 10_000] as const;
export type DurationPresetMs = (typeof DURATION_PRESETS_MS)[number];
export const DEFAULT_DURATION_PRESET_MS: DurationPresetMs = 10_000;
export const MIN_CLIP_MS = 100;

export const OUTPUT = {
  sizePx: 512,
  fps: 30,
  audioSampleRate: 48_000,
  videoBitrate: 1_200_000,
  audioBitrate: 128_000,
} as const;

export const CROP = {
  maxZoom: 4,
} as const;

export const WAVEFORM = {
  /** Resolução dos picos: barras por segundo de origem. */
  binsPerSecond: 50,
  /** Barras desenhadas na timeline (largura fixa, independe da tela). */
  drawnBars: 96,
} as const;

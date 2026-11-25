// Erros de mídia tipados. O código atravessa a fronteira do worker como string;
// a mensagem amigável vem de i18n (t.errors[code]).

export const MEDIA_ERROR_CODES = [
  "unsupported-file",
  "too-large",
  "too-long",
  "image-too-big",
  "no-media",
  "decode-failed",
  "encode-unsupported",
  "encode-failed",
  "canceled",
] as const;

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "MediaError";
    this.code = code;
  }
}

export function isMediaErrorCode(value: unknown): value is MediaErrorCode {
  return typeof value === "string" && (MEDIA_ERROR_CODES as readonly string[]).includes(value);
}

/** Converte qualquer erro em código tipado (desconhecido vira `fallback`). */
export function toErrorCode(err: unknown, fallback: MediaErrorCode): MediaErrorCode {
  if (err instanceof MediaError) return err.code;
  return fallback;
}

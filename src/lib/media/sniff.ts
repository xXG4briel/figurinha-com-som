// Identifica o tipo pelos bytes (não pela extensão) e lê dimensões de imagem pelo
// cabeçalho, sem decodificar. Puro: recebe bytes, devolve dados.

export type SniffedKind =
  | { kind: "image"; mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp" }
  | { kind: "av"; container: "isobmff" | "webm" }
  | { kind: "audio"; container: "mp3" | "wav" | "ogg" | "aac" | "flac" };

const ascii = (b: Uint8Array, offset: number, len: number) =>
  String.fromCharCode(...b.subarray(offset, offset + len));

/** Precisa de pelo menos ~12 bytes; 64 é suficiente. */
export function sniff(b: Uint8Array): SniffedKind | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return { kind: "image", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg" };
  if (ascii(b, 0, 4) === "GIF8") return { kind: "image", mime: "image/gif" };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { kind: "image", mime: "image/webp" };

  if (ascii(b, 4, 4) === "ftyp") return { kind: "av", container: "isobmff" };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "av", container: "webm" };

  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return { kind: "audio", container: "wav" };
  if (ascii(b, 0, 4) === "OggS") return { kind: "audio", container: "ogg" };
  if (ascii(b, 0, 4) === "fLaC") return { kind: "audio", container: "flac" };
  if (ascii(b, 0, 3) === "ID3") return { kind: "audio", container: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return { kind: "audio", container: "aac" }; // ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { kind: "audio", container: "mp3" }; // frame sync
  return null;
}

/** Dimensões a partir do cabeçalho. Para JPEG, varre os marcadores até o SOF. */
export function imageSize(b: Uint8Array, mime: string): { width: number; height: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    switch (mime) {
      case "image/png":
        return { width: v.getUint32(16), height: v.getUint32(20) };
      case "image/gif":
        return { width: v.getUint16(6, true), height: v.getUint16(8, true) };
      case "image/webp": {
        const chunk = ascii(b, 12, 4);
        if (chunk === "VP8X") {
          const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
          const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
          return { width: w, height: h };
        }
        if (chunk === "VP8L") {
          const bits = v.getUint32(21, true);
          return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
        }
        if (chunk === "VP8 ") {
          return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff };
        }
        return null;
      }
      case "image/jpeg": {
        let i = 2;
        while (i + 9 < b.length) {
          if (b[i] !== 0xff) return null;
          const marker = b[i + 1];
          const len = v.getUint16(i + 2);
          const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
          if (isSof) return { width: v.getUint16(i + 7), height: v.getUint16(i + 5) };
          i += 2 + len;
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

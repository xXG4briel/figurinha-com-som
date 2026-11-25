// Inspeção do arquivo: tipo pelos bytes, limites de tamanho/duração/dimensão e
// capacidade de decodificar. Roda no worker (usa Mediabunny).

import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { MediaError } from "@/lib/errors";
import { INPUT_LIMITS } from "@/lib/limits";
import { imageSize, sniff } from "@/lib/media/sniff";

export type ProbeResult =
  | { kind: "image"; mime: string; width: number; height: number }
  | { kind: "video"; durationMs: number; width: number; height: number; hasAudio: boolean }
  | { kind: "audio"; durationMs: number };

// JPEG pode ter EXIF/miniatura grandes antes do SOF.
const HEAD_BYTES = 256 * 1024;

export async function probe(file: File): Promise<ProbeResult> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const sniffed = sniff(head);
  if (!sniffed) throw new MediaError("unsupported-file");

  if (sniffed.kind === "image") {
    if (file.size > INPUT_LIMITS.imageMaxBytes) throw new MediaError("too-large");
    const dims = imageSize(head, sniffed.mime) ?? (await decodedSize(file));
    checkImageDims(dims.width, dims.height);
    return { kind: "image", mime: sniffed.mime, ...dims };
  }

  const maxBytes = sniffed.kind === "audio" ? INPUT_LIMITS.audioMaxBytes : INPUT_LIMITS.videoMaxBytes;
  if (file.size > maxBytes) throw new MediaError("too-large");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    if (!video && !audio) throw new MediaError("no-media");

    const durationMs = (await input.computeDuration()) * 1000;
    if (durationMs > INPUT_LIMITS.sourceMaxDurationMs) throw new MediaError("too-long");

    const audioOk = audio ? await audio.canDecode() : false;
    if (video) {
      if (!(await video.canDecode())) throw new MediaError("decode-failed", "video codec");
      return {
        kind: "video",
        durationMs,
        width: video.displayWidth,
        height: video.displayHeight,
        hasAudio: audioOk,
      };
    }
    // Contêiner MP4/WebM só com áudio (ex.: .m4a) segue o limite de áudio.
    if (file.size > INPUT_LIMITS.audioMaxBytes) throw new MediaError("too-large");
    if (!audioOk) throw new MediaError("decode-failed", "audio codec");
    return { kind: "audio", durationMs };
  } catch (err) {
    if (err instanceof MediaError) throw err;
    throw new MediaError("unsupported-file", String(err));
  } finally {
    input.dispose();
  }
}

function checkImageDims(width: number, height: number) {
  if (
    width > INPUT_LIMITS.imageMaxSidePx ||
    height > INPUT_LIMITS.imageMaxSidePx ||
    width * height > INPUT_LIMITS.imageMaxPixels
  ) {
    throw new MediaError("image-too-big");
  }
}

async function decodedSize(file: File) {
  try {
    const bmp = await createImageBitmap(file);
    const dims = { width: bmp.width, height: bmp.height };
    bmp.close();
    return dims;
  } catch {
    throw new MediaError("unsupported-file");
  }
}

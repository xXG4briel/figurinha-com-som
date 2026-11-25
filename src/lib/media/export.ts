// Exportação local com WebCodecs (Mediabunny) + OffscreenCanvas. Roda no worker.
//
// Saídas:
// - MP4 512×512 (H.264 + AAC) a partir de vídeo, imagem ou GIF, com o som escolhido.
// - Áudio do trecho: M4A (AAC) ou, sem AAC, Ogg Opus.

import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
} from "mediabunny";
import { MediaError } from "@/lib/errors";
import { OUTPUT } from "@/lib/limits";
import type { NormalizedRect } from "@/lib/media/crop";
import type { ExportJob, ExportResult } from "@/lib/media/protocol";

type Progress = (fraction: number) => void;

/** Áudio do trecho já recortado, em PCM planar, começando em t = 0. */
type Pcm = { sampleRate: number; planes: Float32Array[] };

const FADE_S = 0.01; // evita estalo no corte

export async function exportClip(job: ExportJob, onProgress: Progress): Promise<ExportResult> {
  const startS = job.startMs / 1000;
  const durS = (job.endMs - job.startMs) / 1000;

  const pcm = job.audio ? await readPcm(job.audio.file, startS, durS) : null;
  const audioCodec = pcm ? await pickAudioCodec(pcm.planes.length) : null;

  const wantVideo = job.wantVideo && job.visual !== null;
  const video = wantVideo
    ? await renderVideo(job, durS, pcm, audioCodec, (f) => onProgress(f * (job.wantAudio ? 0.9 : 1)))
    : null;

  const audio = job.wantAudio && pcm && audioCodec ? await encodeAudioOnly(pcm, audioCodec) : null;
  onProgress(1);
  return { video, audio };
}

// ---------------------------------------------------------------- áudio

async function readPcm(file: File, startS: number, durS: number): Promise<Pcm | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const sampleRate = track.sampleRate;
    const channels = Math.min(2, track.numberOfChannels);
    const total = Math.round(durS * sampleRate);
    const planes = Array.from({ length: channels }, () => new Float32Array(total));
    let scratch = new Float32Array(0);

    for await (const s of new AudioSampleSink(track).samples(startS, startS + durS)) {
      const n = s.numberOfFrames;
      if (scratch.length < n) scratch = new Float32Array(n);
      // Posição deste bloco dentro do trecho (pode começar antes de startS).
      const offset = Math.round((s.timestamp - startS) * s.sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        // Origem com mais de 2 canais: usa os 2 primeiros. Mono continua mono.
        s.copyTo(scratch, { planeIndex: Math.min(ch, s.numberOfChannels - 1), format: "f32-planar" });
        const plane = planes[ch];
        for (let i = 0; i < n; i++) {
          const j = offset + i;
          if (j >= 0 && j < total) plane[j] = scratch[i];
        }
      }
      s.close();
    }

    const fade = Math.min(Math.round(FADE_S * sampleRate), Math.floor(total / 2));
    for (const plane of planes) {
      for (let i = 0; i < fade; i++) {
        const g = i / fade;
        plane[i] *= g;
        plane[total - 1 - i] *= g;
      }
    }
    return { sampleRate, planes };
  } catch (err) {
    throw new MediaError("decode-failed", String(err));
  } finally {
    input.dispose();
  }
}

let aacRegistered = false;

async function pickAudioCodec(numberOfChannels: number): Promise<AudioCodec> {
  const opts = { numberOfChannels, sampleRate: OUTPUT.audioSampleRate, bitrate: OUTPUT.audioBitrate };
  if (await canEncodeAudio("aac", opts)) return "aac";
  // Sem AAC nativo (ex.: Chrome no Linux): encoder AAC em wasm, carregado só agora.
  if (!aacRegistered) {
    try {
      const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
      registerAacEncoder();
      aacRegistered = true;
    } catch {
      // segue para Opus
    }
  }
  if (aacRegistered && (await canEncodeAudio("aac", opts))) return "aac";
  if (await canEncodeAudio("opus", opts)) return "opus";
  throw new MediaError("encode-unsupported", "audio");
}

function audioSource(codec: AudioCodec, channels: number) {
  return new AudioSampleSource({
    codec,
    bitrate: OUTPUT.audioBitrate,
    transform: { sampleRate: OUTPUT.audioSampleRate, numberOfChannels: channels },
  });
}

/** Fatia o PCM em blocos de 1/10 s, em ordem. */
function* pcmChunks(pcm: Pcm) {
  const step = Math.round(pcm.sampleRate / 10);
  const total = pcm.planes[0].length;
  for (let from = 0; from < total; from += step) {
    const n = Math.min(step, total - from);
    const data = new Float32Array(n * pcm.planes.length);
    pcm.planes.forEach((p, ch) => data.set(p.subarray(from, from + n), ch * n));
    yield new AudioSample({
      data,
      format: "f32-planar",
      numberOfChannels: pcm.planes.length,
      sampleRate: pcm.sampleRate,
      timestamp: from / pcm.sampleRate,
    });
  }
}

async function encodeAudioOnly(pcm: Pcm, codec: AudioCodec) {
  const isAac = codec === "aac";
  const output = new Output({
    format: isAac ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new OggOutputFormat(),
    target: new BufferTarget(),
  });
  const source = audioSource(codec, pcm.planes.length);
  output.addAudioTrack(source);
  try {
    await output.start();
    for (const s of pcmChunks(pcm)) {
      await source.add(s);
      s.close();
    }
    source.close();
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw new MediaError("encode-failed", String(err));
  }
  const buffer = output.target.buffer;
  if (!buffer) throw new MediaError("encode-failed", "empty audio");
  return isAac
    ? { blob: new Blob([buffer], { type: "audio/mp4" }), ext: "m4a" }
    : { blob: new Blob([buffer], { type: "audio/ogg" }), ext: "ogg" };
}

// ---------------------------------------------------------------- vídeo

/** Desenha o quadro de origem já recortado no canvas de saída. */
type FrameProvider = {
  /** Prepara o quadro do instante `t` (segundos de saída). */
  draw(t: number, ctx: OffscreenCanvasRenderingContext2D): Promise<void>;
  close(): void;
};

async function renderVideo(
  job: ExportJob,
  durS: number,
  pcm: Pcm | null,
  audioCodec: AudioCodec | null,
  onProgress: Progress,
) {
  const size = OUTPUT.sizePx;
  const videoOpts = { width: size, height: size, bitrate: OUTPUT.videoBitrate, frameRate: OUTPUT.fps };
  if (!(await canEncodeVideo("avc", videoOpts))) throw new MediaError("encode-unsupported", "avc");

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new MediaError("encode-unsupported", "canvas");
  ctx.imageSmoothingQuality = "high";

  const visual = job.visual!;
  const frameCount = Math.max(1, Math.round(durS * OUTPUT.fps));
  const frameDur = 1 / OUTPUT.fps;
  const startS = job.startMs / 1000;
  const provider =
    visual.kind === "video"
      ? await videoFrames(
          visual.file,
          visual.crop,
          ({ first, duration }) =>
            Array.from({ length: frameCount }, (_, i) =>
              job.videoFollowsTrim ? startS + i * frameDur : first + ((i * frameDur) % duration),
            ),
          job.background,
        )
      : await imageFrames(visual.file, visual.mime, visual.crop, job.background);

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const videoSource = new CanvasSource(canvas, { codec: "avc", bitrate: OUTPUT.videoBitrate });
  output.addVideoTrack(videoSource, { frameRate: OUTPUT.fps });
  const aSource = pcm && audioCodec ? audioSource(audioCodec, pcm.planes.length) : null;
  if (aSource) output.addAudioTrack(aSource);

  try {
    await output.start();
    const chunks = pcm && aSource ? pcmChunks(pcm) : null;
    let nextChunk = chunks?.next();

    for (let i = 0; i < frameCount; i++) {
      const t = i * frameDur;
      // Intercala o áudio com o vídeo para o muxer não acumular uma faixa só.
      while (aSource && nextChunk && !nextChunk.done && nextChunk.value.timestamp <= t + frameDur) {
        await aSource.add(nextChunk.value);
        nextChunk.value.close();
        nextChunk = chunks!.next();
      }
      await provider.draw(t, ctx);
      await videoSource.add(t, frameDur);
      onProgress((i + 1) / frameCount);
    }
    while (aSource && nextChunk && !nextChunk.done) {
      await aSource.add(nextChunk.value);
      nextChunk.value.close();
      nextChunk = chunks!.next();
    }
    videoSource.close();
    aSource?.close();
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    if (err instanceof MediaError) throw err;
    throw new MediaError("encode-failed", String(err));
  } finally {
    provider.close();
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new MediaError("encode-failed", "empty video");
  return { blob: new Blob([buffer], { type: "video/mp4" }), ext: "mp4" };
}

function drawCropped(
  ctx: OffscreenCanvasRenderingContext2D,
  src: CanvasImageSource,
  w: number,
  h: number,
  crop: NormalizedRect,
  background: string,
) {
  const size = ctx.canvas.width;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(src, crop.left * w, crop.top * h, crop.width * w, crop.height * h, 0, 0, size, size);
}

/**
 * Quadros de um vídeo, nos instantes `times` (segundos da origem), em ordem.
 * `canvasesAtTimestamps` decodifica em sequência em vez de buscar a cada quadro.
 */
async function videoFrames(
  file: File,
  crop: NormalizedRect,
  times: (track: { first: number; duration: number }) => number[],
  background: string,
): Promise<FrameProvider> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new MediaError("no-media");
  const duration = Math.max(0.001, await input.computeDuration([track]));
  const first = await track.getFirstTimestamp();

  // Reduz na decodificação: o recorte precisa de ~1,5× a saída, não do 4K inteiro.
  const scale = Math.min(1, (OUTPUT.sizePx * 1.5) / (crop.width * track.displayWidth));
  const sink = new CanvasSink(track, {
    poolSize: 2,
    width: Math.max(2, Math.round(track.displayWidth * scale)),
    height: Math.max(2, Math.round(track.displayHeight * scale)),
    fit: "fill",
  });
  const frames = sink.canvasesAtTimestamps(times({ first, duration }));

  let last: OffscreenCanvas | HTMLCanvasElement | null = null;
  return {
    async draw(_t, ctx) {
      const next = await frames.next();
      if (!next.done && next.value) last = next.value.canvas;
      if (last) drawCropped(ctx, last, last.width, last.height, crop, background);
      else {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
    },
    close() {
      void frames.return(undefined);
      input.dispose();
    },
  };
}

/** Imagem estática, ou GIF/WebP/PNG animado via ImageDecoder (repete em loop). */
async function imageFrames(file: File, mime: string, crop: NormalizedRect, background: string): Promise<FrameProvider> {
  const animated = await openAnimated(file, mime);
  if (animated) return animated(crop, background);

  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    throw new MediaError("decode-failed", String(err));
  }
  let drawn = false;
  return {
    async draw(_t, ctx) {
      if (drawn) return; // estática: o canvas já tem o quadro
      drawCropped(ctx, bmp, bmp.width, bmp.height, crop, background);
      drawn = true;
    },
    close() {
      bmp.close();
    },
  };
}

async function openAnimated(file: File, mime: string) {
  if (mime === "image/jpeg" || typeof ImageDecoder === "undefined") return null;
  if (!(await ImageDecoder.isTypeSupported(mime))) return null;
  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: mime });
  try {
    await decoder.tracks.ready;
    await decoder.completed;
  } catch {
    decoder.close();
    return null;
  }
  const track = decoder.tracks.selectedTrack;
  if (!track || !track.animated || track.frameCount < 2) {
    decoder.close();
    return null;
  }
  const frameCount = track.frameCount;

  return (crop: NormalizedRect, background: string): FrameProvider => {
    let index = -1;
    let frame: VideoFrame | null = null;
    let frameEnd = 0; // fim do quadro atual, em segundos de saída

    return {
      async draw(t, ctx) {
        let advanced = false;
        while (frame === null || t >= frameEnd) {
          index = (index + 1) % frameCount;
          const { image } = await decoder.decode({ frameIndex: index });
          frame?.close();
          frame = image;
          // Navegadores tratam atrasos muito curtos como 100 ms.
          const us = image.duration ?? 0;
          frameEnd += us >= 20_000 ? us / 1e6 : 0.1;
          advanced = true;
        }
        if (advanced) drawCropped(ctx, frame, frame.displayWidth, frame.displayHeight, crop, background);
      },
      close() {
        frame?.close();
        decoder.close();
      },
    };
  };
}

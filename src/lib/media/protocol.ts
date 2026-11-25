// Contrato entre a UI e o worker de mídia. Só tipos (nada de Mediabunny aqui).

import type { MediaErrorCode } from "@/lib/errors";
import type { NormalizedRect } from "@/lib/media/crop";
import type { Peaks } from "@/lib/media/peaks";
import type { ProbeResult } from "@/lib/media/probe";

export type { ProbeResult };

export type ExportJob = {
  /** Parte visual: vídeo, imagem estática ou animada (GIF/WebP). Sem ela, só sai áudio. */
  visual: { file: File; kind: "video" | "image"; mime: string; crop: NormalizedRect } | null;
  /** Origem do som (pode ser o próprio vídeo). Sem ela, o vídeo sai mudo. */
  audio: { file: File } | null;
  /** Trecho da origem com tempo (áudio separado, ou o vídeo). */
  startMs: number;
  endMs: number;
  /**
   * true: o vídeo segue o recorte (é a própria origem com tempo).
   * false: o vídeo começa do 0 e repete enquanto durar o áudio separado.
   */
  videoFollowsTrim: boolean;
  background: string;
  wantVideo: boolean;
  wantAudio: boolean;
};

export type ExportedFile = { blob: Blob; ext: string };
export type ExportResult = { video: ExportedFile | null; audio: ExportedFile | null };

export type WorkerRequest =
  | { id: number; type: "probe"; file: File }
  | { id: number; type: "waveform"; file: File }
  | { id: number; type: "export"; job: ExportJob };

export type WorkerResultMap = {
  probe: ProbeResult;
  waveform: Peaks | null;
  export: ExportResult;
};

export type WorkerResponse =
  | { id: number; type: "result"; value: WorkerResultMap[keyof WorkerResultMap] }
  | { id: number; type: "progress"; value: number }
  | { id: number; type: "error"; code: MediaErrorCode; detail?: string };

// Cliente do worker de mídia (thread da UI). Cada cliente tem seu próprio worker,
// criado sob demanda; `cancel()` encerra o worker e rejeita o que estava pendente.

import { MediaError } from "@/lib/errors";
import type { ExportJob, WorkerRequest, WorkerResponse, WorkerResultMap } from "@/lib/media/protocol";

type Pending = {
  resolve: (v: never) => void;
  reject: (e: MediaError) => void;
  onProgress?: (f: number) => void;
};

export class MediaClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  probe(file: File) {
    return this.call("probe", { file });
  }

  waveform(file: File) {
    return this.call("waveform", { file });
  }

  export(job: ExportJob, onProgress: (f: number) => void) {
    return this.call("export", { job }, onProgress);
  }

  /** Interrompe tudo o que estiver rodando neste cliente. */
  cancel() {
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(new MediaError("canceled"));
    this.pending.clear();
  }

  private call<K extends WorkerRequest["type"]>(
    type: K,
    payload: Omit<Extract<WorkerRequest, { type: K }>, "id" | "type">,
    onProgress?: (f: number) => void,
  ): Promise<WorkerResultMap[K]> {
    const id = this.nextId++;
    const worker = this.ensureWorker();
    return new Promise<WorkerResultMap[K]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject, onProgress });
      worker.postMessage({ id, type, ...payload });
    });
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../../workers/media.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") return p.onProgress?.(msg.value);
      this.pending.delete(msg.id);
      if (msg.type === "result") p.resolve(msg.value as never);
      else p.reject(new MediaError(msg.code, msg.detail));
    };
    worker.onerror = (e) => {
      console.error("[media.worker] crashed", e.message);
      for (const p of this.pending.values()) p.reject(new MediaError("decode-failed", e.message));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = worker;
    return worker;
  }
}

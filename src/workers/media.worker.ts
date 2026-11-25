// Worker de mídia: probe, forma de onda e exportação fora da thread da UI.
// Cancelar = a UI encerra o worker (terminate) e cria outro quando precisar.

import { MediaError, toErrorCode } from "@/lib/errors";
import { exportClip } from "@/lib/media/export";
import { probe } from "@/lib/media/probe";
import type { WorkerRequest, WorkerResponse } from "@/lib/media/protocol";
import { computePeaks } from "@/lib/media/waveform";

const post = (msg: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(msg, { transfer });

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    switch (req.type) {
      case "probe":
        post({ id: req.id, type: "result", value: await probe(req.file) });
        break;
      case "waveform": {
        const peaks = await computePeaks(req.file);
        post({ id: req.id, type: "result", value: peaks }, peaks ? [peaks.peaks.buffer] : []);
        break;
      }
      case "export": {
        let lastSent = 0;
        const value = await exportClip(req.job, (f) => {
          // Até ~50 mensagens por exportação.
          if (f - lastSent >= 0.02 || f === 1) {
            lastSent = f;
            post({ id: req.id, type: "progress", value: f });
          }
        });
        post({ id: req.id, type: "result", value });
        break;
      }
    }
  } catch (err) {
    const fallback = req.type === "export" ? "encode-failed" : "unsupported-file";
    console.error("[media.worker]", err);
    post({
      id: req.id,
      type: "error",
      code: toErrorCode(err, fallback),
      detail: err instanceof MediaError ? undefined : String(err),
    });
  }
};

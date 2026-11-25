// Picos de amplitude para desenhar a forma de onda. Decodifica em streaming (sem
// guardar o áudio inteiro na memória) e guarda o pico absoluto por bin.

import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from "mediabunny";
import { WAVEFORM } from "@/lib/limits";
import type { Peaks } from "@/lib/media/peaks";

export async function computePeaks(file: File): Promise<Peaks | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;

    const bps = WAVEFORM.binsPerSecond;
    const duration = await input.computeDuration();
    const peaks = new Float32Array(Math.max(1, Math.ceil(duration * bps)));
    let scratch = new Float32Array(0);

    for await (const sample of new AudioSampleSink(track).samples()) {
      const n = sample.numberOfFrames;
      if (scratch.length < n) scratch = new Float32Array(n);
      const framesPerBin = sample.sampleRate / bps;
      const firstFrame = sample.timestamp * sample.sampleRate;
      for (let ch = 0; ch < sample.numberOfChannels; ch++) {
        sample.copyTo(scratch, { planeIndex: ch, format: "f32-planar" });
        for (let i = 0; i < n; i++) {
          const bin = Math.floor((firstFrame + i) / framesPerBin);
          const v = Math.abs(scratch[i]);
          if (bin >= 0 && bin < peaks.length && v > peaks[bin]) peaks[bin] = v;
        }
      }
      sample.close();
    }

    let max = 0;
    for (const v of peaks) if (v > max) max = v;
    if (max > 0) for (let i = 0; i < peaks.length; i++) peaks[i] /= max;
    return { peaks, binsPerSecond: bps };
  } finally {
    input.dispose();
  }
}

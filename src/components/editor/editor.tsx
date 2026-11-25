"use client";

import { ImagePlusIcon, MusicIcon, PauseIcon, PlayIcon, UploadIcon, XIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { DonePanel } from "@/components/editor/done-panel";
import { CropBox } from "@/components/editor/crop-box";
import { Timeline } from "@/components/editor/timeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MediaError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { DURATION_PRESETS_MS, type DurationPresetMs } from "@/lib/limits";
import { MediaClient } from "@/lib/media/client";
import { CENTERED, toNormalized, type CropState } from "@/lib/media/crop";
import type { Peaks } from "@/lib/media/peaks";
import type { ExportJob, ExportResult } from "@/lib/media/protocol";
import { applyMax, initialSelection, type Selection } from "@/lib/media/trim";
import { BACKGROUNDS, loadPrefs, savePrefs, type Background } from "@/lib/prefs";

type Visual = {
  file: File;
  url: string;
  kind: "video" | "image";
  mime: string;
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
};
type Sound = { file: File; url: string; durationMs: number };
type Phase =
  | { name: "edit" }
  | { name: "exporting"; progress: number }
  | { name: "done"; result: ExportResult; previewUrl: string | null; stamp: string };

const ACCEPT_ANY = "video/*,audio/*,image/*,.mov,.m4a,.mp3,.wav,.ogg,.opus,.aac,.gif,.webp";
const ACCEPT_AUDIO = "audio/*,.m4a,.mp3,.wav,.ogg,.opus,.aac,video/mp4";
const ACCEPT_VISUAL = "video/*,image/*,.mov,.gif,.webp";

/** Origem com tempo: o áudio separado, ou o próprio vídeo. É ela que a timeline recorta. */
function timedOf(visual: Visual | null, sound: Sound | null) {
  if (sound) return { file: sound.file, durationMs: sound.durationMs, hasAudio: true };
  if (visual?.kind === "video") return { file: visual.file, durationMs: visual.durationMs, hasAudio: visual.hasAudio };
  return null;
}

function errorMessage(err: unknown) {
  return err instanceof MediaError ? t.errors[err.code] : t.errors["unsupported-file"];
}

export function Editor() {
  const [analysis] = useState(() => new MediaClient());
  const [exporter] = useState(() => new MediaClient());
  const [prefs] = useState(loadPrefs);

  const [visual, setVisual] = useState<Visual | null>(null);
  const [sound, setSound] = useState<Sound | null>(null);
  const [loading, setLoading] = useState(false);
  const [peaks, setPeaks] = useState<Peaks | null>(null);
  const [selection, setSelection] = useState<Selection>({ startMs: 0, endMs: 0 });
  const [crop, setCrop] = useState<CropState>(CENTERED);
  const [mediaDims, setMediaDims] = useState<{ url: string; width: number; height: number } | null>(null);
  const [presetMs, setPresetMs] = useState<DurationPresetMs>(prefs.presetMs);
  const [background, setBackground] = useState<Background>(prefs.background);
  const [phase, setPhase] = useState<Phase>({ name: "edit" });
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const waveToken = useRef(0);

  // Cada objeto Visual/Sound tem a própria URL: libera quando é trocado ou some.
  useEffect(() => {
    if (!visual) return;
    return () => URL.revokeObjectURL(visual.url);
  }, [visual]);
  useEffect(() => {
    if (!sound) return;
    return () => URL.revokeObjectURL(sound.url);
  }, [sound]);
  useEffect(() => {
    if (phase.name !== "done" || !phase.previewUrl) return;
    const url = phase.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [phase]);
  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      analysis.cancel();
      exporter.cancel();
    },
    [analysis, exporter],
  );

  const timed = timedOf(visual, sound);
  // Dimensões reais exibidas (EXIF/rotação) quando o elemento já carregou.
  const dims = visual && mediaDims?.url === visual.url ? mediaDims : visual;

  // ------------------------------------------------------------ fontes

  const applySources = (nextVisual: Visual | null, nextSound: Sound | null) => {
    stop();
    const before = timedOf(visual, sound);
    const after = timedOf(nextVisual, nextSound);
    if (nextVisual !== visual) setCrop(CENTERED);
    setVisual(nextVisual);
    setSound(nextSound);
    if (before?.file !== after?.file) {
      const token = ++waveToken.current;
      setPeaks(null);
      setSelection(after ? initialSelection(after.durationMs, presetMs) : { startMs: 0, endMs: 0 });
      if (after?.hasAudio) {
        analysis
          .waveform(after.file)
          .then((p) => token === waveToken.current && setPeaks(p))
          .catch(() => {}); // sem forma de onda, a timeline continua funcionando
      }
    }
  };

  const pick = async (files: File[]) => {
    if (!files.length) return;
    setLoading(true);
    let nextVisual = visual;
    let nextSound = sound;
    for (const file of files) {
      try {
        const info = await analysis.probe(file);
        const url = URL.createObjectURL(file);
        if (info.kind === "audio") nextSound = { file, url, durationMs: info.durationMs };
        else if (info.kind === "image")
          nextVisual = { file, url, kind: "image", mime: info.mime, width: info.width, height: info.height, durationMs: 0, hasAudio: false };
        else
          nextVisual = { file, url, kind: "video", mime: file.type, width: info.width, height: info.height, durationMs: info.durationMs, hasAudio: info.hasAudio };
      } catch (err) {
        toast.error(errorMessage(err), { description: file.name });
      }
    }
    applySources(nextVisual, nextSound);
    setLoading(false);
  };

  const openPicker = (accept: string) => {
    const input = inputRef.current;
    if (!input) return;
    input.accept = accept;
    input.click();
  };

  const onPaste = useEffectEvent((e: ClipboardEvent) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length && phase.name === "edit") void pick(files);
  });
  useEffect(() => {
    const handler = (e: ClipboardEvent) => onPaste(e);
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    void pick([...e.dataTransfer.files]);
  };

  // ------------------------------------------------------------ reprodução

  function stop() {
    cancelAnimationFrame(rafRef.current);
    audioRef.current?.pause();
    videoRef.current?.pause();
    setPlayheadMs(null);
  }

  const play = () => {
    if (!timed) return;
    const media = sound ? audioRef.current : videoRef.current;
    if (!media) return;
    const { startMs, endMs } = selection;
    const video = videoRef.current;
    if (sound && video) {
      video.muted = true;
      video.loop = true;
      video.currentTime = 0;
      void video.play().catch(() => {});
    } else if (video) {
      video.muted = false;
      video.loop = false;
    }
    media.currentTime = startMs / 1000;
    media.play().catch(() => stop());
    setPlayheadMs(startMs);
    const tick = () => {
      const now = media.currentTime * 1000;
      if (now >= endMs || media.ended) {
        stop();
        if (!sound && video) video.currentTime = startMs / 1000;
        return;
      }
      setPlayheadMs(now);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const onTrim = (sel: Selection, edge: "start" | "end" | "move") => {
    if (playheadMs !== null) stop();
    setSelection(sel);
    // Mostra o quadro da alça que está sendo movida.
    if (!sound && videoRef.current) videoRef.current.currentTime = (edge === "end" ? sel.endMs : sel.startMs) / 1000;
  };

  const onPreset = (next: DurationPresetMs) => {
    setPresetMs(next);
    savePrefs({ presetMs: next });
    setSelection((s) => applyMax(s, next));
  };

  // ------------------------------------------------------------ exportação

  const audioSourceFile = sound?.file ?? (visual?.kind === "video" && visual.hasAudio ? visual.file : null);
  const canExport = Boolean(timed && selection.endMs > selection.startMs && (visual?.kind === "video" || audioSourceFile));

  const runExport = async () => {
    if (!canExport || !timed) return;
    stop();
    const job: ExportJob = {
      visual:
        visual && dims
          ? { file: visual.file, kind: visual.kind, mime: visual.mime, crop: toNormalized(dims.width, dims.height, crop) }
          : null,
      audio: audioSourceFile ? { file: audioSourceFile } : null,
      startMs: selection.startMs,
      endMs: selection.endMs,
      videoFollowsTrim: !sound,
      background,
      wantVideo: visual !== null,
      wantAudio: audioSourceFile !== null,
    };
    setPhase({ name: "exporting", progress: 0 });
    try {
      const result = await exporter.export(job, (progress) => setPhase({ name: "exporting", progress }));
      const previewUrl = result.video ? URL.createObjectURL(result.video.blob) : null;
      const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, "");
      setPhase({ name: "done", result, previewUrl, stamp });
    } catch (err) {
      setPhase({ name: "edit" });
      if (!(err instanceof MediaError && err.code === "canceled")) toast.error(errorMessage(err));
    }
  };

  const reset = () => {
    applySources(null, null);
    setPhase({ name: "edit" });
  };

  // ------------------------------------------------------------ render

  if (phase.name === "done") {
    return <DonePanel {...phase} onBack={() => setPhase({ name: "edit" })} onAgain={reset} />;
  }

  const exporting = phase.name === "exporting";
  const hasAny = visual || sound;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pick([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />

        {!hasAny ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => openPicker(ACCEPT_ANY)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted disabled:opacity-60"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <UploadIcon className="size-6" />
            </span>
            <span className="font-medium">{loading ? t.editor.loading : t.editor.pick}</span>
            <span className="text-xs text-balance text-muted-foreground">{t.editor.pickHint}</span>
          </button>
        ) : (
          <>
            {visual && dims ? (
              <CropBox
                width={dims.width}
                height={dims.height}
                crop={crop}
                onChange={setCrop}
                background={visual.kind === "image" ? background : undefined}
              >
                {(style) =>
                  visual.kind === "video" ? (
                    <video
                      ref={videoRef}
                      src={`${visual.url}#t=0.001`}
                      playsInline
                      preload="auto"
                      muted={Boolean(sound)}
                      className="pointer-events-none absolute max-w-none object-fill"
                      style={style}
                      onLoadedMetadata={(e) =>
                        setMediaDims({ url: visual.url, width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })
                      }
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- blob local, sem otimização
                    <img
                      src={visual.url}
                      alt=""
                      draggable={false}
                      className="pointer-events-none absolute max-w-none object-fill"
                      style={style}
                      onLoad={(e) =>
                        setMediaDims({ url: visual.url, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })
                      }
                    />
                  )
                }
              </CropBox>
            ) : (
              <button
                type="button"
                disabled={loading || exporting}
                onClick={() => openPicker(ACCEPT_VISUAL)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-muted"
              >
                <ImagePlusIcon className="size-6 text-muted-foreground" />
                <span className="font-medium">{t.editor.addVisual}</span>
                <span className="text-xs text-balance text-muted-foreground">{t.editor.audioOnly}</span>
              </button>
            )}

            {sound && <audio ref={audioRef} src={sound.url} preload="auto" className="hidden" />}

            <ul className="flex flex-col gap-1">
              {visual && (
                <FileRow
                  name={visual.file.name}
                  icon={<ImagePlusIcon className="size-4" />}
                  disabled={exporting}
                  onRemove={() => applySources(null, sound)}
                />
              )}
              {sound ? (
                <FileRow
                  name={sound.file.name}
                  icon={<MusicIcon className="size-4" />}
                  disabled={exporting}
                  onRemove={() => applySources(visual, null)}
                />
              ) : (
                <li>
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    disabled={loading || exporting}
                    onClick={() => openPicker(ACCEPT_AUDIO)}
                  >
                    <MusicIcon />
                    {visual?.kind === "video" && visual.hasAudio ? t.editor.replaceAudio : t.editor.addAudio}
                  </Button>
                </li>
              )}
            </ul>

            {visual?.kind === "image" && !sound && <p className="text-sm text-muted-foreground">{t.editor.needAudio}</p>}
            {visual?.kind === "video" && sound && <p className="text-xs text-muted-foreground">{t.editor.videoLoops}</p>}

            {visual?.kind === "image" && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t.editor.background}</span>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[background]}
                  onValueChange={(v) => {
                    const next = BACKGROUNDS.find((b) => b === v[0]);
                    if (next) {
                      setBackground(next);
                      savePrefs({ background: next });
                    }
                  }}
                >
                  {BACKGROUNDS.map((b) => (
                    <ToggleGroupItem key={b} value={b} className="h-11 min-w-16">
                      {t.editor.backgrounds[b]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            )}

            {timed && (
              <section className="flex flex-col gap-3" aria-label={t.editor.trim}>
                <Timeline
                  key={`${timed.file.name}-${timed.file.size}-${timed.file.lastModified}`}
                  durationMs={timed.durationMs}
                  peaks={peaks}
                  selection={selection}
                  maxMs={presetMs}
                  playheadMs={playheadMs}
                  onChange={onTrim}
                />
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    className="h-11"
                    disabled={exporting}
                    onClick={playheadMs === null ? play : stop}
                  >
                    {playheadMs === null ? <PlayIcon /> : <PauseIcon />}
                    {playheadMs === null ? t.editor.play : t.editor.stop}
                  </Button>
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    aria-label={t.editor.duration}
                    value={[String(presetMs)]}
                    onValueChange={(v) => {
                      const next = DURATION_PRESETS_MS.find((p) => String(p) === v[0]);
                      if (next) onPreset(next);
                    }}
                  >
                    {DURATION_PRESETS_MS.map((ms) => (
                      <ToggleGroupItem key={ms} value={String(ms)} className="h-11 min-w-14">
                        {ms / 1000}s
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </section>
            )}

            {exporting ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{t.editor.exporting}</span>
                  <span className="text-muted-foreground tabular-nums">{Math.round(phase.progress * 100)}%</span>
                </div>
                <Progress value={phase.progress * 100} aria-label={t.editor.exporting} />
                <Button variant="outline" className="h-11 w-full" onClick={() => exporter.cancel()}>
                  {t.editor.cancel}
                </Button>
              </div>
            ) : (
              <Button className="h-11 w-full" disabled={!canExport || loading} onClick={runExport}>
                {t.editor.export}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FileRow({
  name,
  icon,
  disabled,
  onRemove,
}: {
  name: string;
  icon: React.ReactNode;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{name}</span>
      </span>
      <Button
        variant="ghost"
        size="icon-lg"
        className="size-11 shrink-0"
        aria-label={t.editor.remove(name)}
        disabled={disabled}
        onClick={onRemove}
      >
        <XIcon className="size-5" />
      </Button>
    </li>
  );
}

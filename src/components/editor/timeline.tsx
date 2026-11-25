"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { t } from "@/lib/i18n";
import { MIN_CLIP_MS, WAVEFORM } from "@/lib/limits";
import { barsFor, type Peaks } from "@/lib/media/peaks";
import { formatSeconds, moveBy, moveEdge, type Selection } from "@/lib/media/trim";

type Props = {
  durationMs: number;
  peaks: Peaks | null;
  selection: Selection;
  maxMs: number;
  playheadMs: number | null;
  onChange: (sel: Selection, edge: "start" | "end" | "move") => void;
};

type Drag = { kind: "start" | "end" | "move" | "overview"; originX: number; originSel: Selection; originView: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pct = (v: number) => `${v * 100}%`;

/**
 * Forma de onda com alças de início/fim. Origens longas mostram uma janela de
 * ~3× o máximo; a barra de baixo move a janela (e o trecho junto).
 */
export function Timeline({ durationMs, peaks, selection, maxMs, playheadMs, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const overviewRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const { resolvedTheme } = useTheme();

  const span = Math.min(durationMs, Math.max(maxMs * 3, 15_000));
  const [viewStartState, setViewStart] = useState(0);
  // Janela sempre contém o trecho (derivado, sem effect).
  const viewStart = clamp(
    clamp(viewStartState, 0, durationMs - span),
    Math.max(0, selection.endMs - span),
    Math.min(selection.startMs, durationMs - span),
  );
  const hasOverview = durationMs > span + 1;
  const toView = (ms: number) => (ms - viewStart) / span;
  const bounds = { lo: viewStart, hi: viewStart + span, minMs: MIN_CLIP_MS, maxMs };

  // Desenho da forma de onda: depende da janela, dos picos, da largura e do tema.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(canvas).color;
      const n = WAVEFORM.drawnBars;
      const bars = peaks ? barsFor(peaks, viewStart / 1000, (viewStart + span) / 1000, n) : new Float32Array(n);
      const slot = w / n;
      const barW = Math.max(1, slot * 0.6);
      for (let i = 0; i < n; i++) {
        const bh = Math.max(2, bars[i] * (h - 4));
        ctx.beginPath();
        ctx.roundRect(i * slot + (slot - barW) / 2, (h - bh) / 2, barW, bh, barW / 2);
        ctx.fill();
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, viewStart, span, resolvedTheme]);

  const msAtTrackX = (dx: number) => {
    const w = trackRef.current?.getBoundingClientRect().width ?? 1;
    return (dx / w) * span;
  };

  const startDrag = (e: PointerEvent<HTMLElement>) => {
    const kind = e.currentTarget.dataset.drag as Drag["kind"];
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, originX: e.clientX, originSel: selection, originView: viewStart };
    if (kind === "overview") moveOverviewTo(e.clientX);
  };

  const moveOverviewTo = (clientX: number) => {
    const rect = overviewRef.current?.getBoundingClientRect();
    if (!rect || !drag.current) return;
    const center = ((clientX - rect.left) / rect.width) * durationMs;
    const nextView = clamp(center - span / 2, 0, durationMs - span);
    const delta = nextView - drag.current.originView;
    setViewStart(nextView);
    onChange(moveBy(drag.current.originSel, delta, { lo: 0, hi: durationMs }), "move");
  };

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "overview") return moveOverviewTo(e.clientX);
    const delta = msAtTrackX(e.clientX - d.originX);
    if (d.kind === "move") onChange(moveBy(d.originSel, delta, bounds), "move");
    else {
      const origin = d.kind === "start" ? d.originSel.startMs : d.originSel.endMs;
      onChange(moveEdge(selection, d.kind, origin + delta, bounds), d.kind);
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onEdgeKey = (e: KeyboardEvent<HTMLElement>) => {
    const edge = e.currentTarget.dataset.drag as "start" | "end";
    const step = e.shiftKey ? 1000 : 100;
    const dir = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0;
    if (!dir) return;
    e.preventDefault();
    const current = edge === "start" ? selection.startMs : selection.endMs;
    onChange(moveEdge(selection, edge, current + dir * step, { ...bounds, lo: 0, hi: durationMs }), edge);
  };

  const left = toView(selection.startMs);
  const right = toView(selection.endMs);
  const len = selection.endMs - selection.startMs;

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={trackRef}
        className="relative h-20 touch-none rounded-lg bg-muted select-none"
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full text-muted-foreground" />

        {/* Trecho selecionado (arrastável) */}
        <div
          role="presentation"
          aria-label={t.editor.trimRegion}
          className="absolute inset-y-0 cursor-grab rounded-md border-y-2 border-primary bg-primary/10 active:cursor-grabbing"
          style={{ left: pct(left), width: pct(right - left) }}
          data-drag="move"
          onPointerDown={startDrag}
        />

        {playheadMs !== null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: pct(clamp(toView(playheadMs), 0, 1)) }}
          />
        )}

        {(["start", "end"] as const).map((edge) => {
          const ms = edge === "start" ? selection.startMs : selection.endMs;
          return (
            <div
              key={edge}
              role="slider"
              tabIndex={0}
              aria-label={edge === "start" ? t.editor.trimStart : t.editor.trimEnd}
              aria-valuemin={0}
              aria-valuemax={Math.round(durationMs)}
              aria-valuenow={Math.round(ms)}
              aria-valuetext={formatSeconds(ms)}
              className="group absolute inset-y-0 z-10 flex w-11 -translate-x-1/2 cursor-ew-resize items-center justify-center outline-none"
              style={{ left: pct(edge === "start" ? left : right) }}
              data-drag={edge}
              onPointerDown={startDrag}
              onKeyDown={onEdgeKey}
            >
              <span className="h-full w-1.5 rounded-full bg-primary group-focus-visible:ring-3 group-focus-visible:ring-ring/50" />
            </div>
          );
        })}
      </div>

      {hasOverview && (
        <div
          ref={overviewRef}
          role="slider"
          tabIndex={0}
          aria-label={t.editor.overview}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs)}
          aria-valuenow={Math.round(selection.startMs)}
          aria-valuetext={formatSeconds(selection.startMs)}
          className="relative flex h-11 touch-none items-center outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-md"
          data-drag="overview"
          onPointerDown={startDrag}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(e) => {
            const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
            if (!dir) return;
            e.preventDefault();
            const delta = dir * (e.shiftKey ? span : span / 4);
            const next = clamp(viewStart + delta, 0, durationMs - span);
            setViewStart(next);
            onChange(moveBy(selection, next - viewStart, { lo: 0, hi: durationMs }), "move");
          }}
        >
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div
            className="absolute h-3 rounded-full border border-primary bg-primary/20"
            style={{ left: pct(viewStart / durationMs), width: pct(span / durationMs) }}
          />
          <div
            className="absolute h-3 rounded-sm bg-primary"
            style={{
              left: pct(selection.startMs / durationMs),
              width: `max(2px, ${pct(len / durationMs)})`,
            }}
          />
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatSeconds(selection.startMs)}</span>
        <span className="font-medium text-foreground">{formatSeconds(len)}</span>
        <span>{formatSeconds(selection.endMs)}</span>
      </div>
    </div>
  );
}

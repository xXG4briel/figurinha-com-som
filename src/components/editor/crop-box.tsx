"use client";

import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { t } from "@/lib/i18n";
import { CROP } from "@/lib/limits";
import { panBy, previewStyle, type CropState } from "@/lib/media/crop";

type Props = {
  width: number;
  height: number;
  crop: CropState;
  onChange: (crop: CropState) => void;
  background?: string;
  /** Recebe o estilo de posicionamento que o elemento de mídia deve usar. */
  children: (style: ReturnType<typeof previewStyle>) => ReactNode;
};

type Point = { x: number; y: number };

const clampZoom = (z: number) => Math.min(CROP.maxZoom, Math.max(1, z));

export function CropBox({ width, height, crop, onChange, background, children }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinchDist = useRef<number | null>(null);

  const viewPx = () => boxRef.current?.getBoundingClientRect().width ?? 1;
  const dist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchDist.current = pointers.current.size === 2 ? dist() : null;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchDist.current) {
      const d = dist();
      onChange({ ...crop, zoom: clampZoom(crop.zoom * (d / pinchDist.current)) });
      pinchDist.current = d;
      return;
    }
    if (pointers.current.size === 1) {
      onChange(panBy(width, height, crop, e.clientX - prev.x, e.clientY - prev.y, viewPx()));
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    pinchDist.current = pointers.current.size === 2 ? dist() : null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = viewPx() * (e.shiftKey ? 0.1 : 0.02);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      onChange(panBy(width, height, crop, m[0], m[1], viewPx()));
    } else if (e.key === "+" || e.key === "=") {
      onChange({ ...crop, zoom: clampZoom(crop.zoom + 0.1) });
    } else if (e.key === "-") {
      onChange({ ...crop, zoom: clampZoom(crop.zoom - 0.1) });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={boxRef}
        role="group"
        tabIndex={0}
        aria-label={t.editor.cropArea}
        className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        style={background ? { backgroundColor: background } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {children(previewStyle(width, height, crop))}
      </div>
      <p className="text-xs text-muted-foreground">{t.editor.frame}</p>
      <div className="flex h-11 items-center gap-3">
        <span className="text-sm font-medium">{t.editor.zoom}</span>
        <Slider
          aria-label={t.editor.zoom}
          min={1}
          max={CROP.maxZoom}
          step={0.01}
          value={[crop.zoom]}
          onValueChange={(v) => {
            const z = Array.isArray(v) ? v[0] : v;
            onChange({ ...crop, zoom: clampZoom(z) });
          }}
        />
      </div>
    </div>
  );
}

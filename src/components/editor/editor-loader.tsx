"use client";

import dynamic from "next/dynamic";

// O editor só roda no cliente (mídia, workers, localStorage) e fica fora do bundle inicial.
export const EditorLoader = dynamic(() => import("@/components/editor/editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />,
});

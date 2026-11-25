import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

// Necessário no export estático.
export const dynamic = "force-static";

// Assets de public/ citados à mão precisam do basePath (ver CLAUDE.md).
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t.site.name} para WhatsApp`,
    short_name: t.site.name,
    description: t.site.tagline,
    lang: "pt-BR",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { t } from "@/lib/i18n";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// Origem pública (https://usuario.github.io), vinda do workflow; em dev cai no localhost.
// Imagens de app/ já saem com o basePath; canonical e og:url precisam dele explícito.
const origin = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const home = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`;
const title = `${t.site.name} para WhatsApp`;
const description = `${t.site.tagline} ${t.site.privacy}`;

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: { default: title, template: `%s | ${t.site.name}` },
  description,
  applicationName: t.site.name,
  keywords: [
    "figurinha com som",
    "figurinha com áudio",
    "sticker com som",
    "WhatsApp",
    "recortar vídeo",
    "GIF com áudio",
  ],
  alternates: { canonical: home },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: t.site.name,
    title,
    description,
    url: home,
  },
  twitter: { card: "summary_large_image", title, description },
  appleWebApp: { capable: true, title: t.site.name, statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}

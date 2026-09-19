import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { getConfig } from "@/lib/config/env";

export function generateMetadata(): Metadata {
  const { name } = getConfig().app;
  return {
    metadataBase: getConfig().app.url ? new URL(getConfig().app.url) : undefined,
    title: {
      default: `${name} · Personal Cloud Download Center`,
      template: `%s · ${name}`,
    },
    description:
      "Katsu R2 Manager menggabungkan banyak akun Cloudflare R2 menjadi satu storage pool pribadi dengan public download center, admin dashboard, dan multipart upload tanpa CLI.",
    keywords: [
      "cloudflare r2",
      "object storage",
      "download center",
      "file manager",
      "katsu",
      "next.js",
      "storage pool",
    ],
    authors: [{ name: "Katsu" }],
    openGraph: {
      title: name,
      description:
        "Satu storage pool dari banyak akun Cloudflare R2 - upload lewat browser, download lewat link publik.",
      type: "website",
      siteName: name,
    },
    twitter: { card: "summary_large_image", title: name },
    robots: { index: true, follow: true },
    icons: { icon: "/logo.svg", apple: "/logo.svg" },
    manifest: "/manifest.webmanifest",
  };
}

export const viewport: Viewport = {
  themeColor: "#04060d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

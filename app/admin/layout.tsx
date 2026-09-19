import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Admin · Katsu R2 Manager", template: "%s · Admin Katsu R2 Manager" },
  description: "Dashboard admin Katsu R2 Manager: kelola storage Cloudflare R2, upload file, dan atur unduhan publik.",
  robots: { index: false, follow: false },
};

/**
 * The root layout already provides the toast host, so this layout only carries
 * admin specific metadata (the panel must never be indexed by search engines).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}

import type { Metadata } from "next";
import { SetupAssistant } from "@/components/site/setup-assistant";

export const metadata: Metadata = {
  title: "Setup Assistant",
  description:
    "Siapkan Katsu R2 Manager sepenuhnya dari browser: buat hash password admin, kunci rahasia, siapkan database Cloudflare, dan hubungkan storage R2 — tanpa terminal.",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupAssistant />;
}

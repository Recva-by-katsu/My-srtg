"use client";

import { useState } from "react";
import { Check, Download, Link2, Share2 } from "lucide-react";
import type { PublicFile } from "@/lib/client/types";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/utils/format";

export function PublicFileActions({
  file,
  downloadUrl,
}: {
  file: PublicFile;
  downloadUrl: string;
}) {
  const { toast } = useToast();
  const [shared, setShared] = useState(false);

  async function share() {
    const shareData = { title: file.filename, text: `Unduh ${file.filename} (${formatBytes(file.size)})`, url: downloadUrl };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        /* user cancelled - fall back to copying */
      }
    }
    const ok = await navigator.clipboard?.writeText(downloadUrl).then(() => true).catch(() => false);
    toast({
      tone: ok ? "success" : "warning",
      title: ok ? "Link disalin" : "Gagal membagikan",
      description: ok ? downloadUrl : "Salin link secara manual dari kolom di bawah.",
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <a href={downloadUrl} className="flex-1 sm:flex-none">
        <Button size="lg" className="w-full sm:w-auto">
          <Download className="size-4" />
          Download · {formatBytes(file.size)}
        </Button>
      </a>

      <Button variant="secondary" size="lg" onClick={() => void share()} className="w-full sm:w-auto">
        {shared ? <Check className="size-4 text-emerald-300" /> : <Share2 className="size-4" />}
        Bagikan
      </Button>

      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <Link2 className="size-4 shrink-0 text-slate-500" />
        <code className="scrollbar-thin max-w-[180px] overflow-x-auto whitespace-nowrap text-[12px] text-slate-400 sm:max-w-xs">
          {downloadUrl}
        </code>
        <CopyButton
          compact
          value={downloadUrl}
          label="link"
          onCopied={() => toast({ tone: "success", title: "Link download disalin" })}
        />
      </div>
    </div>
  );
}

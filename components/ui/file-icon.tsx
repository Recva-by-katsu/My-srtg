import {
  Archive,
  File as FileIcon,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Music,
  Package,
  Video,
} from "lucide-react";
import type { FileCategory } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const CATEGORY_STYLE: Record<FileCategory, { className: string; icon: typeof FileIcon }> = {
  video: { className: "from-rose-500/20 to-orange-500/15 text-rose-300", icon: Video },
  audio: { className: "from-fuchsia-500/20 to-purple-500/15 text-fuchsia-300", icon: Music },
  image: { className: "from-emerald-500/20 to-teal-500/15 text-emerald-300", icon: ImageIcon },
  archive: { className: "from-amber-500/20 to-yellow-500/15 text-amber-300", icon: Archive },
  document: { className: "from-brand-500/20 to-sky-500/15 text-brand-300", icon: FileText },
  text: { className: "from-slate-500/20 to-slate-400/10 text-slate-300", icon: FileCode2 },
  application: { className: "from-accent-500/20 to-indigo-500/15 text-accent-300", icon: Package },
  other: { className: "from-slate-500/20 to-slate-400/10 text-slate-300", icon: FileIcon },
};

export function FileTypeIcon({
  category,
  size = "md",
  className,
}: {
  category: FileCategory;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const style = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other!;
  const Icon = style.icon;
  const dimensions =
    { sm: "size-8 rounded-lg", md: "size-11 rounded-xl", lg: "size-16 rounded-2xl" }[size] ??
    "size-11 rounded-xl";

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center bg-gradient-to-br ring-1 ring-white/10",
        style.className,
        dimensions,
        className,
      )}
    >
      <Icon className={size === "lg" ? "size-7" : size === "md" ? "size-5" : "size-4"} />
    </span>
  );
}

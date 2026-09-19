import type { Metadata } from "next";
import { FilesView } from "@/components/admin/files/files-view";

export const metadata: Metadata = {
  title: "File Manager",
};

export default function AdminFilesPage() {
  return <FilesView />;
}

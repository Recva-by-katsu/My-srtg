import type { Metadata } from "next";
import { UploadView } from "@/components/admin/upload/upload-view";

export const metadata: Metadata = {
  title: "Upload",
};

export default function AdminUploadPage() {
  return <UploadView />;
}

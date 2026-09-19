import type { Metadata } from "next";
import { StorageManager } from "@/components/admin/storage/storage-manager";

export const metadata: Metadata = {
  title: "Storage R2",
};

export default function AdminStoragePage() {
  return <StorageManager />;
}

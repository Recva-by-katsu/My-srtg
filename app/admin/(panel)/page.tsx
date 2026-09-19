import type { Metadata } from "next";
import { DashboardView } from "@/components/admin/dashboard-view";

export const metadata: Metadata = {
  title: "Ringkasan",
};

export default function AdminDashboardPage() {
  return <DashboardView />;
}

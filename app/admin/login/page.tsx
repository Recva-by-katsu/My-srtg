import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminLoginForm } from "@/components/admin/login-form";

export const metadata: Metadata = {
  title: "Login Admin",
  description: "Masuk ke dashboard admin Katsu R2 Manager.",
  robots: { index: false, follow: false },
};

function LoginFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-void px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="mx-auto h-10 w-44" />
        <Skeleton className="h-96 rounded-3xl" />
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <AdminLoginForm />
    </Suspense>
  );
}

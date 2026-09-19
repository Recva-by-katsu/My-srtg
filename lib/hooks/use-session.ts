"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, errorMessage } from "@/lib/client/api";

export interface SessionInfo {
  authenticated: boolean;
  username: string | null;
  csrfToken: string | null;
  adminConfigured: boolean;
  expiresAt?: string;
}

export interface UseSessionResult {
  session: SessionInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Reads the current admin session from `/api/auth/session`. */
export function useSession(): UseSessionResult {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SessionInfo>("/api/auth/session");
      setSession(data);
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught, "Gagal memuat sesi admin"));
      setSession({ authenticated: false, username: null, csrfToken: null, adminConfigured: true });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { session, loading, error, refresh };
}

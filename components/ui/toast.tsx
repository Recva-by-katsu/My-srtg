"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "info" | "success" | "warning" | "danger";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, "id" | "duration"> & { duration?: number }) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  info: <Info className="size-4 text-brand-300" />,
  success: <CheckCircle2 className="size-4 text-emerald-300" />,
  warning: <AlertTriangle className="size-4 text-amber-300" />,
  danger: <XCircle className="size-4 text-rose-300" />,
};

const TONE_CLASS: Record<ToastTone, string> = {
  info: "border-brand-400/30",
  success: "border-emerald-400/30",
  warning: "border-amber-400/30",
  danger: "border-rose-400/30",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ tone, title, description, duration = 5000 }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [...current.slice(-3), { id, tone, title, description, duration }]);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const store = timers.current;
    return () => {
      store.forEach((timer) => clearTimeout(timer));
      store.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
              {toasts.map((item) => (
                <div
                  key={item.id}
                  role="status"
                  className={cn(
                    "glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3.5 shadow-2xl animate-fade-up",
                    TONE_CLASS[item.tone],
                  )}
                >
                  <span className="mt-0.5 shrink-0">{ICONS[item.tone]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-white">{item.title}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{item.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
                    aria-label="Tutup notifikasi"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>");
  return context;
}

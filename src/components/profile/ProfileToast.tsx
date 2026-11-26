"use client";

import { CheckCircle2, AlertCircle, X } from "lucide-react";

export interface ProfileToastState {
  type: "success" | "error";
  message: string;
}

interface ProfileToastProps {
  toast: ProfileToastState | null;
  onDismiss: () => void;
}

export function ProfileToast({ toast, onDismiss }: ProfileToastProps) {
  if (!toast) return null;

  const isError = toast.type === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-4 sm:right-6 z-[130] max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div
        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl text-xs font-semibold ${
          isError
            ? "bg-rose-950/90 border-rose-500/40 text-rose-200"
            : "bg-[#12131A]/95 border-emerald-500/40 text-emerald-200"
        }`}
      >
        {isError ? (
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
        ) : (
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        )}
        <span className="leading-snug">{toast.message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

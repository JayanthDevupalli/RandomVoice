"use client";

import React from "react";
import Link from "next/link";
import { X, Power, ExternalLink } from "lucide-react";
import { useMaintenanceMode } from "@/hooks/useMaintenanceMode";

export function MaintenanceBanner() {
  const {
    isMaintenance,
    maintenanceData,
    isSuperAdmin,
    isUpdating,
    isDismissed,
    toggleMaintenance,
    dismiss,
    restore,
  } = useMaintenanceMode();

  // If maintenance mode is off, do not render anything
  if (!isMaintenance) {
    return null;
  }

  // Minimized state: a tiny, unobtrusive floating pill
  if (isDismissed) {
    return (
      <aside
        aria-label="Maintenance status notice"
        className="fixed bottom-4 right-4 z-50 animate-in fade-in duration-200"
      >
        <button
          onClick={restore}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/90 border border-amber-500/40 text-amber-300 text-[11px] font-semibold shadow-xl backdrop-blur-md hover:border-amber-400/80 transition-all cursor-pointer"
          title="Click to view maintenance announcement"
        >
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
          <span>Maintenance in progress</span>
        </button>
      </aside>
    );
  }

  // Slim, compact, single-row banner (works seamlessly on mobile & desktop without blocking content)
  return (
    <aside
      aria-label="Maintenance alert container"
      className="relative z-50 w-full animate-in slide-in-from-top duration-200"
    >
      {/* Top micro glow line */}
      <div className="h-[1.5px] w-full bg-gradient-to-r from-transparent via-amber-400 to-transparent" />

      <div className="w-full bg-[#18120A]/95 border-b border-amber-500/30 backdrop-blur-md text-amber-100 shadow-[0_2px_15px_rgba(245,158,11,0.12)] px-3 sm:px-4 py-1.5 sm:py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
          
          {/* Left: Beacon + Badge + Compact Message */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>

            <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
              Maintenance
            </span>

            <span className="text-[11px] sm:text-xs text-amber-100/95 font-medium truncate sm:whitespace-normal">
              {maintenanceData.message || "Platform updates in progress. Voice rooms & chats remain active!"}
            </span>
          </div>

          {/* Right: Quick Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isSuperAdmin && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggleMaintenance(false)}
                  disabled={isUpdating}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[10px] sm:text-[11px] font-bold transition-all disabled:opacity-50 cursor-pointer shadow-sm active:scale-95"
                  title="Turn off maintenance mode"
                >
                  <Power size={11} className={isUpdating ? "animate-spin" : ""} />
                  <span>Turn Off</span>
                </button>

                <Link
                  href="/admin"
                  className="p-1 rounded-md text-amber-300/70 hover:text-white transition-colors hidden sm:inline-flex"
                  title="Open Admin Console"
                >
                  <ExternalLink size={12} />
                </Link>
              </div>
            )}

            <button
              onClick={dismiss}
              className="p-1 rounded-md text-amber-300/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss notice"
              aria-label="Dismiss notice"
            >
              <X size={14} />
            </button>
          </div>

        </div>
      </div>
    </aside>
  );
}

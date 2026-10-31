"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useActiveJunction } from "@/components/providers/ActiveJunctionContext";
import { useUser } from "@/hooks/useUser";
import { Radio, X } from "lucide-react";

const JunctionRoom = dynamic(
  () => import("./JunctionRoom").then((mod) => mod.JunctionRoom),
  { ssr: false }
);

export function ActiveJunctionOverlay() {
  const {
    activeJunctionId,
    isMinimized,
    minimize,
    maximize,
    leaveJunction,
    supersededNotice,
    dismissSupersededNotice,
  } = useActiveJunction();
  const { user, isLoaded } = useUser();

  React.useEffect(() => {
    if (user?.isBanned && activeJunctionId) {
      leaveJunction();
    }
  }, [user?.isBanned, activeJunctionId, leaveJunction]);

  // Auto-dismiss the toast after 8 seconds
  React.useEffect(() => {
    if (supersededNotice) {
      const timer = setTimeout(() => {
        dismissSupersededNotice();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [supersededNotice, dismissSupersededNotice]);

  return (
    <>
      {activeJunctionId && isLoaded && user && !user.isBanned && (
        <div className={isMinimized ? "contents" : "fixed inset-0 z-[100] bg-background overflow-hidden flex flex-col"}>
          <JunctionRoom
            key={activeJunctionId}
            junctionId={activeJunctionId}
            guest={user as any}
            isMinimized={isMinimized}
            onMinimize={minimize}
            onMaximize={maximize}
            onLeave={leaveJunction}
          />
        </div>
      )}

      {supersededNotice && !activeJunctionId && (
        <div className="fixed bottom-4 sm:bottom-6 left-3 right-3 sm:left-auto sm:right-6 sm:max-w-md z-[120] pointer-events-auto pb-[env(safe-area-inset-bottom)]">
          <div className="relative bg-[#0F1017]/95 backdrop-blur-2xl border border-amber-500/35 rounded-2xl p-3.5 sm:p-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex items-start gap-3 animate-in fade-in slide-in-from-bottom-3 duration-250">
            {/* Glowing amber accent indicator */}
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <Radio size={16} className="animate-pulse" />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h4 className="text-xs font-semibold text-white tracking-wide">Session Moved</h4>
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Switched tab
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed font-light break-words">
                {supersededNotice}
              </p>
            </div>

            <button
              onClick={dismissSupersededNotice}
              className="text-slate-400 hover:text-white p-1.5 -mr-1 -mt-1 rounded-lg hover:bg-white/5 active:scale-95 transition-all shrink-0"
              title="Dismiss"
              aria-label="Dismiss"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

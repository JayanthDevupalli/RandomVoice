"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface ActiveJunctionContextType {
  activeJunctionId: string | null;
  setActiveJunctionId: (id: string | null) => void;
  isMinimized: boolean;
  setIsMinimized: (val: boolean) => void;
  minimize: () => void;
  maximize: () => void;
  leaveJunction: () => void;
}

const ActiveJunctionContext = createContext<ActiveJunctionContextType>({
  activeJunctionId: null,
  setActiveJunctionId: () => {},
  isMinimized: false,
  setIsMinimized: () => {},
  minimize: () => {},
  maximize: () => {},
  leaveJunction: () => {},
});

export function ActiveJunctionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [activeJunctionId, setActiveJunctionIdState] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const isReload = nav?.type === "reload" || (performance as any).navigation?.type === 1;
        const isJunctionPath = window.location.pathname.startsWith("/junction/");
        const stored = sessionStorage.getItem("yapclub_active_junction_id");

        // Only restore active junction if page is refreshed or user is actively on a /junction/ URL
        if (stored && (isReload || isJunctionPath)) {
          return stored;
        } else {
          sessionStorage.removeItem("yapclub_active_junction_id");
          return null;
        }
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  // Clear active junction on tab close or navigation away so stale sessions don't resurrect
  useEffect(() => {
    const handleUnload = () => {
      try {
        sessionStorage.removeItem("yapclub_active_junction_id");
      } catch {}
    };

    window.addEventListener("pagehide", handleUnload);
    return () => window.removeEventListener("pagehide", handleUnload);
  }, []);

  const setActiveJunctionId = useCallback((id: string | null) => {
    setActiveJunctionIdState(id);
    if (typeof window !== "undefined") {
      if (id) {
        sessionStorage.setItem("yapclub_active_junction_id", id);
      } else {
        sessionStorage.removeItem("yapclub_active_junction_id");
      }
    }
  }, []);

  const isMinimizingRef = React.useRef(false);

  // Minimize current active room and navigate to explorer or previous page
  const minimize = useCallback(() => {
    isMinimizingRef.current = true;
    setIsMinimized(true);
    if (pathname.startsWith("/junction/")) {
      router.push("/junctions");
    }
  }, [pathname, router]);

  // Maximize room back to full-screen stage
  const maximize = useCallback(() => {
    isMinimizingRef.current = false;
    setIsMinimized(false);
    if (activeJunctionId) {
      router.push(`/junction/${activeJunctionId}`);
    }
  }, [activeJunctionId, router]);

  // Completely leave the junction
  const leaveJunction = useCallback(() => {
    const leftId = activeJunctionId;
    isMinimizingRef.current = false;
    setActiveJunctionId(null);
    setIsMinimized(false);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("yapclub_active_junction_id");
      window.dispatchEvent(
        new CustomEvent("yapclub_junction_left", { detail: { junctionId: leftId } })
      );
    }
    if (pathname.startsWith("/junction/")) {
      router.replace("/junctions");
    }
  }, [pathname, router, setActiveJunctionId, activeJunctionId]);

  // Auto-sync minimization with current route:
  useEffect(() => {
    if (!activeJunctionId) return;

    if (!pathname.startsWith("/junction/")) {
      isMinimizingRef.current = false;
      if (!isMinimized) {
        setIsMinimized(true);
      }
    } else {
      // Whenever the user is on any junction room URL, ensure the room is un-minimized and fully visible
      if (isMinimized && !isMinimizingRef.current) {
        setIsMinimized(false);
      }
    }
  }, [pathname, activeJunctionId, isMinimized]);

  return (
    <ActiveJunctionContext.Provider
      value={{
        activeJunctionId,
        setActiveJunctionId,
        isMinimized,
        setIsMinimized,
        minimize,
        maximize,
        leaveJunction,
      }}
    >
      {children}
    </ActiveJunctionContext.Provider>
  );
}

export function useActiveJunction() {
  return useContext(ActiveJunctionContext);
}

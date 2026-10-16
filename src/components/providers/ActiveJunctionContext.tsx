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
      return sessionStorage.getItem("yapclub_active_junction_id");
    }
    return null;
  });

  const [isMinimized, setIsMinimized] = useState<boolean>(false);

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

  // Minimize current active room and navigate to explorer or previous page
  const minimize = useCallback(() => {
    setIsMinimized(true);
    if (pathname.startsWith("/junction/")) {
      router.push("/junctions");
    }
  }, [pathname, router]);

  // Maximize room back to full-screen stage
  const maximize = useCallback(() => {
    setIsMinimized(false);
    if (activeJunctionId) {
      router.push(`/junction/${activeJunctionId}`);
    }
  }, [activeJunctionId, router]);

  // Completely leave the junction
  const leaveJunction = useCallback(() => {
    setActiveJunctionId(null);
    setIsMinimized(false);
    if (pathname.startsWith("/junction/")) {
      router.push("/junctions");
    }
  }, [pathname, router, setActiveJunctionId]);

  // Auto-sync minimization with current route:
  // If user is on the active junction route, it must NOT be minimized.
  // If user navigated away from the junction route while having an active call, it should be minimized.
  useEffect(() => {
    if (!activeJunctionId) return;

    const isOnActiveJunctionPage = pathname === `/junction/${activeJunctionId}`;
    if (isOnActiveJunctionPage && isMinimized) {
      setIsMinimized(false);
    } else if (!isOnActiveJunctionPage && !isMinimized && !pathname.startsWith("/junction/")) {
      setIsMinimized(true);
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

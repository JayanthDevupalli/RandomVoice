"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

export interface LiveStats {
  totalOnline: number;
  activeRooms: number;
  totalRooms: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useLiveStats(): LiveStats {
  const [totalOnline, setTotalOnline] = useState<number>(0);
  const [activeRooms, setActiveRooms] = useState<number>(0);
  const [totalRooms, setTotalRooms] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const isMountedRef = useRef<boolean>(true);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/junctions", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return;

      const data = await res.json();
      if (isMountedRef.current && data) {
        const junctions = Array.isArray(data.junctions) ? data.junctions : [];
        const onlineCount = typeof data.totalOnline === "number"
          ? data.totalOnline
          : junctions.reduce((acc: number, j: any) => acc + (j.participants?.length || j.currentCount || 0), 0);

        const occupied = junctions.filter(
          (j: any) => (j.participants?.length || j.currentCount || 0) > 0
        ).length;

        setTotalOnline(onlineCount);
        setActiveRooms(occupied);
        setTotalRooms(junctions.length);
        setIsLoading(false);
      }
    } catch (err) {
      console.warn("Failed to fetch live stats:", err);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();

    // Set up Supabase Realtime channel for instant live updates across the whole app
    const channelId = `live_stats_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junction_participants" },
        () => {
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junctions" },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    // Tab focus / visibility change handler
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchStats();
      }
    };
    window.addEventListener("focus", fetchStats);
    document.addEventListener("visibilitychange", handleVisibility);

    // Fallback polling every 8s
    const pollInterval = setInterval(fetchStats, 8000);

    return () => {
      isMountedRef.current = false;
      clearInterval(pollInterval);
      window.removeEventListener("focus", fetchStats);
      document.removeEventListener("visibilitychange", handleVisibility);
      supabase.removeChannel(channel);
    };
  }, [fetchStats]);

  return {
    totalOnline,
    activeRooms,
    totalRooms,
    isLoading,
    refresh: fetchStats,
  };
}

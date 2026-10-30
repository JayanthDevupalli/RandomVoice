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

    // Debounce realtime events to prevent request storms
    let debounceTimer: NodeJS.Timeout | null = null;
    const triggerDebouncedFetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (isMountedRef.current) {
          fetchStats();
        }
      }, 2000);
    };

    // Instant global presence updates via WebSocket broadcast
    const presenceChannel = supabase
      .channel("junctions_global_presence_stats")
      .on("broadcast", { event: "presence_updated" }, (msg: any) => {
        const payload = msg?.payload;
        if (!payload || !isMountedRef.current) return;
        if (typeof payload.totalOnline === "number") {
          setTotalOnline(payload.totalOnline);
        }
      })
      .subscribe();

    // Set up Supabase Realtime channel for live updates across the whole app
    const channelId = `live_stats_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junction_participants" },
        () => {
          triggerDebouncedFetch();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "junctions" },
        () => {
          triggerDebouncedFetch();
        }
      )
      .subscribe();

    // Tab focus / visibility change handler
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        triggerDebouncedFetch();
      }
    };
    window.addEventListener("focus", handleVisibility);
    window.addEventListener("visibilitychange", handleVisibility);

    const handleJunctionLeft = () => {
      fetchStats();
    };
    window.addEventListener("yapclub_junction_left", handleJunctionLeft);

    // Fallback safety polling every 45s (realtime handles immediate changes)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchStats();
      }
    }, 45000);

    return () => {
      isMountedRef.current = false;
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(pollInterval);
      window.removeEventListener("focus", handleVisibility);
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("yapclub_junction_left", handleJunctionLeft);
      supabase.removeChannel(presenceChannel);
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

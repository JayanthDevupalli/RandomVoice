"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

interface GlobalPresenceContextType {
  onlineUserIds: Set<string>;
  isUserOnline: (userId?: string) => boolean;
  showOnline: boolean;
  setShowOnline: (show: boolean) => void;
}

const GlobalPresenceContext = createContext<GlobalPresenceContextType>({
  onlineUserIds: new Set(),
  isUserOnline: () => false,
  showOnline: true,
  setShowOnline: () => {},
});

export function GlobalPresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, isRegistered } = useUser();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);

  const [showOnline, setShowOnlineState] = useState<boolean>(true);

  // Sync stored preference once user is loaded
  useEffect(() => {
    if (!user?.id) return;
    const key = `yapclub_show_online_${user.id}`;
    const stored = localStorage.getItem(key);
    const profileShowOnline = (user as any)?.social_links?.show_online;
    if (stored !== null) {
      setShowOnlineState(stored === "true");
    } else if (typeof profileShowOnline === "boolean") {
      setShowOnlineState(profileShowOnline);
      localStorage.setItem(key, String(profileShowOnline));
    }
  }, [user?.id, (user as any)?.social_links?.show_online]);

  // Listen to cross-tab / window sync events
  useEffect(() => {
    const handleEvent = (e: any) => {
      if (typeof e.detail === "boolean") {
        setShowOnlineState(e.detail);
      }
    };
    window.addEventListener("yapclub_show_online_changed", handleEvent);
    return () => window.removeEventListener("yapclub_show_online_changed", handleEvent);
  }, []);

  const setShowOnline = useCallback(async (val: boolean) => {
    setShowOnlineState(val);
    if (user?.id) {
      const key = `yapclub_show_online_${user.id}`;
      try {
        localStorage.setItem(key, String(val));
      } catch (e) {}

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("yapclub_show_online_changed", { detail: val }));
      }

      // Persist to Supabase profiles.social_links
      try {
        const { data } = await supabase.from("profiles").select("social_links").eq("id", user.id).maybeSingle();
        const existingLinks = data?.social_links || {};
        await supabase.from("profiles").update({
          social_links: { ...existingLinks, show_online: val }
        }).eq("id", user.id);
      } catch (e) {
        console.error("Failed to persist show_online preference:", e);
      }
    }

    // Immediately track or untrack on the active presence channel
    if (channelRef.current) {
      try {
        if (val && user?.id) {
          await channelRef.current.track({
            user_id: user.id,
            online_at: Date.now(),
          });
        } else {
          await channelRef.current.untrack();
        }
      } catch (e) {
        console.error("Failed to update presence state on toggle:", e);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !isRegistered) {
      setOnlineUserIds(new Set());
      return;
    }

    const channelId = "global_user_presence";
    const existing = supabase.getChannels().find(
      (c) => c.topic === `realtime:${channelId}` || c.topic === channelId
    );
    if (existing) {
      supabase.removeChannel(existing);
    }
    const channel = supabase.channel(channelId, {
      config: { presence: { key: user.id } },
    });
    channelRef.current = channel;

    const updatePresenceState = () => {
      const state = channel.presenceState();
      const activeIds = new Set<string>();
      for (const key of Object.keys(state)) {
        if (key) {
          activeIds.add(key);
        }
        const presences = state[key] as any[];
        if (Array.isArray(presences)) {
          for (const p of presences) {
            if (p?.user_id) {
              activeIds.add(p.user_id);
            }
          }
        }
      }
      setOnlineUserIds(activeIds);
    };

    channel
      .on("presence", { event: "sync" }, updatePresenceState)
      .on("presence", { event: "join" }, updatePresenceState)
      .on("presence", { event: "leave" }, updatePresenceState)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (showOnline) {
            await channel.track({
              user_id: user.id,
              online_at: Date.now(),
            });
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, isRegistered, showOnline]);

  const isUserOnline = (userId?: string) => {
    if (!userId) return false;
    return onlineUserIds.has(userId);
  };

  return (
    <GlobalPresenceContext.Provider value={{ onlineUserIds, isUserOnline, showOnline, setShowOnline }}>
      {children}
    </GlobalPresenceContext.Provider>
  );
}

export function useGlobalPresence() {
  return useContext(GlobalPresenceContext);
}

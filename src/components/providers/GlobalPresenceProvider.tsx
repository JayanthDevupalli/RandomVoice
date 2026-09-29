"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";

interface GlobalPresenceContextType {
  onlineUserIds: Set<string>;
  isUserOnline: (userId?: string) => boolean;
}

const GlobalPresenceContext = createContext<GlobalPresenceContextType>({
  onlineUserIds: new Set(),
  isUserOnline: () => false,
});

export function GlobalPresenceProvider({ children }: { children: React.ReactNode }) {
  const { user, isRegistered } = useUser();
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id || !isRegistered) {
      setOnlineUserIds(new Set());
      return;
    }

    const channelId = "global_user_presence";
    const channel = supabase.channel(channelId, {
      config: { presence: { key: user.id } },
    });

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
          await channel.track({
            user_id: user.id,
            online_at: Date.now(),
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered]);

  const isUserOnline = (userId?: string) => {
    if (!userId) return false;
    return onlineUserIds.has(userId);
  };

  return (
    <GlobalPresenceContext.Provider value={{ onlineUserIds, isUserOnline }}>
      {children}
    </GlobalPresenceContext.Provider>
  );
}

export function useGlobalPresence() {
  return useContext(GlobalPresenceContext);
}

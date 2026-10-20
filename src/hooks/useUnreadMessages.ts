"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "./useUser";
import { socialService } from "@/lib/social-service";

export function useUnreadMessages() {
  const { user, isRegistered } = useUser();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const myConvIdsRef = useRef<string[]>([]);
  const lastReadMapRef = useRef<Record<string, string>>({});

  const getStorageKey = useCallback(() => {
    return user?.id ? `yapclub_last_read_${user.id}` : null;
  }, [user?.id]);

  const loadLastReadMap = useCallback((): Record<string, string> => {
    const key = getStorageKey();
    let local: Record<string, string> = {};
    if (key && typeof window !== "undefined") {
      try {
        const data = localStorage.getItem(key);
        if (data) local = JSON.parse(data);
      } catch {}
    }
    return { ...lastReadMapRef.current, ...local };
  }, [getStorageKey]);

  const saveLastReadMap = useCallback((map: Record<string, string>) => {
    lastReadMapRef.current = { ...lastReadMapRef.current, ...map };
    const key = getStorageKey();
    if (key && typeof window !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify(lastReadMapRef.current));
      } catch (e) {
        console.error("Failed to save last read map:", e);
      }
    }
    // Also sync to Supabase profile in background so it persists across incognito/devices
    if (user?.id) {
      Promise.resolve(
        supabase
          .from("profiles")
          .select("social_links")
          .eq("id", user.id)
          .maybeSingle()
      )
        .then(({ data }: any) => {
          const links = data?.social_links || {};
          return supabase
            .from("profiles")
            .update({ social_links: { ...links, last_read_map: lastReadMapRef.current } })
            .eq("id", user.id);
        })
        .catch(() => {});
    }
  }, [getStorageKey, user?.id]);

  // Recalculate unread counts
  const recalculateUnread = useCallback(async () => {
    if (!user?.id || !isRegistered) return;

    try {
      // 1. Fetch conversations the user is a member of (standard columns only to avoid 400 error)
      const { data: memberRows, error: memberErr } = await supabase
        .from("conversation_members")
        .select("conversation_id, joined_at")
        .eq("user_id", user.id);

      if (memberErr || !memberRows || memberRows.length === 0) {
        setUnreadCount(0);
        setUnreadByConversation({});
        myConvIdsRef.current = [];
        return;
      }

      const convIds = memberRows.map((r) => r.conversation_id);
      myConvIdsRef.current = convIds;

      const memberMap: Record<string, string> = {};
      for (const m of memberRows) {
        memberMap[m.conversation_id] = m.joined_at;
      }

      const lastReadMap = loadLastReadMap();
      const updatedLastReadMap = { ...lastReadMapRef.current, ...lastReadMap };

      // 2. Fetch recent messages in these conversations not sent by current user
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, conversation_id, created_at, sender_id")
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false });

      if (msgErr || !messages) return;

      // 3. Exclude messages from blocked users
      const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(user.id);
      const blockedSet = new Set([...blockedByMeIds, ...blockedMeIds]);

      const counts: Record<string, number> = {};
      let total = 0;

      // Check which conversation is actively open right now in this tab
      const activeConvId =
        typeof window !== "undefined"
          ? sessionStorage.getItem("yapclub_active_conversation")
          : null;

      for (const msg of messages) {
        // Skip messages from blocked contacts
        if (blockedSet.has(msg.sender_id)) {
          continue;
        }

        // If the user is currently viewing this exact conversation, it is active and read
        if (activeConvId && msg.conversation_id === activeConvId) {
          continue;
        }

        const msgTime = new Date(msg.created_at).getTime();
        const joinedAtMs = memberMap[msg.conversation_id]
          ? new Date(memberMap[msg.conversation_id]).getTime()
          : 0;

        const lastRead = updatedLastReadMap[msg.conversation_id];
        // Compare against stored lastRead or when user joined the conversation
        const readTime = lastRead ? new Date(lastRead).getTime() : joinedAtMs;

        if (msgTime > readTime + 1000) {
          counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
          total++;
        }
      }

      lastReadMapRef.current = updatedLastReadMap;

      setUnreadByConversation(counts);
      setUnreadCount(total);
    } catch (err) {
      console.error("Error calculating unread messages:", err);
    }
  }, [user?.id, isRegistered, loadLastReadMap]);

  // Mark a conversation as read with clock-skew compensation
  const markAsRead = useCallback(
    (conversationId: string, latestMessageTimestamp?: string) => {
      if (!conversationId || !user?.id) return;

      const currentMap = loadLastReadMap();
      const nowMs = Date.now();
      const latestMsgMs = latestMessageTimestamp
        ? new Date(latestMessageTimestamp).getTime()
        : 0;

      // Add a 15000ms safety buffer to ensure server clock drift or client time
      // does not cause viewed messages to be marked as unread
      const safeReadTimestamp = new Date(Math.max(nowMs, latestMsgMs) + 15000).toISOString();
      currentMap[conversationId] = safeReadTimestamp;
      lastReadMapRef.current = { ...lastReadMapRef.current, ...currentMap };
      saveLastReadMap(currentMap);

      // Update state optimistically and immediately zero out unread count for this conversation
      setUnreadByConversation((prev) => {
        const updated = { ...prev };
        const countForConv = updated[conversationId] || 0;
        delete updated[conversationId];
        setUnreadCount((c) => Math.max(0, c - countForConv));
        return updated;
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yapclub_messages_read", {
            detail: { conversationId, readTimestamp: safeReadTimestamp },
          })
        );
      }
    },
    [user?.id, loadLastReadMap, saveLastReadMap]
  );

  useEffect(() => {
    if (!user?.id || !isRegistered) {
      setUnreadCount(0);
      setUnreadByConversation({});
      return;
    }

    // On mount, load persistent read map from profile
    Promise.resolve(
      supabase
        .from("profiles")
        .select("social_links")
        .eq("id", user.id)
        .maybeSingle()
    )
      .then(({ data }: any) => {
        if (data?.social_links?.last_read_map) {
          const merged = { ...data.social_links.last_read_map, ...loadLastReadMap() };
          lastReadMapRef.current = merged;
          const key = getStorageKey();
          if (key && typeof window !== "undefined") {
            try {
              localStorage.setItem(key, JSON.stringify(merged));
            } catch {}
          }
        }
        recalculateUnread();
      })
      .catch(() => recalculateUnread());

    // Listen for custom read events from other components/pages/tabs
    const handleReadEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        conversationId?: string;
        readTimestamp?: string;
      }>;
      const readConvId = customEvent.detail?.conversationId;
      const readTimestamp = customEvent.detail?.readTimestamp;

      if (readConvId) {
        if (readTimestamp) {
          lastReadMapRef.current[readConvId] = readTimestamp;
        }

        setUnreadByConversation((prev) => {
          const updated = { ...prev };
          const count = updated[readConvId] || 0;
          delete updated[readConvId];
          setUnreadCount((c) => Math.max(0, c - count));
          return updated;
        });
      }
    };
    window.addEventListener("yapclub_messages_read", handleReadEvent);

    // Cross-tab synchronization via storage event
    const handleStorage = (e: StorageEvent) => {
      if (e.key === getStorageKey()) {
        recalculateUnread();
      }
    };
    window.addEventListener("storage", handleStorage);

    // Window focus sync (when tab gains focus, re-check unread status)
    const handleFocus = () => {
      recalculateUnread();
    };
    window.addEventListener("focus", handleFocus);

    // Subscribe to new incoming messages with a unique channel name to avoid collisions
    const channelId = `user_messages_${user.id}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || newMsg.sender_id === user.id) return;

          // Check if the user is currently viewing this conversation in this tab
          const activeConv = sessionStorage.getItem("yapclub_active_conversation");
          if (activeConv === newMsg.conversation_id) {
            markAsRead(newMsg.conversation_id, newMsg.created_at);
            return;
          }

          if (myConvIdsRef.current.includes(newMsg.conversation_id)) {
            setUnreadCount((prev) => prev + 1);
            setUnreadByConversation((prev) => ({
              ...prev,
              [newMsg.conversation_id]: (prev[newMsg.conversation_id] || 0) + 1,
            }));
          } else {
            // Might be a newly created conversation, refresh unread status
            recalculateUnread();
          }
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("yapclub_messages_read", handleReadEvent);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered, recalculateUnread, markAsRead, loadLastReadMap, saveLastReadMap, getStorageKey]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    const currentMap = loadLastReadMap();
    const safeReadTimestamp = new Date(Date.now() + 10000).toISOString();

    let convIds = myConvIdsRef.current;
    if (convIds.length === 0) {
      const { data } = await supabase
        .from("conversation_members")
        .select("conversation_id")
        .eq("user_id", user.id);
      if (data) {
        convIds = data.map((d: any) => d.conversation_id);
        myConvIdsRef.current = convIds;
      }
    }

    for (const convId of convIds) {
      currentMap[convId] = safeReadTimestamp;
    }
    lastReadMapRef.current = currentMap;
    saveLastReadMap(currentMap);
    setUnreadByConversation({});
    setUnreadCount(0);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("yapclub_messages_read", { detail: {} })
      );
    }
  }, [user?.id, loadLastReadMap, saveLastReadMap]);

  return {
    unreadCount,
    unreadByConversation,
    markAsRead,
    markAllAsRead,
    refreshUnread: recalculateUnread,
  };
}

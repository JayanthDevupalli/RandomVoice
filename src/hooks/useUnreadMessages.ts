"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "./useUser";

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
    if (!key || typeof window === "undefined") return {};
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }, [getStorageKey]);

  const saveLastReadMap = useCallback((map: Record<string, string>) => {
    const key = getStorageKey();
    if (!key || typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {
      console.error("Failed to save last read map:", e);
    }
  }, [getStorageKey]);

  // Recalculate unread counts
  const recalculateUnread = useCallback(async () => {
    if (!user?.id || !isRegistered) return;

    try {
      // 1. Fetch conversations the user is a member of
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

      const lastReadMap = loadLastReadMap();
      lastReadMapRef.current = lastReadMap;

      // 2. Fetch recent messages in these conversations not sent by current user
      const { data: messages, error: msgErr } = await supabase
        .from("messages")
        .select("id, conversation_id, created_at, sender_id")
        .in("conversation_id", convIds)
        .neq("sender_id", user.id)
        .order("created_at", { ascending: false });

      if (msgErr || !messages) return;

      const counts: Record<string, number> = {};
      let total = 0;

      // Check which conversation is actively open right now in this tab
      const activeConvId =
        typeof window !== "undefined"
          ? sessionStorage.getItem("yapclub_active_conversation")
          : null;

      for (const msg of messages) {
        // If the user is currently viewing this exact conversation, it is active and read
        if (activeConvId && msg.conversation_id === activeConvId) {
          continue;
        }

        const lastRead = lastReadMap[msg.conversation_id];
        if (!lastRead) {
          counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
          total++;
        } else {
          const msgTime = new Date(msg.created_at).getTime();
          const readTime = new Date(lastRead).getTime();
          // Message is unread only if created strictly after the last read timestamp
          if (msgTime > readTime) {
            counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1;
            total++;
          }
        }
      }

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

      // Add a 5000ms safety buffer to ensure any clock drift between Supabase server and user device
      // does not cause viewed messages to be marked as unread
      const safeReadTimestamp = new Date(Math.max(nowMs, latestMsgMs) + 5000).toISOString();
      currentMap[conversationId] = safeReadTimestamp;
      lastReadMapRef.current = currentMap;
      saveLastReadMap(currentMap);

      // Update state optimistically
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

    recalculateUnread();

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
          const map = loadLastReadMap();
          map[readConvId] = readTimestamp;
          lastReadMapRef.current = map;
          saveLastReadMap(map);
        }

        setUnreadByConversation((prev) => {
          const updated = { ...prev };
          const count = updated[readConvId] || 0;
          delete updated[readConvId];
          setUnreadCount((c) => Math.max(0, c - count));
          return updated;
        });
      }
      recalculateUnread();
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

  return {
    unreadCount,
    unreadByConversation,
    markAsRead,
    refreshUnread: recalculateUnread,
  };
}

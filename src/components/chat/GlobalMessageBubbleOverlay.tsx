"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  X, 
  Send, 
  MessageSquare, 
  Maximize2, 
  Minimize2, 
  Loader2,
  Smile,
  Check,
  CheckCheck
} from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { supabase } from "@/lib/supabase";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useGlobalPresence } from "@/components/providers/GlobalPresenceProvider";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { 
  parseMessageContent, 
  serializeTextMessage, 
  getProfileDisplayName, 
  formatChatDateDivider,
  getSenderColor,
  toggleReactionInContent,
} from "@/lib/chat-utils";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { RoomInviteCard } from "@/components/chat/RoomInviteCard";
import { WhatsAppImageCluster } from "@/components/chat/WhatsAppImageCluster";
import { MediaLightbox, LightboxMediaItem } from "@/components/chat/MediaLightbox";
import { QuickReactionPicker, ReactionBadges } from "@/components/chat/MessageReactions";

interface IncomingNotification {
  id: string;
  conversationId: string;
  conversationName?: string;
  conversationType: "direct" | "group";
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderAvatar: string;
  previewText: string;
  type: "text" | "voice" | "room_invite" | "gif" | "images";
  createdAt: string;
}

interface QuickChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar: string;
    social_links?: any;
  };
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(830.61, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {}
}

export function GlobalMessageBubbleOverlay() {
  const { user, isRegistered } = useUser();
  const { onlineUserIds } = useGlobalPresence();
  const { markAsRead, unreadByConversation } = useUnreadMessages();
  const router = useRouter();
  const pathname = usePathname();

  // Active Chat Head Notifications list - A separate bubble for each user/conversation!
  const [notifications, setNotifications] = useState<IncomingNotification[]>([]);
  // Preview speech snippet pill active map: conversationId -> boolean
  const [activeSnippets, setActiveSnippets] = useState<Record<string, boolean>>({});
  // Currently open Quick Reply Drawer conversationId, or null if all bubbles are minimized
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(null);

  // Quick Reply Drawer State
  const [drawerMessages, setDrawerMessages] = useState<QuickChatMessage[]>([]);
  const [drawerInput, setDrawerInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lightbox & Reaction states for rich media previews in drawer
  const [lightboxImages, setLightboxImages] = useState<LightboxMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxMessageId, setLightboxMessageId] = useState<string | null>(null);
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);

  // Cleared chats map to ensure cleared messages don't reappear in popup drawer
  const [clearedChatsMap, setClearedChatsMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    const storageKey = `yapclub_cleared_chats_${user.id}`;
    let localMap: Record<string, string> = {};
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored) localMap = JSON.parse(stored);
      } catch {}
    }
    setClearedChatsMap(localMap);

    const remoteMap = (user as any)?.social_links?.cleared_chats_map || {};
    const merged = { ...remoteMap, ...localMap };
    setClearedChatsMap(merged);
  }, [user?.id, (user as any)?.social_links?.cleared_chats_map]);

  // Helper to get formatted message preview
  const getMessagePreview = (content: string): { preview: string; type: "text" | "voice" | "room_invite" | "gif" | "images" } => {
    const parsed = parseMessageContent(content);
    if (parsed.type === "voice") {
      return { preview: "🎵 Voice Note", type: "voice" };
    }
    if (parsed.type === "gif") {
      return { preview: "🖼️ GIF", type: "gif" };
    }
    if (parsed.type === "images" && parsed.images && parsed.images.length > 0) {
      const count = parsed.images.length;
      const caption = parsed.text ? `: ${parsed.text}` : "";
      return { preview: `📷 Photo${count > 1 ? `s (${count})` : ""}${caption}`, type: "images" };
    }
    if (parsed.type === "room_invite") {
      return { preview: `🎙️ Room Invite: ${parsed.roomInvite?.junctionName || "Hangout"}`, type: "room_invite" };
    }
    return { preview: parsed.text || "New message", type: "text" };
  };

  // Toggle reaction in drawer message
  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!user?.id) return;
    const targetMsg = drawerMessages.find((m) => m.id === messageId);
    if (!targetMsg) return;

    const dName = getProfileDisplayName(user, user.username || "You");
    const { newContent } = toggleReactionInContent(targetMsg.content, {
      emoji,
      userId: user.id,
      username: user.username,
      displayName: dName,
    });

    setDrawerMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
    );
    setActiveReactionPickerMsgId(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/messages/reactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          messageId,
          emoji,
          userId: user.id,
          username: user.username,
          displayName: dName,
        }),
      });
    } catch (e) {
      console.error("Failed to toggle reaction in popup drawer:", e);
    }
  };

  // Broadcast real-time read receipt to conversation presence channel
  const broadcastSeenReceipt = useCallback((convId: string, timestamp?: string) => {
    if (!convId || !user?.id) return;
    try {
      const channel = supabase.channel(`conversation_presence_${convId}`);
      channel.send({
        type: "broadcast",
        event: "read_receipt",
        payload: {
          user_id: user.id,
          conversation_id: convId,
          read_at: timestamp || new Date().toISOString(),
        },
      });
    } catch {}
  }, [user?.id]);

  // Automatically dismiss or suppress floating popups when user is in /messages
  useEffect(() => {
    if (pathname?.startsWith("/messages")) {
      setNotifications([]);
      setActiveDrawerId(null);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    }
  }, [pathname]);

  // Handle marking conversation as read when drawer is open
  useEffect(() => {
    if (!activeDrawerId || !user?.id) {
      if (typeof window !== "undefined" && !activeDrawerId) {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
      return;
    }

    const convId = activeDrawerId;
    const currentNotif = notifications.find((n) => n.conversationId === convId);
    const nowIso = new Date().toISOString();

    // 1. Mark as active in sessionStorage so useUnreadMessages doesn't count incoming messages as unread
    if (typeof window !== "undefined") {
      sessionStorage.setItem("yapclub_active_conversation", convId);
    }

    // 2. Clear unread count via hook
    markAsRead(convId, currentNotif?.createdAt || nowIso);

    // 3. Broadcast real-time seen receipt
    broadcastSeenReceipt(convId, currentNotif?.createdAt || nowIso);

    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    };
  }, [activeDrawerId, user?.id, markAsRead, broadcastSeenReceipt, notifications]);

  // Listen to new incoming messages sitewide
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    // Realtime listener on messages table
    const channelId = `global_msg_bubble_${user.id}_${Math.random().toString(36).substring(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const newMsg = payload.new as any;
          if (!newMsg || newMsg.sender_id === user.id) return;

          // If user is currently on /messages, suppress pop-up (they already have full messenger)
          if (pathname?.startsWith("/messages")) {
            return;
          }

          // If the user already has this exact conversation open in InRoomMessenger or Drawer, mark as read
          const activeConv = typeof window !== "undefined"
            ? sessionStorage.getItem("yapclub_active_conversation")
            : null;

          if (activeConv === newMsg.conversation_id && activeDrawerId === newMsg.conversation_id) {
            markAsRead(newMsg.conversation_id, newMsg.created_at);
            broadcastSeenReceipt(newMsg.conversation_id, newMsg.created_at);

            // If drawer is currently open for this conversation, append to list
            setDrawerMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            return;
          }

          // Fetch sender profile & conversation details
          const [{ data: prof }, { data: conv }] = await Promise.all([
            supabase
              .from("profiles")
              .select("id, username, avatar, social_links")
              .eq("id", newMsg.sender_id)
              .maybeSingle(),
            supabase
              .from("conversations")
              .select("id, type, name")
              .eq("id", newMsg.conversation_id)
              .maybeSingle(),
          ]);

          const senderDisplayName = getProfileDisplayName(prof, prof?.username || "Someone");
          const { preview, type } = getMessagePreview(newMsg.content);

          const notif: IncomingNotification = {
            id: newMsg.id,
            conversationId: newMsg.conversation_id,
            conversationName: conv?.name || undefined,
            conversationType: conv?.type || "direct",
            senderId: newMsg.sender_id,
            senderUsername: prof?.username || "user",
            senderDisplayName,
            senderAvatar: prof?.avatar || "zap",
            previewText: preview,
            type,
            createdAt: newMsg.created_at,
          };

          // For every user message there should be new bubble pop up!
          // Add or bump to top of bubble stack (support multiple simultaneous user bubbles)
          setNotifications((prev) => {
            const filtered = prev.filter((n) => n.conversationId !== notif.conversationId);
            return [notif, ...filtered].slice(0, 5);
          });

          // Show preview speech snippet bubble pill for this specific message
          setActiveSnippets((prev) => ({ ...prev, [notif.conversationId]: true }));
          playNotificationChime();

          // Auto-hide preview snippet after 6 seconds, keeping the compact circular bubble
          setTimeout(() => {
            setActiveSnippets((prev) => ({ ...prev, [notif.conversationId]: false }));
          }, 6000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered, pathname, activeDrawerId, markAsRead, broadcastSeenReceipt]);

  // Load message history when Quick Reply Drawer opens
  useEffect(() => {
    if (!activeDrawerId) return;

    let isMounted = true;
    setIsLoadingMessages(true);

    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from("messages")
          .select(`
            id,
            conversation_id,
            sender_id,
            content,
            created_at,
            profiles (
              username,
              avatar,
              social_links
            )
          `)
          .eq("conversation_id", activeDrawerId)
          .order("created_at", { ascending: true })
          .limit(30);

        if (!error && data && isMounted) {
          const clearedIso = clearedChatsMap[activeDrawerId];
          const clearedMs = clearedIso ? new Date(clearedIso).getTime() : 0;
          const visibleRows = clearedMs
            ? data.filter((m: any) => new Date(m.created_at).getTime() > clearedMs)
            : data;

          const formatted = visibleRows.map((m: any) => ({
            ...m,
            profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
          }));
          setDrawerMessages(formatted);

          // Mark latest message as read in hook & database
          if (formatted.length > 0) {
            const latest = formatted[formatted.length - 1];
            markAsRead(activeDrawerId, latest.created_at);
            broadcastSeenReceipt(activeDrawerId, latest.created_at);
          }
        }
      } catch (e) {
        console.error("Failed to load quick reply messages:", e);
      } finally {
        if (isMounted) setIsLoadingMessages(false);
      }
    };

    loadMessages();

    // Auto-focus input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 200);

    return () => {
      isMounted = false;
    };
  }, [activeDrawerId, markAsRead, broadcastSeenReceipt, clearedChatsMap]);

  // Scroll to bottom when messages change in drawer
  useEffect(() => {
    if (activeDrawerId) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [drawerMessages, activeDrawerId]);

  // Handle Quick Reply Send
  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerInput.trim() || !user?.id || !activeDrawerId || isSending) return;

    const convId = activeDrawerId;
    const textToSend = drawerInput.trim();
    setDrawerInput("");
    setIsSending(true);

    const serialized = serializeTextMessage(textToSend);
    const tempId = `temp_${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Optimistic local update
    const optimisticMsg: QuickChatMessage = {
      id: tempId,
      conversation_id: convId,
      sender_id: user.id,
      content: serialized,
      created_at: nowIso,
      profiles: {
        username: user.username,
        avatar: user.avatar,
        social_links: (user as any).social_links || (user as any).socialLinks,
      },
    };
    setDrawerMessages((prev) => [...prev, optimisticMsg]);

    // Mark as read immediately
    markAsRead(convId, nowIso);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: convId,
          sender_id: user.id,
          content: serialized,
        })
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          profiles (
            username,
            avatar,
            social_links
          )
        `)
        .single();

      if (error) {
        console.error("Failed to send quick reply message:", error);
      } else if (data) {
        setDrawerMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...data, profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles } : m))
        );
      }

      // Update conversation last_message_at
      await supabase
        .from("conversations")
        .update({ last_message_at: nowIso })
        .eq("id", convId);

    } catch (err) {
      console.error("Quick send exception:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Open Full Page Chat
  const handleOpenFullChat = () => {
    if (!activeDrawerId) return;
    const convId = activeDrawerId;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("yapclub_active_conversation");
    }
    setActiveDrawerId(null);
    setNotifications((prev) => prev.filter((n) => n.conversationId !== convId));
    router.push(`/messages?conversation=${convId}`);
  };

  // If user is currently on /messages page, do not render overlay at all
  if (pathname?.startsWith("/messages") || notifications.length === 0) {
    return null;
  }

  const currentNotification = notifications.find((n) => n.conversationId === activeDrawerId) || null;
  const isSenderOnline = currentNotification ? onlineUserIds.has(currentNotification.senderId) : false;

  return (
    <div className="fixed z-[110] pointer-events-auto select-none">
      {/* ========================================================
          1. FLOATING CHAT HEAD BUBBLE STACK (Upper / Middle Right Side)
             - For every user message there is a new bubble pop up!
          ======================================================== */}
      <div className="fixed top-24 right-4 sm:top-28 sm:right-6 z-[110] flex flex-col items-end gap-3 pointer-events-auto">
        {notifications.map((notif) => {
          const isSenderOnline = onlineUserIds.has(notif.senderId);
          const bubbleUnreadCount = unreadByConversation[notif.conversationId] || 0;
          const isSnippetVisible = activeSnippets[notif.conversationId];
          const isThisDrawerOpen = activeDrawerId === notif.conversationId;

          return (
            <div
              key={notif.conversationId}
              className="flex items-center gap-2.5 animate-in slide-in-from-right-4 fade-in duration-200"
            >
              {/* Animated Message Sneak-Peek Snippet Pill (Left of Avatar) */}
              {isSnippetVisible && (
                <div
                  onClick={() => {
                    setActiveDrawerId(notif.conversationId);
                    setActiveSnippets((prev) => ({ ...prev, [notif.conversationId]: false }));
                  }}
                  className="max-w-[210px] sm:max-w-[260px] p-2.5 px-3 bg-[#11121C]/95 hover:bg-[#151724] border border-white/15 hover:border-indigo-500/40 rounded-2xl shadow-2xl backdrop-blur-2xl flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 group text-left"
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                      {notif.senderDisplayName}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono shrink-0">Just now</span>
                  </div>
                  {notif.conversationType === "group" && (
                    <span className="text-[9px] text-indigo-400 font-semibold truncate mb-0.5">
                      in {notif.conversationName || "Group"}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-300 truncate line-clamp-1">
                    {notif.previewText}
                  </span>
                </div>
              )}

              {/* Circular Chat Head Avatar (Guaranteed Fixed Dimensions 56x56px) */}
              <div className="relative group/bubble shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeDrawerId === notif.conversationId) {
                      setActiveDrawerId(null);
                    } else {
                      setActiveDrawerId(notif.conversationId);
                      setActiveSnippets((prev) => ({ ...prev, [notif.conversationId]: false }));
                    }
                  }}
                  style={{
                    width: "56px",
                    height: "56px",
                    minWidth: "56px",
                    minHeight: "56px",
                    maxWidth: "56px",
                    maxHeight: "56px",
                  }}
                  className={`group relative w-14 h-14 min-w-[56px] min-h-[56px] max-w-[56px] max-h-[56px] rounded-full bg-[#12131D] border-2 shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer p-0.5 shrink-0 overflow-visible ${
                    isThisDrawerOpen ? "border-indigo-400 ring-2 ring-indigo-500/40 shadow-indigo-500/20" : "border-indigo-500"
                  }`}
                  title={`${notif.senderDisplayName}: ${notif.previewText}`}
                >
                  {/* Glowing Ping Ring when snippet is active */}
                  {isSnippetVisible && (
                    <span className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping pointer-events-none" />
                  )}

                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      minWidth: "48px",
                      minHeight: "48px",
                      maxWidth: "48px",
                      maxHeight: "48px",
                    }}
                    className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 shrink-0 aspect-square flex items-center justify-center pointer-events-none"
                  >
                    {notif.senderAvatar.startsWith("http") ? (
                      <img
                        src={notif.senderAvatar}
                        alt={notif.senderDisplayName}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        className="w-full h-full object-cover block"
                      />
                    ) : (
                      <UserAvatar avatar={notif.senderAvatar} size="md" className="!w-full !h-full" />
                    )}
                  </div>

                  {/* Online Green Presence Dot */}
                  {isSenderOnline && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#12131D]" />
                  )}

                  {/* Live Synchronized Unread Counter Badge */}
                  {bubbleUnreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full bg-indigo-600 text-[10px] font-black text-white border-2 border-[#12131D] shadow-md animate-bounce pointer-events-none">
                      {bubbleUnreadCount > 9 ? "9+" : bubbleUnreadCount}
                    </span>
                  )}
                </button>

                {/* Close 'X' pill above bubble */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setNotifications((prev) => prev.filter((n) => n.conversationId !== notif.conversationId));
                    if (activeDrawerId === notif.conversationId) {
                      setActiveDrawerId(null);
                    }
                  }}
                  className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-black/90 text-slate-400 hover:text-white hover:bg-rose-600 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover/bubble:opacity-100 transition-opacity border border-white/20 cursor-pointer shadow-md z-20"
                  title="Dismiss bubble"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================
          2. QUICK REPLY MINI-CHAT MESSAGE BOX (Upper / Middle Right)
          ======================================================== */}
      {activeDrawerId && currentNotification && (
        <div
          style={{
            maxWidth: "380px",
          }}
          className="fixed inset-x-3 top-20 sm:inset-x-auto sm:top-24 sm:right-24 w-auto sm:w-[380px] bg-[#10111A]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col z-[120] max-h-[80vh] h-[520px] animate-in fade-in slide-in-from-top-4 duration-200 overflow-hidden"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/25 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  minWidth: "36px",
                  minHeight: "36px",
                  maxWidth: "36px",
                  maxHeight: "36px",
                }}
                className="relative w-9 h-9 min-w-[36px] min-h-[36px] max-w-[36px] max-h-[36px] rounded-full overflow-hidden bg-slate-800 border border-white/15 shrink-0 aspect-square"
              >
                {currentNotification.senderAvatar.startsWith("http") ? (
                  <img
                    src={currentNotification.senderAvatar}
                    alt={currentNotification.senderDisplayName}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    className="w-full h-full object-cover block"
                  />
                ) : (
                  <UserAvatar avatar={currentNotification.senderAvatar} size="sm" className="!w-full !h-full" />
                )}
                {isSenderOnline && (
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#10111A]" />
                )}
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white truncate">
                  {currentNotification.senderDisplayName}
                </span>
                <span className="text-[10px] text-slate-400 truncate">
                  {currentNotification.conversationType === "group"
                    ? `Group: ${currentNotification.conversationName || "Chat"}`
                    : isSenderOnline ? "Online" : "Offline"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleOpenFullChat}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Open in full messenger"
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setActiveDrawerId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Minimize to bubble"
              >
                <Minimize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNotifications((prev) => prev.filter((n) => n.conversationId !== activeDrawerId));
                  setActiveDrawerId(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 min-h-0 divide-y-0">
            {isLoadingMessages ? (
              <div className="flex items-center justify-center h-48 text-slate-400 text-xs gap-2">
                <Loader2 size={16} className="animate-spin text-indigo-400" />
                <span>Loading messages...</span>
              </div>
            ) : drawerMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 text-xs px-4">
                <MessageSquare size={24} className="text-slate-600 mb-2" />
                <span>No messages yet. Send a quick reply below!</span>
              </div>
            ) : (
              drawerMessages.map((msg, index) => {
                const isMe = msg.sender_id === user?.id;
                const parsed = parseMessageContent(msg.content);
                const prevMsg = index > 0 ? drawerMessages[index - 1] : null;
                const isNewDay = !prevMsg || new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();
                const dateLabel = formatChatDateDivider(msg.created_at);
                const isSameSenderAsPrev = !isNewDay && prevMsg && prevMsg.sender_id === msg.sender_id;
                const isFirstInCluster = !isSameSenderAsPrev;
                const senderDisplayName = isMe
                  ? "You"
                  : getProfileDisplayName(msg.profiles, "Someone");

                return (
                  <React.Fragment key={msg.id}>
                    {isNewDay && (
                      <div className="flex justify-center my-1 select-none pointer-events-none">
                        <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-semibold text-slate-400">
                          {dateLabel}
                        </span>
                      </div>
                    )}

                    <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} ${isFirstInCluster ? "mt-2" : "mt-0.5"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm break-words ${
                          isMe
                            ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-xs"
                            : `bg-white/10 text-slate-100 border border-white/5 ${isFirstInCluster ? "rounded-tl-xs" : ""}`
                        }`}
                      >
                        {/* WhatsApp-Style Group Chat Sender Name inside bubble */}
                        {!isMe && currentNotification.conversationType === "group" && isFirstInCluster && (
                          <div className="mb-1 select-none pointer-events-none">
                            <span className={`text-[11px] font-bold tracking-tight truncate block ${getSenderColor(senderDisplayName)}`}>
                              {senderDisplayName}
                            </span>
                          </div>
                        )}
                        {parsed.type === "room_invite" && parsed.roomInvite ? (
                          <RoomInviteCard invite={parsed.roomInvite} isMe={isMe} />
                        ) : parsed.type === "voice" ? (
                          <VoiceNotePlayer audioUrl={parsed.audioUrl || ""} duration={parsed.duration} isMe={isMe} />
                        ) : parsed.type === "images" && parsed.images && parsed.images.length > 0 ? (
                          <div className="my-0.5">
                            <WhatsAppImageCluster
                              images={parsed.images}
                              conversationId={currentNotification.conversationId}
                              caption={parsed.text}
                              isMe={isMe}
                              onOpenLightbox={(imgs, idx) => {
                                setLightboxImages(imgs);
                                setLightboxIndex(idx);
                                setLightboxMessageId(msg.id);
                                setIsLightboxOpen(true);
                              }}
                              onOpenReactionPicker={() => setActiveReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id))}
                              onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                              timestamp={new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            />
                          </div>
                        ) : parsed.type === "gif" && parsed.gifUrl ? (
                          <div className="relative rounded-xl overflow-hidden max-w-[220px] bg-black/40 group/gif my-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id));
                              }}
                              className="absolute top-1.5 right-1.5 z-20 p-1 rounded-full bg-black/60 hover:bg-black/85 text-white/80 hover:text-amber-300 border border-white/15 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg flex items-center justify-center opacity-85 hover:opacity-100"
                              title="React to GIF"
                            >
                              <Smile size={12} />
                            </button>
                            <img
                              src={parsed.gifUrl}
                              alt={parsed.gifTitle || "GIF"}
                              className="w-full h-auto max-h-[160px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                              onClick={() => {
                                setLightboxImages([{ url: parsed.gifUrl!, title: parsed.gifTitle || "GIF" }]);
                                setLightboxIndex(0);
                                setLightboxMessageId(msg.id);
                                setIsLightboxOpen(true);
                              }}
                            />
                            <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[8px] font-black text-white/90 border border-white/10 pointer-events-none tracking-wider">
                              GIF
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{parsed.text || msg.content}</p>
                        )}

                        {/* Timestamp & Sent ticks */}
                        {parsed.type !== "images" && (
                          <div
                            className={`text-[9px] mt-1 flex items-center gap-1 select-none ${
                              isMe ? "text-indigo-200/70 justify-end" : "text-slate-400 justify-end"
                            }`}
                          >
                            {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {isMe && (
                              <span className="inline-flex items-center ml-0.5">
                                <CheckCheck size={11} className="stroke-[1.8] text-indigo-200/70" />
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reaction Badges */}
                        <div className="mt-1">
                          <ReactionBadges
                            reactions={parsed.reactions}
                            currentUserId={user?.id}
                            onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                            isMe={isMe}
                          />
                        </div>

                        {/* Floating Quick Reaction Picker */}
                        {activeReactionPickerMsgId === msg.id && (
                          <div className={`relative mt-1 z-30 ${isMe ? "self-end" : "self-start"}`}>
                            <QuickReactionPicker
                              onSelect={(emoji) => {
                                handleToggleReaction(msg.id, emoji);
                              }}
                              onClose={() => setActiveReactionPickerMsgId(null)}
                              isMe={isMe}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Reply Input Bar */}
          <form
            onSubmit={handleQuickSend}
            className="p-2.5 bg-black/40 border-t border-white/10 flex items-center gap-2 shrink-0"
          >
            <input
              ref={inputRef}
              type="text"
              value={drawerInput}
              onChange={(e) => setDrawerInput(e.target.value)}
              placeholder={`Reply to ${currentNotification.senderDisplayName}...`}
              className="flex-1 bg-white/5 border border-white/10 focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!drawerInput.trim() || isSending}
              className="w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md"
              title="Send reply"
            >
              {isSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}

      {/* Lightbox for Pop-up Media Viewing */}
      {isLightboxOpen && (
        <MediaLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          onClose={() => {
            setIsLightboxOpen(false);
            setLightboxImages([]);
            setLightboxMessageId(null);
          }}
          onToggleReaction={lightboxMessageId ? (emoji) => handleToggleReaction(lightboxMessageId, emoji) : undefined}
          reactions={
            lightboxMessageId
              ? parseMessageContent(drawerMessages.find((m) => m.id === lightboxMessageId)?.content || "").reactions
              : undefined
          }
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}

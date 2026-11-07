"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { 
  X, 
  Send, 
  MessageSquare, 
  Maximize2, 
  Minimize2, 
  Loader2
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
} from "@/lib/chat-utils";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { RoomInviteCard } from "@/components/chat/RoomInviteCard";

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
  type: "text" | "voice" | "room_invite" | "gif";
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

  // State: "hidden" | "bubble" | "drawer"
  const [viewState, setViewState] = useState<"hidden" | "bubble" | "drawer">("hidden");
  const [currentNotification, setCurrentNotification] = useState<IncomingNotification | null>(null);
  const [showPreviewSnippet, setShowPreviewSnippet] = useState(false);

  // Quick Reply Drawer State
  const [drawerMessages, setDrawerMessages] = useState<QuickChatMessage[]>([]);
  const [drawerInput, setDrawerInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const snippetTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to get formatted message preview
  const getMessagePreview = (content: string): { preview: string; type: "text" | "voice" | "room_invite" | "gif" } => {
    const parsed = parseMessageContent(content);
    if (parsed.type === "voice") {
      return { preview: "🎵 Voice Note", type: "voice" };
    }
    if (parsed.type === "gif") {
      return { preview: "🖼️ GIF", type: "gif" };
    }
    if (parsed.type === "room_invite") {
      return { preview: `🎙️ Room Invite: ${parsed.roomInvite?.junctionName || "Hangout"}`, type: "room_invite" };
    }
    return { preview: parsed.text || "New message", type: "text" };
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
      setViewState("hidden");
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    }
  }, [pathname]);

  // Handle marking conversation as read when drawer is open
  useEffect(() => {
    if (viewState !== "drawer" || !currentNotification?.conversationId || !user?.id) {
      if (typeof window !== "undefined" && viewState !== "drawer") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
      return;
    }

    const convId = currentNotification.conversationId;
    const nowIso = new Date().toISOString();

    // 1. Mark as active in sessionStorage so useUnreadMessages doesn't count incoming messages as unread
    if (typeof window !== "undefined") {
      sessionStorage.setItem("yapclub_active_conversation", convId);
    }

    // 2. Clear unread count via hook (updates local state, profile, and conversation_members table)
    markAsRead(convId, currentNotification.createdAt || nowIso);

    // 3. Broadcast real-time seen receipt
    broadcastSeenReceipt(convId, currentNotification.createdAt || nowIso);

    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    };
  }, [viewState, currentNotification?.conversationId, user?.id, markAsRead, broadcastSeenReceipt, currentNotification?.createdAt]);

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

          if (activeConv === newMsg.conversation_id) {
            markAsRead(newMsg.conversation_id, newMsg.created_at);
            broadcastSeenReceipt(newMsg.conversation_id, newMsg.created_at);

            // If drawer is currently open for this conversation, append to list
            if (viewState === "drawer" && currentNotification?.conversationId === newMsg.conversation_id) {
              setDrawerMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
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

          setCurrentNotification(notif);
          playNotificationChime();

          // User requested: Directly show as a bubble first on upper/middle right side
          setViewState("bubble");
          setShowPreviewSnippet(true);

          // Hide preview speech snippet after 6 seconds, keeping the compact circular bubble
          if (snippetTimeoutRef.current) clearTimeout(snippetTimeoutRef.current);
          snippetTimeoutRef.current = setTimeout(() => {
            setShowPreviewSnippet(false);
          }, 6000);
        }
      )
      .subscribe();

    return () => {
      if (snippetTimeoutRef.current) clearTimeout(snippetTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered, pathname, viewState, currentNotification?.conversationId, markAsRead, broadcastSeenReceipt]);

  // Load message history when Quick Reply Drawer opens
  useEffect(() => {
    if (viewState !== "drawer" || !currentNotification?.conversationId) return;

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
          .eq("conversation_id", currentNotification.conversationId)
          .order("created_at", { ascending: true })
          .limit(30);

        if (!error && data && isMounted) {
          const formatted = data.map((m: any) => ({
            ...m,
            profiles: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles,
          }));
          setDrawerMessages(formatted);

          // Mark latest message as read in hook & database
          if (formatted.length > 0) {
            const latest = formatted[formatted.length - 1];
            markAsRead(currentNotification.conversationId, latest.created_at);
            broadcastSeenReceipt(currentNotification.conversationId, latest.created_at);
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
  }, [viewState, currentNotification?.conversationId, markAsRead, broadcastSeenReceipt]);

  // Scroll to bottom when messages change in drawer
  useEffect(() => {
    if (viewState === "drawer") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [drawerMessages, viewState]);

  // Handle Quick Reply Send
  const handleQuickSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawerInput.trim() || !user?.id || !currentNotification?.conversationId || isSending) return;

    const textToSend = drawerInput.trim();
    setDrawerInput("");
    setIsSending(true);

    const serialized = serializeTextMessage(textToSend);
    const tempId = `temp_${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Optimistic local update
    const optimisticMsg: QuickChatMessage = {
      id: tempId,
      conversation_id: currentNotification.conversationId,
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
    markAsRead(currentNotification.conversationId, nowIso);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: currentNotification.conversationId,
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
        .eq("id", currentNotification.conversationId);

    } catch (err) {
      console.error("Quick send exception:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Open Full Page Chat
  const handleOpenFullChat = () => {
    if (!currentNotification?.conversationId) return;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("yapclub_active_conversation");
    }
    setViewState("hidden");
    router.push(`/messages?conversation=${currentNotification.conversationId}`);
  };

  // If user is currently on /messages page, do not render overlay at all
  if (pathname?.startsWith("/messages") || viewState === "hidden" || !currentNotification) {
    return null;
  }

  const isSenderOnline = onlineUserIds.has(currentNotification.senderId);
  const bubbleUnreadCount = unreadByConversation[currentNotification.conversationId] || 0;

  return (
    <div className="fixed z-[110] pointer-events-auto select-none">
      {/* ========================================================
          1. FLOATING CHAT HEAD BUBBLE (Upper / Middle Right Side)
          ======================================================== */}
      {viewState === "bubble" && (
        <div className="fixed top-24 right-4 sm:top-28 sm:right-6 z-[110] flex items-center gap-2.5 animate-in slide-in-from-right-4 fade-in duration-200">
          {/* Animated Message Sneak-Peek Snippet Pill (Left of Avatar) */}
          {showPreviewSnippet && (
            <div
              onClick={() => setViewState("drawer")}
              className="max-w-[210px] sm:max-w-[260px] p-2.5 px-3 bg-[#11121C]/95 hover:bg-[#151724] border border-white/15 hover:border-indigo-500/40 rounded-2xl shadow-2xl backdrop-blur-2xl flex flex-col cursor-pointer transition-all hover:scale-105 active:scale-95 group text-left"
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[11px] font-bold text-white truncate group-hover:text-indigo-300 transition-colors">
                  {currentNotification.senderDisplayName}
                </span>
                <span className="text-[9px] text-slate-400 font-mono shrink-0">Just now</span>
              </div>
              {currentNotification.conversationType === "group" && (
                <span className="text-[9px] text-indigo-400 font-semibold truncate mb-0.5">
                  in {currentNotification.conversationName || "Group"}
                </span>
              )}
              <span className="text-[11px] text-slate-300 truncate line-clamp-1">
                {currentNotification.previewText}
              </span>
            </div>
          )}

          {/* Circular Chat Head Avatar (Guaranteed Fixed Dimensions 56x56px) */}
          <div className="relative group/bubble shrink-0">
            <button
              type="button"
              onClick={() => setViewState("drawer")}
              style={{
                width: "56px",
                height: "56px",
                minWidth: "56px",
                minHeight: "56px",
                maxWidth: "56px",
                maxHeight: "56px",
              }}
              className="group relative w-14 h-14 min-w-[56px] min-h-[56px] max-w-[56px] max-h-[56px] rounded-full bg-[#12131D] border-2 border-indigo-500 shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer p-0.5 shrink-0 overflow-visible"
              title={`${currentNotification.senderDisplayName}: ${currentNotification.previewText}`}
            >
              {/* Glowing Ping Ring */}
              <span className="absolute inset-0 rounded-full bg-indigo-500/30 animate-ping pointer-events-none" />

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
                  <UserAvatar avatar={currentNotification.senderAvatar} size="md" className="!w-full !h-full" />
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
                setViewState("hidden");
              }}
              className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-black/90 text-slate-400 hover:text-white hover:bg-rose-600 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover/bubble:opacity-100 transition-opacity border border-white/20 cursor-pointer shadow-md z-20"
              title="Dismiss"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================
          2. QUICK REPLY MINI-CHAT MESSAGE BOX (Upper / Middle Right)
          ======================================================== */}
      {viewState === "drawer" && (
        <div
          style={{
            maxWidth: "380px",
          }}
          className="fixed inset-x-3 top-20 sm:inset-x-auto sm:top-24 sm:right-6 w-auto sm:w-[380px] bg-[#10111A]/95 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl flex flex-col z-[120] max-h-[80vh] h-[520px] animate-in fade-in slide-in-from-top-4 duration-200 overflow-hidden"
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Open in full messenger"
              >
                <Maximize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewState("bubble")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                title="Minimize to bubble"
              >
                <Minimize2 size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewState("hidden")}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
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
                        ) : (
                          <p className="whitespace-pre-wrap">{parsed.text || msg.content}</p>
                        )}

                        <div
                          className={`text-[9px] mt-1 flex items-center gap-1 select-none ${
                            isMe ? "text-indigo-200/70 justify-end" : "text-slate-400 justify-end"
                          }`}
                        >
                          {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                          <span>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
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
    </div>
  );
}

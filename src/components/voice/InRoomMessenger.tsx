"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  MessageCircle,
  X,
  Minus,
  ArrowLeft,
  Send,
  Search,
  Sparkles,
} from "lucide-react";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { parseMessageContent } from "@/lib/chat-utils";

interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ConversationSummary {
  id: string;
  type: string;
  name: string | null;
  last_message_at: string;
  other_user?: {
    id: string;
    username: string;
    avatar: string;
  };
}

interface InRoomMessengerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function InRoomMessenger({ isOpen, onClose }: InRoomMessengerProps) {
  const { user, isRegistered, isLoaded } = useUser();
  const { unreadCount, unreadByConversation, markAsRead } = useUnreadMessages();

  const [isMinimized, setIsMinimized] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load nicknames from local storage & Supabase user_metadata
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    const loadNicknames = async () => {
      let localMap: Record<string, string> = {};
      try {
        const saved = localStorage.getItem(`yapclub_nicknames_${user.id}`);
        if (saved) localMap = JSON.parse(saved);
      } catch (e) {}

      setNicknames(localMap);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const cloudMap = session?.user?.user_metadata?.nicknames;
        if (cloudMap && typeof cloudMap === "object") {
          const merged = { ...cloudMap, ...localMap };
          setNicknames(merged);
        }
      } catch (e) {}
    };

    loadNicknames();

    const handleNicknameUpdateEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Record<string, string>>;
      if (customEvent.detail) {
        setNicknames(customEvent.detail);
      }
    };
    window.addEventListener("yapclub_nicknames_updated", handleNicknameUpdateEvent);
    return () => {
      window.removeEventListener("yapclub_nicknames_updated", handleNicknameUpdateEvent);
    };
  }, [user?.id, isRegistered]);

  // Fetch user conversations
  const fetchConversations = useCallback(async () => {
    if (!user?.id || !isRegistered) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .select(`
          conversation_id,
          conversations (
            id,
            type,
            name,
            last_message_at
          )
        `)
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });

      if (error) {
        console.error("Error fetching conversation members:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const conversationIds = data.map((d: any) => d.conversation_id);

        if (conversationIds.length > 0) {
          const { data: membersData, error: membersErr } = await supabase
            .from("conversation_members")
            .select(`
              conversation_id,
              profiles (
                id,
                username,
                avatar
              )
            `)
            .in("conversation_id", conversationIds)
            .neq("user_id", user.id);

          if (membersErr) {
            console.error("Error fetching conversation partner profiles:", membersErr);
          }

          const convos: ConversationSummary[] = [];

          for (const item of data) {
            const rawConv = (item as any).conversations;
            const c = Array.isArray(rawConv) ? rawConv[0] : rawConv;
            if (!c) continue;

            let otherUser: ConversationSummary["other_user"] = undefined;
            if (c.type !== "group" && membersData) {
              const partnerMember = (membersData as any[]).find((m: any) => m.conversation_id === c.id);
              if (partnerMember && partnerMember.profiles) {
                const rawProf = partnerMember.profiles;
                const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
                if (prof) {
                  otherUser = {
                    id: prof.id,
                    username: prof.username,
                    avatar: prof.avatar || "user",
                  };
                }
              }
            }

            convos.push({
              id: c.id,
              type: c.type || "direct",
              name: c.name || null,
              last_message_at: c.last_message_at || new Date().toISOString(),
              other_user: otherUser,
            });
          }

          // Sort by latest message
          convos.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
          setConversations(convos);
        } else {
          setConversations([]);
        }
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isRegistered]);

  // Fetch conversations when messenger is opened
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  // Fetch messages for active conversation
  useEffect(() => {
    if (!activeConversationId || !user?.id) {
      setMessages([]);
      return;
    }

    markAsRead(activeConversationId);

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, content, created_at")
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("Error fetching messages:", error);
      } else if (data) {
        setMessages(data);
      }
    };

    fetchMessages();

    // Subscribe to new incoming messages in this active conversation
    const channel = supabase
      .channel(`in_room_dm_${activeConversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          markAsRead(activeConversationId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, user?.id, markAsRead]);

  // Auto scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Focus input when conversation opens
  useEffect(() => {
    if (activeConversationId) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [activeConversationId]);

  // Handle Send Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId || !user?.id || isSending) return;

    const content = inputMessage.trim();
    setInputMessage("");
    setIsSending(true);

    const tempId = "temp_" + Date.now();
    const optimisticMsg: DirectMessage = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to send message:", error);
      } else if (data) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", activeConversationId);
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Only render if user is logged in, registered, and messenger is open
  if (!isLoaded || !isRegistered || !user || !isOpen) {
    return null;
  }

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePartnerName = activeConversation?.other_user
    ? nicknames[activeConversation.other_user.id] || activeConversation.other_user.username
    : activeConversation?.name || "Direct Message";

  const filteredConversations = conversations.filter((c) => {
    const name = c.other_user
      ? nicknames[c.other_user.id] || c.other_user.username
      : c.name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div
      className={`fixed z-50 transition-all duration-200 ease-out shadow-2xl backdrop-blur-2xl border border-white/10 bg-[#0E0F17]/95 overflow-hidden flex flex-col ${
        isMinimized
          ? "bottom-20 right-3.5 sm:right-6 w-[calc(100vw-28px)] sm:w-72 h-14 rounded-2xl"
          : "inset-x-3 bottom-20 top-16 sm:inset-auto sm:bottom-20 sm:right-6 sm:w-[380px] sm:h-[490px] rounded-3xl"
      }`}
    >
      {/* Header */}
          <div className="px-4 py-3 border-b border-white/[0.08] bg-black/30 flex items-center justify-between shrink-0 select-none">
            {activeConversationId ? (
              /* Conversation View Header */
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveConversationId(null)}
                  className="p-1 -ml-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                  title="Back to Chats"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                  {activeConversation?.other_user?.avatar?.includes("http") ? (
                    <img
                      src={activeConversation.other_user.avatar}
                      alt={activePartnerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserAvatar avatar={activeConversation?.other_user?.avatar || "user"} size="sm" className="!w-full !h-full" />
                  )}
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-bold text-white truncate max-w-[170px]">
                    {activePartnerName}
                  </h4>
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Direct Chat
                  </span>
                </div>
              </div>
            ) : (
              /* Inbox View Header */
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-pink-500/20 border border-indigo-500/30 flex items-center justify-center text-pink-400 shadow-inner">
                  <MessageCircle size={15} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white tracking-wide">Direct Messages</h4>
                </div>
                {unreadCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>
            )}

            {/* Window Controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(!isMinimized)}
                className="w-7 h-7 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                title={isMinimized ? "Expand" : "Minimize"}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setActiveConversationId(null);
                }}
                className="w-7 h-7 rounded-full text-slate-400 hover:text-rose-400 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* VIEW 1: Conversations List */}
              {!activeConversationId && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Search Bar */}
                  <div className="p-3 border-b border-white/[0.06] bg-white/[0.02]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search chats..."
                        className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Conversations Scroll Area */}
                  <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-40 text-slate-500 text-xs">
                        <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                        Loading conversations...
                      </div>
                    ) : filteredConversations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-center px-4 text-slate-500">
                        <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-2">
                          <MessageCircle size={20} />
                        </div>
                        <p className="text-xs font-semibold text-slate-300">No conversations yet</p>
                        <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
                          Connect with friends on YapClub to send direct messages anytime.
                        </p>
                      </div>
                    ) : (
                      filteredConversations.map((c) => {
                        const name = c.other_user
                          ? nicknames[c.other_user.id] || c.other_user.username
                          : c.name || "Chat";
                        const unread = unreadByConversation[c.id] || 0;

                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setActiveConversationId(c.id)}
                            className="w-full px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.04] transition-colors text-left cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-800 border border-white/10 shrink-0">
                                {c.other_user?.avatar?.includes("http") ? (
                                  <img src={c.other_user.avatar} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                  <UserAvatar avatar={c.other_user?.avatar || "user"} size="sm" className="!w-full !h-full" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                                  {name}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString([], { month: "short", day: "numeric" }) : "Active chat"}
                                </p>
                              </div>
                            </div>
                            {unread > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow-md shrink-0">
                                {unread}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* VIEW 2: Active Chat Thread */}
              {activeConversationId && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Message Stream */}
                  <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5 scroll-smooth">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-center py-6 select-none opacity-80">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2">
                          <Sparkles size={18} />
                        </div>
                        <span className="text-xs font-semibold text-slate-200">Start the conversation</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">Send a message to {activePartnerName}</p>
                      </div>
                    ) : (
                      messages.map((m) => {
                        const isMe = m.sender_id === user.id;
                        const parsed = parseMessageContent(m.content);

                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col min-w-0 max-w-full ${isMe ? "items-end" : "items-start"}`}
                          >
                            <div
                              className={`max-w-[85%] sm:max-w-[75%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed break-words shadow-sm w-full min-w-0 overflow-hidden ${
                                isMe
                                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-xs"
                                  : "bg-white/10 text-slate-200 rounded-bl-xs border border-white/5"
                              }`}
                            >
                              {parsed.replyTo && (
                                <div className="mb-1.5 px-2.5 py-1.5 rounded-xl bg-black/30 text-[10px] border-l-2 border-indigo-400 w-full min-w-0 overflow-hidden">
                                  <div className="flex items-center gap-1 font-semibold text-indigo-300 min-w-0 mb-0.5">
                                    <span className="truncate">@{parsed.replyTo.sender}</span>
                                  </div>
                                  <p className="line-clamp-2 break-words w-full overflow-hidden text-ellipsis opacity-80">
                                    {parsed.replyTo.isVoice ? "🎵 Voice Note" : parsed.replyTo.text}
                                  </p>
                                </div>
                              )}

                              {parsed.type === "voice" ? (
                                <VoiceNotePlayer audioUrl={parsed.audioUrl || ""} duration={parsed.duration} isMe={isMe} />
                              ) : (
                                <p className="whitespace-pre-wrap select-text break-words w-full overflow-hidden">{parsed.text}</p>
                              )}
                            </div>
                            <span className="text-[9px] text-slate-500 mt-0.5 px-1 select-none flex items-center gap-1">
                              {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                              <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            </span>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input Form */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-2.5 border-t border-white/[0.08] bg-black/40 shrink-0"
                  >
                    <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-2xl p-1 focus-within:border-indigo-500/50 transition-all">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder={`Message ${activePartnerName}...`}
                        maxLength={500}
                        className="flex-1 bg-transparent px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!inputMessage.trim() || isSending}
                        className="w-7 h-7 rounded-xl flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-white/5 disabled:text-slate-600 text-white transition-all cursor-pointer disabled:cursor-not-allowed shadow-md"
                        aria-label="Send message"
                      >
                        <Send size={12} className={inputMessage.trim() ? "translate-x-0.2" : ""} />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
    </div>
  );
}

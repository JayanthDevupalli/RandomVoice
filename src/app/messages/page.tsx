"use client";

import { useEffect, useState, useRef } from "react";
import { useUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { supabase } from "@/lib/supabase";
import { Search, MessageSquare, Send, ArrowLeft, Loader2, Plus, Users, X } from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useRouter } from "next/navigation";
import { CreateGroupModal } from "@/components/chat/CreateGroupModal";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";

export default function MessagesPage() {
  const { user, isRegistered, isLoaded } = useUser();
  const { markAsRead, unreadByConversation } = useUnreadMessages();
  const router = useRouter();
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom("auto");
  }, [messages.length, activeConversationId]);

  // Support direct linking via ?id=
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const convId = params.get("id");
      if (convId) {
        setActiveConversationId(convId);
      }
    }
  }, []);

  useEffect(() => {
    if (isLoaded && !isRegistered) {
      router.push("/junctions"); // Guests can't use DMs
    }
  }, [isLoaded, isRegistered, router]);

  useEffect(() => {
    if (!user || !isRegistered) return;

    // Fetch user's conversations
    const fetchConversations = async () => {
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
          const conversationIds = data.map(d => d.conversation_id);
          
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

            if (membersErr) console.error("Error fetching members:", membersErr);

            const formatted = data.map(d => {
              const conv = Array.isArray(d.conversations) ? d.conversations[0] : d.conversations;
              const otherMembers = membersData?.filter(m => m.conversation_id === d.conversation_id) || [];
              const otherProf = otherMembers[0]?.profiles;
              const profile = Array.isArray(otherProf) ? otherProf[0] : otherProf;
              
              return {
                id: d.conversation_id,
                type: conv?.type,
                name: conv?.name,
                last_message_at: conv?.last_message_at || new Date().toISOString(),
                other_user: profile
              };
            }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

            setConversations(formatted);

            // On desktop (>= 640px), auto-select first conversation if none selected
            // On mobile (< 640px), stay on conversation list view
            if (formatted.length > 0 && typeof window !== "undefined" && window.innerWidth >= 640) {
              setActiveConversationId(prev => prev || formatted[0].id);
            }
          }
        }
      } catch (err) {
        console.error("Caught unhandled exception in fetchConversations:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversations();
  }, [user, isRegistered, isGroupModalOpen]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles (
            username,
            avatar
          )
        `)
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
      }

      if (data) {
        const formattedMessages = data.map(m => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return {
            ...m,
            profiles: profile
          };
        });
        setMessages(formattedMessages);
      }
    };

    fetchMessages();

    // Subscribe to new messages
    const channelId = `chat_messages_${activeConversationId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        () => {
          fetchMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeConversationId]);

  // Mark active conversation as read
  useEffect(() => {
    if (activeConversationId) {
      markAsRead(activeConversationId);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("yapclub_active_conversation", activeConversationId);
      }
    } else {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    }

    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
    };
  }, [activeConversationId, markAsRead, messages.length]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId || !user) return;

    const msg = inputMessage;
    setInputMessage("");

    await supabase.from("messages").insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: msg
    });

    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString()
    }).eq("id", activeConversationId);
  };

  if (!isLoaded || !isRegistered || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery.trim()) return true;
    const name = conv.type === "group" ? (conv.name || "Group Chat") : (conv.other_user?.username || "Unknown");
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-background overflow-hidden">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-0 sm:p-4 flex gap-4 min-h-0 overflow-hidden">
        {/* Sidebar (Conversations Inbox) */}
        <div 
          className={`w-full sm:w-80 md:w-96 flex flex-col bg-card border-0 sm:border border-white/5 sm:rounded-2xl overflow-hidden shrink-0 h-full min-h-0 transition-all ${
            activeConversationId ? "hidden sm:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="p-4 border-b border-white/5 bg-background/40 sm:bg-transparent">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => router.push("/junctions")}
                  className="p-1.5 -ml-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                  title="Back to Voice Rooms"
                  aria-label="Back to Voice Rooms"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-xl sm:text-lg font-bold text-white tracking-tight">Messages</h2>
                {conversations.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-white/10 text-slate-300">
                    {conversations.length}
                  </span>
                )}
              </div>
              <button 
                onClick={() => setIsGroupModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold transition-all shadow-md"
                title="New Group"
              >
                <Plus size={14} />
                <span>New Group</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..." 
                className="w-full pl-9 pr-8 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/[0.03]">
            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                <span className="text-xs text-slate-500">Loading chats...</span>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                  <MessageSquare size={22} />
                </div>
                <p className="text-sm font-medium text-slate-300">
                  {searchQuery ? "No matches found" : "No conversations yet"}
                </p>
                <p className="text-xs text-slate-500 max-w-[220px]">
                  {searchQuery ? "Try a different search keyword." : "Connect with friends from rooms or start a group chat!"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => setIsGroupModalOpen(true)}
                    className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Start a Group Chat
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map(conv => {
                const isSelected = activeConversationId === conv.id;
                const isGroup = conv.type === "group";
                const title = isGroup ? (conv.name || "Group Chat") : (conv.other_user?.username || "Unknown");
                const avatarUrl = isGroup ? null : conv.other_user?.avatar;

                return (
                  <button 
                    key={conv.id}
                    onClick={() => setActiveConversationId(conv.id)}
                    className={`w-full p-4 flex items-center gap-3.5 text-left transition-all active:bg-white/10 ${
                      isSelected 
                        ? 'bg-white/5 border-l-4 border-indigo-500' 
                        : 'border-l-4 border-transparent hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="relative w-12 h-12 rounded-full bg-slate-800/80 overflow-hidden shrink-0 flex items-center justify-center border border-white/10 shadow-sm">
                      {isGroup ? (
                        <div className="w-full h-full bg-indigo-950/60 flex items-center justify-center text-indigo-400">
                          <Users size={22} />
                        </div>
                      ) : avatarUrl?.includes("http") ? (
                        <img src={avatarUrl} alt={title} className="w-full h-full object-cover" />
                      ) : (
                        <UserAvatar avatar={avatarUrl} color="#6366F1" size="md" className="!w-full !h-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {title}
                        </h4>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isGroup ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                          <span>{isGroup ? "Group Conversation" : "Direct Message"}</span>
                        </p>
                        {unreadByConversation[conv.id] > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                            {unreadByConversation[conv.id] > 99 ? "99+" : unreadByConversation[conv.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div 
          className={`flex-1 flex flex-col bg-card border-0 sm:border border-white/5 sm:rounded-2xl overflow-hidden h-full min-h-0 ${
            !activeConversationId ? 'hidden sm:flex items-center justify-center' : 'flex'
          }`}
        >
          {!activeConversationId ? (
            <div className="text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-4">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Your Messages</h3>
              <p className="text-sm text-slate-400 max-w-xs">
                Select a conversation to start chatting or create a group to talk with friends.
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="h-16 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 shrink-0 bg-background/50 backdrop-blur-md">
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
                  {/* Back Button */}
                  <button
                    onClick={() => setActiveConversationId(null)}
                    className="p-2 -ml-1 rounded-full text-slate-400 hover:text-white active:bg-white/10 transition-colors"
                    title="Back to conversations"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft size={20} />
                  </button>

                  <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-white/10">
                    {activeConversation?.type === "group" ? (
                      <div className="w-full h-full bg-indigo-950/60 flex items-center justify-center text-indigo-400">
                        <Users size={18} />
                      </div>
                    ) : activeConversation?.other_user?.avatar?.includes("http") ? (
                      <img src={activeConversation.other_user.avatar} className="w-full h-full object-cover" />
                    ) : (
                      <UserAvatar avatar={activeConversation?.other_user?.avatar} color="#6366F1" size="sm" className="!w-full !h-full" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-base font-bold text-white truncate">
                      {activeConversation?.type === "group" 
                        ? activeConversation.name || "Group Chat" 
                        : activeConversation?.other_user?.username || "Chat"}
                    </h3>
                    <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {activeConversation?.type === "group" ? "Active Room" : "Online"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3.5">
                {messages.length === 0 ? (
                  <div className="my-auto text-center py-10">
                    <p className="text-sm text-slate-400">No messages in this chat yet.</p>
                    <p className="text-xs text-slate-600 mt-1">Send a message to break the ice! 💬</p>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.sender_id === user.id;
                    const senderName = msg.profiles?.username || "Someone";
                    const senderAvatar = msg.profiles?.avatar;

                    return (
                      <div 
                        key={msg.id} 
                        className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {/* Avatar in group for incoming messages */}
                        {!isMe && activeConversation?.type === "group" && (
                          <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10 mb-1">
                            {senderAvatar?.includes("http") ? (
                              <img src={senderAvatar} alt={senderName} className="w-full h-full object-cover" />
                            ) : (
                              <UserAvatar avatar={senderAvatar} size="sm" className="!w-full !h-full" />
                            )}
                          </div>
                        )}

                        <div className={`max-w-[85%] sm:max-w-[70%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          {/* Sender name in group */}
                          {!isMe && activeConversation?.type === "group" && (
                            <span className="text-[11px] font-semibold text-indigo-400 mb-1 px-1">
                              {senderName}
                            </span>
                          )}

                          <div 
                            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md break-words ${
                              isMe 
                                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-xs' 
                                : 'bg-white/10 text-slate-100 border border-white/5 rounded-tl-xs backdrop-blur-sm'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <span 
                              className={`text-[9px] mt-1 block select-none ${
                                isMe ? 'text-indigo-200/80 text-right' : 'text-slate-400 text-right'
                              }`}
                            >
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-white/5 bg-black/40 backdrop-blur-md shrink-0">
                <div className="relative flex items-center gap-2">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full pl-4 pr-12 py-3 bg-white/5 border border-white/10 rounded-2xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                  />
                  <button
                    type="submit"
                    disabled={!inputMessage.trim()}
                    className="absolute right-1.5 w-9 h-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl transition-all shadow-md"
                    aria-label="Send Message"
                  >
                    <Send size={15} />
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </main>

      {/* Create Group Modal */}
      <CreateGroupModal 
        isOpen={isGroupModalOpen}
        onClose={() => setIsGroupModalOpen(false)}
        currentUser={user}
        onGroupCreated={(id) => {
          setActiveConversationId(id);
        }}
      />
    </div>
  );
}

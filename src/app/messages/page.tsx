"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useUser } from "@/hooks/useUser";
import { Navbar } from "@/components/layout/Navbar";
import { supabase } from "@/lib/supabase";
import { 
  Search, 
  MessageSquare, 
  Send, 
  ArrowLeft, 
  Loader2, 
  Plus, 
  Users, 
  X,
  Mic,
  MoreVertical,
  Edit3,
  Trash2,
  ShieldAlert,
  ShieldCheck,
  Check,
  CheckCheck,
  Reply,
  Volume2,
  ArrowDown
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useRouter } from "next/navigation";
import { CreateGroupModal } from "@/components/chat/CreateGroupModal";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { 
  parseMessageContent, 
  serializeTextMessage, 
  serializeVoiceMessage,
  ParsedMessage 
} from "@/lib/chat-utils";

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

  // --- Feature 2: Nicknames ---
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  // --- Feature 3: Block ---
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  // --- Feature 4: Delete Chat ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // --- Dropdown Menu in Header ---
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // --- Message Actions: Reply, Edit, Delete ---
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    sender: string;
    text: string;
    isVoice?: boolean;
  } | null>(null);

  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    text: string;
    replyTo?: any;
  } | null>(null);

  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);

  // --- Voice Notes (Real Audio Recording) ---
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // --- Feature 6: Active Status, Typing & Read Receipts ---
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [otherUserLastReadAt, setOtherUserLastReadAt] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<any>(null);

  // --- Scroll to Bottom & Container ---
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unreadNewMsgs, setUnreadNewMsgs] = useState(0);

  // Scroll handler for detecting upward scrolling
  const handleChatScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isScrolledUp = scrollHeight - scrollTop - clientHeight > 140;
    setShowScrollToBottom(isScrolledUp);
    if (!isScrolledUp) {
      setUnreadNewMsgs(0);
    }
  };

  // Auto-scroll to bottom of chat
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (showScrollToBottom) {
      setUnreadNewMsgs(prev => prev + 1);
    } else {
      scrollToBottom("auto");
    }
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

    // Subscribe to messages changes (insert, update, delete)
    const channelId = `chat_messages_${activeConversationId}_${Math.random().toString(36).substring(2, 9)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
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
      const latestMsg = messages[messages.length - 1];
      markAsRead(activeConversationId, latestMsg?.created_at);
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
  }, [activeConversationId, markAsRead, messages]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Load saved contact nicknames (local storage + Supabase user_metadata backup)
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
          localStorage.setItem(`yapclub_nicknames_${user.id}`, JSON.stringify(merged));
        }
      } catch (e) {
        console.error("Failed to load cloud nicknames:", e);
      }
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

  const handleSaveNickname = async (targetUserId: string, newNickname: string) => {
    if (!user?.id || !targetUserId) return;
    const updated = { ...nicknames };
    if (newNickname.trim()) {
      updated[targetUserId] = newNickname.trim();
    } else {
      delete updated[targetUserId];
    }
    
    // 1. Update React state immediately
    setNicknames(updated);

    // 2. Persist to localStorage
    try {
      localStorage.setItem(`yapclub_nicknames_${user.id}`, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save nickname to localStorage:", e);
    }

    // 3. Broadcast event to other open components/tabs
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("yapclub_nicknames_updated", { detail: updated })
      );
    }

    setIsNicknameModalOpen(false);

    // 4. Persist to Supabase user_metadata for cloud persistence across logins
    try {
      await supabase.auth.updateUser({
        data: { nicknames: updated }
      });
    } catch (e) {
      console.error("Failed to sync nicknames to Supabase user_metadata:", e);
    }
  };

  // Load and sync blocked users
  useEffect(() => {
    if (!user?.id || !isRegistered) return;
    try {
      const saved = localStorage.getItem(`yapclub_blocked_${user.id}`);
      if (saved) setBlockedUsers(JSON.parse(saved));
    } catch (e) {}

    const fetchBlocked = async () => {
      const { data } = await supabase
        .from("connections")
        .select("receiver_id")
        .eq("requester_id", user.id)
        .eq("status", "blocked");
      if (data) {
        const ids = data.map((d: any) => d.receiver_id);
        setBlockedUsers(prev => Array.from(new Set([...prev, ...ids])));
      }
    };
    fetchBlocked();
  }, [user?.id, isRegistered]);

  const handleToggleBlock = async (targetUserId: string) => {
    if (!user?.id || !targetUserId) return;
    const isCurrentlyBlocked = blockedUsers.includes(targetUserId);

    if (isCurrentlyBlocked) {
      const next = blockedUsers.filter(id => id !== targetUserId);
      setBlockedUsers(next);
      try {
        localStorage.setItem(`yapclub_blocked_${user.id}`, JSON.stringify(next));
      } catch (e) {}

      await supabase
        .from("connections")
        .update({ status: "accepted" })
        .match({ requester_id: user.id, receiver_id: targetUserId, status: "blocked" });
    } else {
      const next = [...blockedUsers, targetUserId];
      setBlockedUsers(next);
      try {
        localStorage.setItem(`yapclub_blocked_${user.id}`, JSON.stringify(next));
      } catch (e) {}

      await supabase
        .from("connections")
        .upsert(
          { requester_id: user.id, receiver_id: targetUserId, status: "blocked" },
          { onConflict: "requester_id,receiver_id" }
        );
    }
    setIsHeaderMenuOpen(false);
  };

  // Delete chat
  const handleDeleteChat = async () => {
    if (!activeConversationId || !user?.id) return;
    setIsDeleting(true);
    try {
      await supabase.from("messages").delete().eq("conversation_id", activeConversationId);
      await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", activeConversationId)
        .eq("user_id", user.id);

      if (activeConversation?.type === "direct") {
        await supabase.from("conversations").delete().eq("id", activeConversationId);
      }

      setConversations(prev => prev.filter(c => c.id !== activeConversationId));
      setActiveConversationId(null);
      setIsDeleteModalOpen(false);
      setIsHeaderMenuOpen(false);
    } catch (err) {
      console.error("Error deleting chat:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // Cleanup microphone stream & timer on page unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
    };
  }, []);

  // --- Feature: Voice Notes (Real Audio Recording) ---
  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        alert("Audio recording is not supported in this browser.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(200);
      setIsRecordingVoice(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      alert("Could not access microphone. Please allow microphone permissions in your browser.");
    }
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    setIsRecordingVoice(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  };

  const sendVoiceRecording = async () => {
    if (!mediaRecorderRef.current || !activeConversationId || !user) return;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    const recorder = mediaRecorderRef.current;
    const finalDuration = recordingDuration;

    recorder.onstop = async () => {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }

      setIsRecordingVoice(false);
      setRecordingDuration(0);

      if (audioBlob.size === 0) return;

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        const serialized = serializeVoiceMessage(
          base64Audio,
          Math.max(1, finalDuration),
          replyingTo
        );

        await supabase.from("messages").insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: serialized,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", activeConversationId);

        markAsRead(activeConversationId);
        setReplyingTo(null);
      };
      reader.readAsDataURL(audioBlob);
    };

    recorder.stop();
  };

  // --- Message Actions: Edit, Delete, Reply, Scroll ---
  const startEditingMessage = (msgId: string, currentContent: string) => {
    const parsed = parseMessageContent(currentContent);
    if (parsed.type === "voice") return;
    setEditingMessage({
      id: msgId,
      text: parsed.text || "",
      replyTo: parsed.replyTo,
    });
    setInputMessage(parsed.text || "");
    setReplyingTo(null);
    if (textInputRef.current) {
      textInputRef.current.focus();
    }
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setInputMessage("");
  };

  const saveEditedMessage = async () => {
    if (!editingMessage || !inputMessage.trim() || !user) return;
    const newContent = serializeTextMessage(
      inputMessage.trim(),
      editingMessage.replyTo,
      true
    );

    setMessages((prev) =>
      prev.map((m) => (m.id === editingMessage.id ? { ...m, content: newContent } : m))
    );

    const messageId = editingMessage.id;
    cancelEditing();

    try {
      const res = await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: messageId, content: newContent, userId: user.id }),
      });

      if (!res.ok) {
        console.error("Error editing message via API:", await res.text());
      }
    } catch (err) {
      console.error("Failed to edit message:", err);
    }
  };

  const confirmDeleteMessage = async () => {
    if (!deletingMessageId || !user) return;
    setIsDeletingMessage(true);

    const targetId = deletingMessageId;
    setMessages((prev) => prev.filter((m) => m.id !== targetId));
    setDeletingMessageId(null);
    setIsDeletingMessage(false);

    try {
      const res = await fetch(`/api/messages?id=${targetId}&userId=${user.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        console.error("Error deleting message via API:", await res.text());
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  const scrollToMessage = (msgId?: string) => {
    if (!msgId) return;
    const elem = document.getElementById(`msg-${msgId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "center" });
      elem.classList.add("ring-2", "ring-indigo-500", "ring-offset-2", "ring-offset-background");
      setTimeout(() => {
        elem.classList.remove("ring-2", "ring-indigo-500", "ring-offset-2", "ring-offset-background");
      }, 1500);
    }
  };

  // Realtime Presence, Typing & Read Receipts indicator
  useEffect(() => {
    if (!activeConversationId || !user?.id) {
      setIsOtherUserOnline(false);
      setIsOtherUserTyping(false);
      setOtherUserLastReadAt(null);
      return;
    }

    const otherUserId = activeConversation?.other_user?.id;
    if (!otherUserId || activeConversation?.type === "group") {
      setIsOtherUserOnline(false);
      setIsOtherUserTyping(false);
      setOtherUserLastReadAt(null);
      return;
    }

    const presenceChannel = supabase.channel(`conv_presence_${activeConversationId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        let isOnline = false;
        let latestReadTime: string | null = null;
        for (const key of Object.keys(state)) {
          const presences = state[key] as any[];
          const otherPresence = presences.find((p: any) => p.user_id === otherUserId);
          if (otherPresence) {
            isOnline = true;
            if (otherPresence.last_read_at) {
              latestReadTime = otherPresence.last_read_at;
            }
          }
        }
        setIsOtherUserOnline(isOnline);
        if (latestReadTime) {
          setOtherUserLastReadAt(latestReadTime);
        }
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        if (payload.payload?.user_id === otherUserId) {
          setIsOtherUserTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsOtherUserTyping(false);
          }, 2500);
        }
      })
      .on("broadcast", { event: "read_receipt" }, (payload: any) => {
        if (payload.payload?.user_id === otherUserId && payload.payload?.read_at) {
          setOtherUserLastReadAt(payload.payload.read_at);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const nowIso = new Date().toISOString();
          await presenceChannel.track({ user_id: user.id, online_at: Date.now(), last_read_at: nowIso });
        }
      });

    presenceChannelRef.current = presenceChannel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(presenceChannel);
      setIsOtherUserOnline(false);
      setIsOtherUserTyping(false);
    };
  }, [activeConversationId, user?.id, activeConversation?.other_user?.id, activeConversation?.type]);

  // Close header 3-dots menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setIsHeaderMenuOpen(false);
      }
    };
    if (isHeaderMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isHeaderMenuOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value);
    if (presenceChannelRef.current && activeConversation?.type !== "group" && user?.id) {
      presenceChannelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id },
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId || !user) return;

    if (editingMessage) {
      await saveEditedMessage();
      return;
    }

    const text = inputMessage.trim();
    const content = serializeTextMessage(text, replyingTo);
    setInputMessage("");
    setReplyingTo(null);

    await supabase.from("messages").insert({
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: content
    });

    await supabase.from("conversations").update({
      last_message_at: new Date().toISOString()
    }).eq("id", activeConversationId);

    markAsRead(activeConversationId);
  };

  if (!isLoaded || !isRegistered || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

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
                const otherUserId = conv.other_user?.id;
                const customNickname = otherUserId ? nicknames[otherUserId] : null;
                const title = isGroup 
                  ? (conv.name || "Group Chat") 
                  : (customNickname || conv.other_user?.username || "Unknown");
                const avatarUrl = isGroup ? null : conv.other_user?.avatar;
                const isBlocked = otherUserId ? blockedUsers.includes(otherUserId) : false;

                return (
                  <button 
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id);
                      markAsRead(conv.id, conv.last_message_at);
                    }}
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="text-sm font-semibold text-white truncate">
                            {title}
                          </h4>
                          {isBlocked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                              Blocked
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isGroup ? 'bg-indigo-400' : isBlocked ? 'bg-rose-500' : 'bg-emerald-400'}`} />
                          <span>
                            {isGroup 
                              ? "Group Conversation" 
                              : customNickname 
                                ? `@${conv.other_user?.username || 'user'}` 
                                : "Direct Message"}
                          </span>
                        </p>
                        {unreadByConversation[conv.id] > 0 && activeConversationId !== conv.id && (
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
          onClick={() => {
            if (activeConversationId) {
              markAsRead(activeConversationId, messages[messages.length - 1]?.created_at);
            }
          }}
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
              {(() => {
                const isGroup = activeConversation?.type === "group";
                const otherUserId = activeConversation?.other_user?.id;
                const customNickname = otherUserId ? nicknames[otherUserId] : null;
                const headerTitle = isGroup 
                  ? (activeConversation.name || "Group Chat") 
                  : (customNickname || activeConversation?.other_user?.username || "Chat");
                const isBlocked = otherUserId ? blockedUsers.includes(otherUserId) : false;

                return (
                  <div className="relative z-30 h-16 border-b border-white/5 flex items-center justify-between px-3 sm:px-6 shrink-0 bg-[#090A0F]/90 backdrop-blur-xl shadow-sm">
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
                        {isGroup ? (
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
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white truncate">
                            {headerTitle}
                          </h3>
                          {customNickname && !isGroup && (
                            <span className="text-[11px] text-slate-400 truncate hidden xs:inline">
                              @{activeConversation?.other_user?.username}
                            </span>
                          )}
                        </div>

                        {/* Status Subtitle: Online / Offline / Typing / Blocked */}
                        {isGroup ? (
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                            Group Chat
                          </p>
                        ) : isBlocked ? (
                          <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Contact Blocked
                          </p>
                        ) : isOtherUserTyping ? (
                          <p className="text-[11px] text-indigo-400 font-medium flex items-center gap-1.5 animate-pulse">
                            <span className="flex gap-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </span>
                            typing...
                          </p>
                        ) : isOtherUserOnline ? (
                          <p className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
                            Online
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Offline
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Chat Actions Dropdown Menu */}
                    <div className="relative" ref={headerMenuRef}>
                      <button
                        onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                        title="Chat Options"
                        aria-label="Chat Options"
                      >
                        <MoreVertical size={18} />
                      </button>

                      {isHeaderMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-[#12131A] border border-white/10 shadow-2xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-2xl">
                          {!isGroup && otherUserId && (
                            <>
                              <button
                                onClick={() => {
                                  setNicknameInput(customNickname || "");
                                  setIsNicknameModalOpen(true);
                                  setIsHeaderMenuOpen(false);
                                }}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                              >
                                <Edit3 size={15} className="text-indigo-400" />
                                <span>{customNickname ? "Edit Nickname" : "Set Nickname"}</span>
                              </button>

                              <button
                                onClick={() => handleToggleBlock(otherUserId)}
                                className={`w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold transition-colors text-left ${
                                  isBlocked 
                                    ? "text-emerald-400 hover:bg-emerald-500/10" 
                                    : "text-amber-400 hover:bg-amber-500/10"
                                }`}
                              >
                                {isBlocked ? (
                                  <>
                                    <ShieldCheck size={15} />
                                    <span>Unblock Contact</span>
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert size={15} />
                                    <span>Block Contact</span>
                                  </>
                                )}
                              </button>

                              <div className="my-1 border-t border-white/5" />
                            </>
                          )}

                          <button
                            onClick={() => {
                              setIsDeleteModalOpen(true);
                              setIsHeaderMenuOpen(false);
                            }}
                            className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                          >
                            <Trash2 size={15} />
                            <span>Delete Chat</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Chat Messages */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div 
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 flex flex-col gap-3.5"
                >
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
                      const parsed = parseMessageContent(msg.content);

                      return (
                        <div 
                          key={msg.id} 
                          id={`msg-${msg.id}`}
                          className={`group relative flex items-end gap-2 transition-all duration-300 rounded-2xl p-1 ${isMe ? 'justify-end' : 'justify-start'}`}
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

                          {/* Hover Actions for own messages (Reply, Edit, Delete) */}
                          {isMe && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[#12131A] border border-white/10 rounded-xl px-1.5 py-0.5 shadow-lg mb-1 backdrop-blur-md">
                              <button
                                type="button"
                                onClick={() => setReplyingTo({
                                  id: msg.id,
                                  sender: senderName,
                                  text: parsed.type === "voice" ? "Voice Note" : parsed.text || "",
                                  isVoice: parsed.type === "voice",
                                })}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Reply"
                                aria-label="Reply"
                              >
                                <Reply size={13} />
                              </button>

                              {parsed.type !== "voice" && (
                                <button
                                  type="button"
                                  onClick={() => startEditingMessage(msg.id, msg.content)}
                                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                  title="Edit message"
                                  aria-label="Edit message"
                                >
                                  <Edit3 size={13} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setDeletingMessageId(msg.id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete message"
                                aria-label="Delete message"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}

                          <div className={`max-w-[85%] sm:max-w-[70%] min-w-0 flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {/* Sender name in group */}
                            {!isMe && activeConversation?.type === "group" && (
                              <span className="text-[11px] font-semibold text-indigo-400 mb-1 px-1 truncate max-w-full">
                                {senderName}
                              </span>
                            )}

                            <div 
                              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-md break-words w-full min-w-0 overflow-hidden ${
                                isMe 
                                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-xs' 
                                  : 'bg-white/10 text-slate-100 border border-white/5 rounded-tl-xs backdrop-blur-sm'
                              }`}
                            >
                              {/* Quoted Reply reference if this message was in reply to another */}
                              {parsed.replyTo && (
                                <div
                                  onClick={() => scrollToMessage(parsed.replyTo?.id)}
                                  className={`mb-2 px-2.5 py-1.5 rounded-xl text-xs border-l-2 cursor-pointer transition-colors w-full min-w-0 overflow-hidden ${
                                    isMe
                                      ? "bg-indigo-950/50 border-white/60 hover:bg-indigo-950/70 text-white/90"
                                      : "bg-white/5 border-indigo-400 hover:bg-white/10 text-slate-300"
                                  }`}
                                >
                                  <div className="flex items-center gap-1 font-semibold text-[11px] mb-0.5 text-indigo-300 min-w-0">
                                    <Reply size={11} className="rotate-180 shrink-0" />
                                    <span className="truncate">{parsed.replyTo.sender}</span>
                                  </div>
                                  <p className="line-clamp-2 text-[11px] opacity-80 break-words w-full overflow-hidden text-ellipsis">
                                    {parsed.replyTo.isVoice ? "🎵 Voice Note" : parsed.replyTo.text}
                                  </p>
                                </div>
                              )}

                              {/* Voice Note or Text */}
                              {parsed.type === "voice" ? (
                                <VoiceNotePlayer
                                  audioUrl={parsed.audioUrl || ""}
                                  duration={parsed.duration}
                                  isMe={isMe}
                                />
                              ) : (
                                <p className="whitespace-pre-wrap select-text">{parsed.text}</p>
                              )}

                              {/* Timestamp, (edited) and Read Receipts */}
                              <div 
                                className={`text-[9px] mt-1 flex items-center gap-1 select-none ${
                                  isMe ? 'text-indigo-200/80 justify-end' : 'text-slate-400 justify-end'
                                }`}
                              >
                                {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                                <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                                {/* Read Receipt status icons (WhatsApp style) for 1-on-1 chats */}
                                {isMe && activeConversation?.type !== "group" && (
                                  <span className="ml-0.5 inline-flex items-center">
                                    {otherUserLastReadAt && new Date(msg.created_at).getTime() <= new Date(otherUserLastReadAt).getTime() ? (
                                      <span title="Seen"><CheckCheck size={13} className="text-sky-300 font-bold" /></span>
                                    ) : isOtherUserOnline ? (
                                      <span title="Delivered"><CheckCheck size={13} className="text-indigo-200/70" /></span>
                                    ) : (
                                      <span title="Sent"><Check size={13} className="text-indigo-200/70" /></span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Hover Actions for incoming messages (Reply only) */}
                          {!isMe && (
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-[#12131A] border border-white/10 rounded-xl px-1.5 py-0.5 shadow-lg mb-1 backdrop-blur-md">
                              <button
                                type="button"
                                onClick={() => setReplyingTo({
                                  id: msg.id,
                                  sender: senderName,
                                  text: parsed.type === "voice" ? "Voice Note" : parsed.text || "",
                                  isVoice: parsed.type === "voice",
                                })}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Reply"
                                aria-label="Reply"
                              >
                                <Reply size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {/* Bouncing Typing Bubble */}
                  {isOtherUserTyping && activeConversation?.type !== "group" && (
                    <div className="flex items-center gap-2 justify-start py-1">
                      <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {activeConversation?.other_user?.avatar?.includes("http") ? (
                          <img src={activeConversation.other_user.avatar} className="w-full h-full object-cover" />
                        ) : (
                          <UserAvatar avatar={activeConversation?.other_user?.avatar} size="sm" className="!w-full !h-full" />
                        )}
                      </div>
                      <div className="bg-white/10 border border-white/5 rounded-2xl rounded-tl-xs px-3.5 py-2.5 flex items-center gap-1 shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Floating Scroll to Bottom Arrow Button */}
                {showScrollToBottom && (
                  <button
                    type="button"
                    onClick={() => {
                      scrollToBottom("smooth");
                      setUnreadNewMsgs(0);
                    }}
                    className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold shadow-2xl backdrop-blur-md border border-white/20 transition-all transform animate-in fade-in slide-in-from-bottom-3 hover:scale-105 active:scale-95 cursor-pointer"
                    title="Go to recent messages"
                  >
                    <ArrowDown size={14} className="animate-bounce" />
                    {unreadNewMsgs > 0 ? (
                      <span>{unreadNewMsgs} new message{unreadNewMsgs > 1 ? "s" : ""}</span>
                    ) : (
                      <span>Recent msgs</span>
                    )}
                  </button>
                )}
              </div>

              {/* Chat Input or Blocked Notice */}
              {(() => {
                const otherUserId = activeConversation?.other_user?.id;
                const isBlocked = otherUserId && activeConversation?.type !== "group" 
                  ? blockedUsers.includes(otherUserId) 
                  : false;

                if (isBlocked) {
                  return (
                    <div className="p-4 border-t border-white/5 bg-rose-950/20 backdrop-blur-md flex items-center justify-between gap-3 shrink-0">
                      <div className="flex items-center gap-2 text-rose-300 text-xs sm:text-sm">
                        <ShieldAlert size={18} className="text-rose-400 shrink-0" />
                        <span>You have blocked this user. Unblock to send messages.</span>
                      </div>
                      <button
                        onClick={() => otherUserId && handleToggleBlock(otherUserId)}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md shrink-0 cursor-pointer"
                      >
                        Unblock
                      </button>
                    </div>
                  );
                }

                return (
                  <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-white/5 bg-black/40 backdrop-blur-md shrink-0">
                    {/* Replying Banner */}
                    {replyingTo && (
                      <div className="mb-2 flex items-center justify-between px-3.5 py-2 rounded-xl bg-indigo-950/50 border border-indigo-500/30 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <Reply size={14} className="text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-indigo-300">Replying to @{replyingTo.sender}: </span>
                            <span className="text-slate-300 truncate inline-block max-w-[200px] sm:max-w-md align-bottom">
                              {replyingTo.isVoice ? "🎵 Voice Note" : replyingTo.text}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Editing Banner */}
                    {editingMessage && (
                      <div className="mb-2 flex items-center justify-between px-3.5 py-2 rounded-xl bg-amber-950/50 border border-amber-500/30 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <Edit3 size={14} className="text-amber-400 shrink-0" />
                          <span className="font-semibold text-amber-300">Editing message</span>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Active Voice Recording Bar */}
                    {isRecordingVoice ? (
                      <div className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-950/30 border border-rose-500/30 rounded-2xl animate-in fade-in duration-200">
                        <div className="flex items-center gap-3">
                          <div className="relative flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping absolute" />
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                          </div>
                          <span className="text-xs font-semibold text-rose-300">
                            Recording Voice Note
                          </span>
                          <span className="text-xs font-mono font-bold text-white bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/30">
                            {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={cancelVoiceRecording}
                            className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Discard recording"
                          >
                            <Trash2 size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={sendVoiceRecording}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                          >
                            <Send size={14} />
                            <span>Send</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex items-center gap-2">
                        <input
                          ref={textInputRef}
                          type="text"
                          value={inputMessage}
                          onChange={handleInputChange}
                          placeholder={editingMessage ? "Edit message..." : "Type a message..."}
                          className="w-full pl-4 pr-24 py-3 bg-white/5 border border-white/10 rounded-2xl text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                        />

                        {/* Voice Note Record Button */}
                        <button
                          type="button"
                          onClick={startVoiceRecording}
                          className="absolute right-12 w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
                          title="Record voice note"
                          aria-label="Record voice note"
                        >
                          <Mic size={17} />
                        </button>

                        {/* Send / Save Button */}
                        <button
                          type="submit"
                          disabled={!inputMessage.trim()}
                          className="absolute right-1.5 w-9 h-9 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl transition-all shadow-md cursor-pointer disabled:cursor-not-allowed"
                          aria-label={editingMessage ? "Save Edit" : "Send Message"}
                        >
                          {editingMessage ? <Check size={16} /> : <Send size={15} />}
                        </button>
                      </div>
                    )}
                  </form>
                );
              })()}
            </>
          )}
        </div>
      </main>

      {/* Nickname Modal */}
      {isNicknameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12131A] border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Set Contact Nickname</h3>
            <p className="text-xs text-slate-400 mb-4">
              Give this contact a personal nickname. Only you can see this name.
            </p>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="e.g. Bestie, Johnny, Colleague"
              maxLength={30}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 mb-4"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNicknameModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              {activeConversation?.other_user?.id && nicknames[activeConversation.other_user.id] && (
                <button
                  type="button"
                  onClick={() => handleSaveNickname(activeConversation.other_user.id, "")}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (activeConversation?.other_user?.id) {
                    handleSaveNickname(activeConversation.other_user.id, nicknameInput);
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Chat Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12131A] border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <Trash2 size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Delete Conversation?</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Are you sure you want to delete this chat? All messages will be permanently deleted. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteChat}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center gap-2"
              >
                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                <span>{isDeleting ? "Deleting..." : "Delete Chat"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Message Confirmation Modal */}
      {deletingMessageId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#12131A] border border-rose-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <Trash2 size={24} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Delete Message?</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              This message will be permanently deleted for everyone in this chat.
            </p>
            <div className="flex items-center gap-2.5 justify-center">
              <button
                type="button"
                onClick={() => setDeletingMessageId(null)}
                className="flex-1 py-2 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteMessage}
                disabled={isDeletingMessage}
                className="flex-1 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {isDeletingMessage ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

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

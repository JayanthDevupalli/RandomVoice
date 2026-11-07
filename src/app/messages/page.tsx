"use client";

import React, { useEffect, useState, useRef, useCallback, Fragment } from "react";
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
  Eraser,
  ShieldAlert,
  ShieldCheck,
  Check,
  CheckCheck,
  Reply,
  Volume2,
  ArrowDown,
  PhoneCall,
  Lock,
  UserPlus,
  Info,
  Smile
} from "lucide-react";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useRouter } from "next/navigation";
import { CreateGroupModal } from "@/components/chat/CreateGroupModal";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { useGlobalPresence } from "@/components/providers/GlobalPresenceProvider";
import { useDMVoiceCall } from "@/components/providers/DMVoiceCallContext";
import { 
  parseMessageContent, 
  serializeTextMessage, 
  serializeVoiceMessage,
  serializeGifMessage,
  getSenderColor,
  getProfileDisplayName,
  isSameDay,
  formatChatDateDivider,
  ParsedMessage,
  MessageReaction,
  toggleReactionInContent
} from "@/lib/chat-utils";
import { QuickReactionPicker, ReactionBadges } from "@/components/chat/MessageReactions";
import { socialService, RelationshipStatus } from "@/lib/social-service";
import { RoomInviteCard } from "@/components/chat/RoomInviteCard";
import { GifPicker } from "@/components/chat/GifPicker";
import { MediaLightbox } from "@/components/chat/MediaLightbox";
import { GroupInfoModal } from "@/components/chat/GroupInfoModal";
import { AddGroupMemberModal } from "@/components/chat/AddGroupMemberModal";
import { MessageInfoModal } from "@/components/chat/MessageInfoModal";

function formatGroupSubtitle(
  members: Array<{ id: string; username: string; name?: string; displayName?: string; social_links?: any }>,
  currentUserId?: string
): string {
  if (!members || members.length === 0) return "Group Conversation";
  const names = members.map((m) => (m.id === currentUserId ? "You" : getProfileDisplayName(m, m.username)));
  const sortedNames = [...names.filter((n) => n === "You"), ...names.filter((n) => n !== "You")];
  if (sortedNames.length <= 4) {
    return sortedNames.join(", ");
  }
  return `${sortedNames.slice(0, 3).join(", ")}, +${sortedNames.length - 3} more`;
}

export default function MessagesPage() {
  const { user, isRegistered, isLoaded } = useUser();
  const { markAsRead, unreadByConversation } = useUnreadMessages();
  const { onlineUserIds } = useGlobalPresence();
  const { startCall, callState, activeCall } = useDMVoiceCall();
  const router = useRouter();
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [targetRelationship, setTargetRelationship] = useState<RelationshipStatus | null>(null);
  const [isRelationshipLoading, setIsRelationshipLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Feature 2: Nicknames ---
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");

  // --- Feature 3: Block (Bidirectional) ---
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]); // Users current user has blocked
  const [blockedMeUsers, setBlockedMeUsers] = useState<string[]>([]); // Users who have blocked current user

  // --- Feature 4: Delete & Clear Chat ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);

  // --- Dropdown Menu in Header ---
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  // --- Message Actions: Reply, Edit, Delete ---
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    sender: string;
    text: string;
    isVoice?: boolean;
    isGif?: boolean;
    gifUrl?: string;
  } | null>(null);

  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    text: string;
    replyTo?: any;
    reactions?: MessageReaction[];
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
  const [isOtherUserConvOnline, setIsOtherUserConvOnline] = useState(false);
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const [otherUserLastReadAt, setOtherUserLastReadAt] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const presenceChannelRef = useRef<any>(null);

  // --- Feature 7: Animated GIFs & Media Lightbox ---
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);
  const [expandedMediaTitle, setExpandedMediaTitle] = useState<string>("GIF");
  const [activeActionMsgId, setActiveActionMsgId] = useState<string | null>(null);
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);

  // --- Feature 8: Group Info & Management ---
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isAddGroupMemberOpen, setIsAddGroupMemberOpen] = useState(false);
  const [activeGroupMembers, setActiveGroupMembers] = useState<Array<{ id: string; username: string; role: string; avatar?: string; name?: string; displayName?: string; social_links?: any }>>([]);
  const [groupMembersReadMap, setGroupMembersReadMap] = useState<Record<string, string>>({});
  const [messageInfoTarget, setMessageInfoTarget] = useState<{
    message: {
      id: string;
      content: string;
      created_at: string;
      sender_id: string;
    };
    parsedMessage: ParsedMessage | null;
  } | null>(null);

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
          console.warn("Nested query warning, using fallback query:", error.message);
          
          // Resilient fallback query
          const { data: flatMembers } = await supabase
            .from("conversation_members")
            .select("conversation_id, joined_at")
            .eq("user_id", user.id);

          if (!flatMembers || flatMembers.length === 0) {
            setConversations([]);
            setIsLoading(false);
            return;
          }

          const convIds = flatMembers.map(m => m.conversation_id);
          const { data: convsData } = await supabase
            .from("conversations")
            .select("id, type, name, last_message_at")
            .in("id", convIds);

          const { data: otherMembersData } = await supabase
            .from("conversation_members")
            .select("conversation_id, user_id")
            .in("conversation_id", convIds)
            .neq("user_id", user.id);

          const otherUserIds = (otherMembersData || []).map(m => m.user_id);
          const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, username, avatar, social_links")
            .in("id", otherUserIds);

          const profileMap = new Map((profilesData || []).map(p => [p.id, p]));
          const convMap = new Map((convsData || []).map(c => [c.id, c]));

          const formattedFallback = flatMembers.map(m => {
            const conv = convMap.get(m.conversation_id);
            const otherMem = (otherMembersData || []).find(om => om.conversation_id === m.conversation_id);
            const profile = otherMem ? profileMap.get(otherMem.user_id) : null;
            return {
              id: m.conversation_id,
              type: conv?.type,
              name: conv?.name,
              last_message_at: conv?.last_message_at || new Date().toISOString(),
              other_user: profile
            };
          }).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());

          setConversations(formattedFallback);
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
                  avatar,
                  social_links
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
            avatar,
            social_links
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

  // Realtime & persistent read receipts broadcaster
  const broadcastReadReceipt = useCallback((latestTimestamp?: string) => {
    if (!activeConversationId || !user?.id) return;
    const nowMs = Date.now();
    const latestMsgMs = latestTimestamp ? new Date(latestTimestamp).getTime() : 0;
    const safeReadTime = new Date(Math.max(nowMs, latestMsgMs)).toISOString();

    // 1. Broadcast to active chat participants over presence channel
    if (presenceChannelRef.current) {
      try {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "read_receipt",
          payload: {
            user_id: user.id,
            conversation_id: activeConversationId,
            read_at: safeReadTime,
          },
        });
        presenceChannelRef.current.track({
          user_id: user.id,
          online_at: Date.now(),
          last_read_at: safeReadTime,
        });
      } catch (err) {}
    }

    // 2. Persist to DB conversation_members so future visits reflect seen state
    Promise.resolve(
      supabase
        .from("conversation_members")
        .update({ last_read_at: safeReadTime })
        .eq("conversation_id", activeConversationId)
        .eq("user_id", user.id)
    ).catch(() => {});
  }, [activeConversationId, user?.id]);

  // Mark active conversation as read
  useEffect(() => {
    if (activeConversationId) {
      const latestMsg = messages[messages.length - 1];
      markAsRead(activeConversationId, latestMsg?.created_at);
      broadcastReadReceipt(latestMsg?.created_at);
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
  }, [activeConversationId, markAsRead, broadcastReadReceipt, messages]);

  // Tab focus auto-read refresh
  useEffect(() => {
    const handleFocus = () => {
      if (activeConversationId && messages.length > 0) {
        const latestMsg = messages[messages.length - 1];
        markAsRead(activeConversationId, latestMsg?.created_at);
        broadcastReadReceipt(latestMsg?.created_at);
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [activeConversationId, messages, markAsRead, broadcastReadReceipt]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Load active group members for header subtitle, online indicators & member management
  const loadActiveGroupMembers = useCallback(async () => {
    if (!activeConversationId || activeConversation?.type !== "group") {
      setActiveGroupMembers([]);
      setGroupMembersReadMap({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from("conversation_members")
        .select(`
          user_id,
          role,
          last_read_at,
          profiles (
            id,
            username,
            avatar,
            social_links
          )
        `)
        .eq("conversation_id", activeConversationId);

      const initialReadMap: Record<string, string> = {};

      if (error) {
        // Fallback flat query if join fails
        const { data: flatMembers } = await supabase
          .from("conversation_members")
          .select("user_id, role, last_read_at")
          .eq("conversation_id", activeConversationId);

        if (flatMembers && flatMembers.length > 0) {
          flatMembers.forEach((m: any) => {
            if (m.user_id && m.last_read_at) {
              initialReadMap[m.user_id] = m.last_read_at;
            }
          });
          const uids = flatMembers.map((m: any) => m.user_id);
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, avatar, social_links")
            .in("id", uids);

          const pMap = new Map((profs || []).map((p: any) => [p.id, p]));
          const formatted = flatMembers.map((m: any) => {
            const p = pMap.get(m.user_id);
            const dName = getProfileDisplayName(p, p?.username || "Unknown");
            return {
              id: m.user_id,
              name: dName,
              displayName: dName,
              username: p?.username || "Unknown",
              role: m.role || "member",
              avatar: p?.avatar,
              social_links: p?.social_links,
            };
          });
          setActiveGroupMembers(formatted);
          setGroupMembersReadMap(initialReadMap);
          return;
        }
      }

      if (data) {
        data.forEach((d: any) => {
          if (d.user_id && d.last_read_at) {
            initialReadMap[d.user_id] = d.last_read_at;
          }
        });
        const membersList = data.map((d: any) => {
          const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
          const dName = getProfileDisplayName(profile, profile?.username || "Unknown");
          return {
            id: d.user_id,
            name: dName,
            displayName: dName,
            username: profile?.username || "Unknown",
            role: d.role || "member",
            avatar: profile?.avatar,
            social_links: profile?.social_links,
          };
        });
        setActiveGroupMembers(membersList);
        setGroupMembersReadMap(initialReadMap);
      }
    } catch (err) {
      console.error("Failed to load active group members:", err);
    }
  }, [activeConversationId, activeConversation?.type]);

  useEffect(() => {
    if (activeConversationId && activeConversation?.type === "group") {
      loadActiveGroupMembers();
    } else {
      setActiveGroupMembers([]);
      setGroupMembersReadMap({});
    }
  }, [activeConversationId, activeConversation?.type, loadActiveGroupMembers]);

  // Check relationship status for 1-on-1 direct conversations to ensure connection is accepted
  useEffect(() => {
    if (!activeConversation || activeConversation.type === "group" || !activeConversation.other_user?.id || !user?.id) {
      setTargetRelationship(null);
      return;
    }

    const otherId = activeConversation.other_user.id;
    let isSubscribed = true;
    setIsRelationshipLoading(true);

    const checkRelationship = async () => {
      try {
        const rel = await socialService.getRelationship(user.id, otherId);
        if (isSubscribed) {
          setTargetRelationship(rel);
        }
      } catch (err) {
        console.error("Failed to check DM relationship:", err);
      } finally {
        if (isSubscribed) setIsRelationshipLoading(false);
      }
    };

    checkRelationship();

    const handleSocialUpdate = () => {
      checkRelationship();
    };
    window.addEventListener("yapclub_social_updated", handleSocialUpdate);

    return () => {
      isSubscribed = false;
      window.removeEventListener("yapclub_social_updated", handleSocialUpdate);
    };
  }, [activeConversationId, activeConversation?.other_user?.id, user?.id]);

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

  // Load and sync blocked users (both directions)
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    const fetchBlocks = async () => {
      const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(user.id);
      setBlockedUsers(blockedByMeIds);
      setBlockedMeUsers(blockedMeIds);
    };

    fetchBlocks();

    const handleSocialUpdate = () => {
      fetchBlocks();
    };
    window.addEventListener("yapclub_social_updated", handleSocialUpdate);
    return () => window.removeEventListener("yapclub_social_updated", handleSocialUpdate);
  }, [user?.id, isRegistered]);

  const handleToggleBlock = async (targetUserId: string) => {
    if (!user?.id || !targetUserId) return;
    const isCurrentlyBlocked = blockedUsers.includes(targetUserId);

    if (isCurrentlyBlocked) {
      setBlockedUsers((prev) => prev.filter((id) => id !== targetUserId));
      await socialService.unblockUser(user.id, targetUserId);
    } else {
      setBlockedUsers((prev) => [...prev, targetUserId]);
      await socialService.blockUser(user.id, targetUserId);
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

  // Clear chat (empties all messages in active conversation without removing the chat)
  const handleClearChat = async () => {
    if (!activeConversationId || !user?.id) return;
    setIsClearingChat(true);
    try {
      // 1. Optimistic clear
      setMessages([]);
      setReplyingTo(null);
      setEditingMessage(null);

      // 2. Clear last message in conversation sidebar
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversationId
            ? { ...c, last_message: undefined, unread_count: 0 }
            : c
        )
      );

      // 3. Delete messages from database via API
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`/api/messages?conversationId=${activeConversationId}&userId=${user.id}`, {
        method: "DELETE",
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      // Direct fallback
      await supabase.from("messages").delete().eq("conversation_id", activeConversationId);

      // 4. Broadcast to peers in conversation
      if (presenceChannelRef.current) {
        try {
          presenceChannelRef.current.send({
            type: "broadcast",
            event: "chat_cleared",
            payload: { conversation_id: activeConversationId },
          });
        } catch (e) {}
      }

      setIsClearChatModalOpen(false);
      setIsHeaderMenuOpen(false);
    } catch (err) {
      console.error("Error clearing chat:", err);
    } finally {
      setIsClearingChat(false);
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

      // Block check
      const targetUserId = activeConversation?.other_user?.id;
      if (targetUserId && (blockedUsers.includes(targetUserId) || blockedMeUsers.includes(targetUserId))) {
        alert("Cannot send voice notes in this conversation.");
        return;
      }

      // Connection acceptance guard
      if (activeConversation?.type !== "group" && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
        alert("Messaging is locked until the follow request is accepted by both users.");
        return;
      }

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
      reactions: parsed.reactions,
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
      true,
      editingMessage.reactions
    );

    setMessages((prev) =>
      prev.map((m) => (m.id === editingMessage.id ? { ...m, content: newContent } : m))
    );

    const messageId = editingMessage.id;
    cancelEditing();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/messages", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/messages?id=${targetId}&userId=${user.id}`, {
        method: "DELETE",
        headers: {
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
      });

      if (!res.ok) {
        console.error("Error deleting message via API:", await res.text());
      }
    } catch (err) {
      console.error("Failed to delete message:", err);
    }
  };

  // --- Message Reactions: Instant Optimistic + Presence Broadcast + DB Persistence ---
  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg) return;

      const dName = getProfileDisplayName(user, user.username || "You");

      // 1. Optimistic state update
      const { newContent } = toggleReactionInContent(targetMsg.content, {
        emoji,
        userId: user.id,
        username: user.username,
        displayName: dName,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
      );

      // 2. Broadcast over active presence channel for instant 0ms UI update across participants
      if (presenceChannelRef.current) {
        try {
          presenceChannelRef.current.send({
            type: "broadcast",
            event: "message_reaction",
            payload: {
              messageId,
              emoji,
              userId: user.id,
              username: user.username,
              displayName: dName,
            },
          });
        } catch {}
      }

      // 3. Persist to DB via API
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
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
      } catch (err) {
        console.error("Failed to save reaction:", err);
      }
    },
    [messages, user]
  );

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

  // Realtime Presence, Typing & Read Receipts indicator for active chat (Direct & Group)
  useEffect(() => {
    if (!activeConversationId || !user?.id) {
      setIsOtherUserConvOnline(false);
      setIsOtherUserTyping(false);
      setOtherUserLastReadAt(null);
      return;
    }

    const isGroup = activeConversation?.type === "group";
    const otherUserId = activeConversation?.other_user?.id;
    if (!isGroup && !otherUserId) {
      setIsOtherUserConvOnline(false);
      setIsOtherUserTyping(false);
      setOtherUserLastReadAt(null);
      return;
    }

    // 1. Direct chat: Fetch persistent read receipt timestamp from DB so previously seen messages immediately render as "seen"
    if (!isGroup && otherUserId) {
      supabase
        .from("conversation_members")
        .select("last_read_at")
        .eq("conversation_id", activeConversationId)
        .eq("user_id", otherUserId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data?.last_read_at) {
            setOtherUserLastReadAt((prev) => {
              if (!prev || new Date(data.last_read_at).getTime() > new Date(prev).getTime()) {
                return data.last_read_at;
              }
              return prev;
            });
          }
        });
    }

    // 2. Realtime presence & broadcast channel (Active for direct and group conversations)
    const presenceChannel = supabase.channel(`conv_presence_${activeConversationId}`, {
      config: { presence: { key: user.id } },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        if (isGroup) {
          for (const key of Object.keys(state)) {
            const presences = state[key] as any[];
            for (const p of presences) {
              if (p?.user_id && p?.last_read_at && p.user_id !== user.id) {
                setGroupMembersReadMap((prev) => {
                  if (!prev[p.user_id] || new Date(p.last_read_at).getTime() > new Date(prev[p.user_id]).getTime()) {
                    return { ...prev, [p.user_id]: p.last_read_at };
                  }
                  return prev;
                });
              }
            }
          }
        } else {
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
          setIsOtherUserConvOnline(isOnline);
          if (latestReadTime) {
            setOtherUserLastReadAt((prev) => {
              if (!prev || new Date(latestReadTime!).getTime() > new Date(prev).getTime()) {
                return latestReadTime;
              }
              return prev;
            });
          }
        }
      })
      .on("broadcast", { event: "typing" }, (payload: any) => {
        if (!isGroup && payload.payload?.user_id === otherUserId) {
          setIsOtherUserTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsOtherUserTyping(false);
          }, 2500);
        }
      })
      .on("broadcast", { event: "read_receipt" }, (payload: any) => {
        const payloadUserId = payload.payload?.user_id;
        const incomingReadAt = payload.payload?.read_at;
        if (!payloadUserId || !incomingReadAt || payloadUserId === user.id) return;

        if (isGroup) {
          setGroupMembersReadMap((prev) => {
            if (!prev[payloadUserId] || new Date(incomingReadAt).getTime() > new Date(prev[payloadUserId]).getTime()) {
              return { ...prev, [payloadUserId]: incomingReadAt };
            }
            return prev;
          });
        } else if (payloadUserId === otherUserId) {
          setOtherUserLastReadAt((prev) => {
            if (!prev || new Date(incomingReadAt).getTime() > new Date(prev).getTime()) {
              return incomingReadAt;
            }
            return prev;
          });
        }
      })
      .on("broadcast", { event: "message_reaction" }, (payload: any) => {
        const { messageId, emoji, userId: rUserId, username: rUsername, displayName: rDisplayName } =
          payload.payload || {};
        if (!messageId || !emoji || !rUserId || rUserId === user.id) return;

        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const { newContent } = toggleReactionInContent(m.content, {
              emoji,
              userId: rUserId,
              username: rUsername,
              displayName: rDisplayName,
            });
            return { ...m, content: newContent };
          })
        );
      })
      .on("broadcast", { event: "chat_cleared" }, (payload: any) => {
        if (payload?.payload?.conversation_id === activeConversationId) {
          setMessages([]);
          setReplyingTo(null);
          setEditingMessage(null);
          setConversations((prev) =>
            prev.map((c) =>
              c.id === activeConversationId
                ? { ...c, last_message: undefined, unread_count: 0 }
                : c
            )
          );
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const nowIso = new Date().toISOString();
          await presenceChannel.track({ user_id: user.id, online_at: Date.now(), last_read_at: nowIso });
        }
      });

    presenceChannelRef.current = presenceChannel;

    // 3. Listen to DB changes on conversation_members for live persistent updates
    const membersChannel = supabase
      .channel(`members_sync_${activeConversationId}_${Math.random().toString(36).substring(2, 7)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.user_id || !updated?.last_read_at || updated.user_id === user.id) return;

          if (isGroup) {
            setGroupMembersReadMap((prev) => {
              if (!prev[updated.user_id] || new Date(updated.last_read_at).getTime() > new Date(prev[updated.user_id]).getTime()) {
                return { ...prev, [updated.user_id]: updated.last_read_at };
              }
              return prev;
            });
          } else if (updated.user_id === otherUserId) {
            setOtherUserLastReadAt((prev) => {
              if (!prev || new Date(updated.last_read_at).getTime() > new Date(prev).getTime()) {
                return updated.last_read_at;
              }
              return prev;
            });
          }
        }
      )
      .subscribe();

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(membersChannel);
      presenceChannelRef.current = null;
      setIsOtherUserConvOnline(false);
      setIsOtherUserTyping(false);
    };
  }, [activeConversationId, user?.id, activeConversation?.other_user?.id, activeConversation?.type]);

  const isOtherUserOnline = isOtherUserConvOnline || (activeConversation?.other_user?.id ? onlineUserIds.has(activeConversation.other_user.id) : false);

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

    if (user?.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }

    // Block guard
    const targetUserId = activeConversation?.other_user?.id;
    if (targetUserId && (blockedUsers.includes(targetUserId) || blockedMeUsers.includes(targetUserId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }

    // Connection acceptance guard
    if (activeConversation?.type !== "group" && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    const text = inputMessage.trim();
    const content = serializeTextMessage(text, replyingTo);
    setInputMessage("");
    setReplyingTo(null);

    // Optimistic message append for instant responsiveness
    const tempId = `temp-txt-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: content,
      created_at: nowIso,
      profiles: {
        username: user.username,
        avatar: user.avatar,
        social_links: { display_name: user.name || user.displayName },
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: content,
        })
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles (
            username,
            avatar,
            social_links
          )
        `)
        .single();

      if (!error && data) {
        const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, profiles: profile } : m)));
        await supabase
          .from("conversations")
          .update({ last_message_at: nowIso })
          .eq("id", activeConversationId);
        markAsRead(activeConversationId);
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const handleSendGif = async (gifUrl: string, gifTitle: string) => {
    if (!activeConversationId || !user) return;

    if (user?.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }

    const targetUserId = activeConversation?.other_user?.id;
    if (targetUserId && (blockedUsers.includes(targetUserId) || blockedMeUsers.includes(targetUserId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }

    if (activeConversation?.type !== "group" && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    const content = serializeGifMessage(gifUrl, gifTitle, replyingTo);
    setReplyingTo(null);
    setIsGifPickerOpen(false);

    // Optimistic message append
    const tempId = `temp-gif-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: {
        username: user.username,
        avatar: user.avatar,
        social_links: { display_name: user.name || user.displayName },
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: content,
        })
        .select(`
          id,
          content,
          created_at,
          sender_id,
          profiles (
            username,
            avatar,
            social_links
          )
        `)
        .single();

      if (!error && data) {
        const profile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...data, profiles: profile } : m)));
        await supabase
          .from("conversations")
          .update({ last_message_at: new Date().toISOString() })
          .eq("id", activeConversationId);
        markAsRead(activeConversationId);
      }
    } catch (err) {
      console.error("Error sending GIF message:", err);
    }
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
    const query = searchQuery.toLowerCase();
    if (conv.type === "group") {
      return (conv.name || "Group Chat").toLowerCase().includes(query);
    }
    const otherId = conv.other_user?.id;
    const nickname = otherId ? nicknames[otherId] : null;
    const shownName = getProfileDisplayName(conv.other_user, conv.other_user?.username || "");
    return (
      (nickname && nickname.toLowerCase().includes(query)) ||
      (shownName && shownName.toLowerCase().includes(query)) ||
      (conv.other_user?.username && conv.other_user.username.toLowerCase().includes(query))
    );
  });

  return (
    <div className="h-screen h-[100dvh] flex flex-col bg-background overflow-hidden">
      <Navbar className={activeConversationId ? "hidden sm:block" : "block"} />

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
                const shownName = getProfileDisplayName(conv.other_user, conv.other_user?.username || "Unknown");
                const title = isGroup 
                  ? (conv.name || "Group Chat") 
                  : (customNickname || shownName || "Unknown");
                const avatarUrl = isGroup ? null : conv.other_user?.avatar;
                const isBlocked = otherUserId ? blockedUsers.includes(otherUserId) : false;
                const isBlockedByOther = otherUserId ? blockedMeUsers.includes(otherUserId) : false;
                const isUserOnline = otherUserId ? onlineUserIds.has(otherUserId) : false;

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
                            {isBlockedByOther ? `${shownName || "User"} (Unavailable)` : title}
                          </h4>
                          {isBlocked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                              Blocked
                            </span>
                          )}
                          {isBlockedByOther && !isBlocked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/10 text-slate-400 border border-white/10 shrink-0">
                              Unavailable
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {new Date(conv.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${isGroup ? 'bg-indigo-400' : isBlocked ? 'bg-rose-500' : isUserOnline ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          <span>
                            {isGroup 
                              ? "Group Conversation" 
                              : isBlocked
                                ? "Blocked"
                                : isUserOnline
                                  ? "Online"
                                  : "Offline"}
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
                const isBlocked = otherUserId ? blockedUsers.includes(otherUserId) : false;
                const isBlockedByOther = otherUserId ? blockedMeUsers.includes(otherUserId) : false;
                const shownName = getProfileDisplayName(activeConversation?.other_user, activeConversation?.other_user?.username || "Chat");
                const headerTitle = isGroup 
                  ? (activeConversation.name || "Group Chat") 
                  : isBlockedByOther
                    ? `${shownName || "User"} (Unavailable)`
                    : (customNickname || shownName || "Chat");

                return (
                  <div className="relative z-30 h-14 sm:h-16 border-b border-white/5 flex items-center justify-between px-2.5 sm:px-6 shrink-0 bg-[#090A0F]/95 backdrop-blur-xl shadow-sm pt-[env(safe-area-inset-top,0px)]">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Back Button */}
                      <button
                        onClick={() => setActiveConversationId(null)}
                        className="p-2 -ml-1 rounded-full text-slate-300 hover:text-white active:bg-white/10 active:scale-95 transition-all cursor-pointer"
                        title="Back to conversations"
                        aria-label="Back to conversations"
                      >
                        <ArrowLeft size={20} />
                      </button>

                      <div
                        onClick={() => isGroup && setIsGroupInfoOpen(true)}
                        className={`flex items-center gap-2 sm:gap-3 min-w-0 ${isGroup ? "cursor-pointer group/hdr hover:opacity-95" : ""}`}
                        title={isGroup ? "Click for Group Info" : undefined}
                      >
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center border border-white/10 group-hover/hdr:border-indigo-500/50 transition-colors">
                          {isGroup ? (
                            <div className="w-full h-full bg-gradient-to-tr from-indigo-900/80 to-indigo-600/50 flex items-center justify-center text-indigo-300">
                              <Users size={18} />
                            </div>
                          ) : activeConversation?.other_user?.avatar?.includes("http") ? (
                            <img src={activeConversation.other_user.avatar} alt={headerTitle} className="w-full h-full object-cover" />
                          ) : (
                            <UserAvatar avatar={activeConversation?.other_user?.avatar} color="#6366F1" size="sm" className="!w-full !h-full" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm sm:text-base font-bold text-white truncate group-hover/hdr:text-indigo-300 transition-colors">
                              {headerTitle}
                            </h3>
                          </div>

                          {/* Status Subtitle: Online / Offline / Typing / Blocked / Unavailable */}
                          {isGroup ? (
                            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                              <span className="truncate">
                                {activeGroupMembers.length > 0
                                  ? `${formatGroupSubtitle(activeGroupMembers, user?.id)} (${activeGroupMembers.length} members)`
                                  : "Group Conversation"}
                              </span>
                            </p>
                          ) : isBlocked ? (
                            <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              Contact Blocked
                            </p>
                          ) : isBlockedByOther ? (
                            <p className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                              Account Unavailable
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
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Group Info button shortcut */}
                      {isGroup && (
                        <button
                          onClick={() => setIsGroupInfoOpen(true)}
                          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all flex items-center gap-1.5 text-xs font-semibold"
                          title="Group Info"
                          aria-label="Group Info"
                        >
                          <Users size={17} className="text-indigo-400" />
                          <span className="hidden sm:inline">Group Info</span>
                        </button>
                      )}
                      {/* Voice Call Button for 1-on-1 chats */}
                      {!isGroup && otherUserId && (
                        <button
                          onClick={() => {
                            if (isBlocked) {
                              alert("Cannot call a blocked contact.");
                              return;
                            }
                            if (isBlockedByOther) {
                              alert("This account is unavailable.");
                              return;
                            }
                            const peerUsername = customNickname || shownName || activeConversation?.other_user?.username || "Unknown";
                            const peerAvatar = activeConversation?.other_user?.avatar;
                            startCall(activeConversationId, {
                              id: otherUserId,
                              username: peerUsername,
                              avatar: peerAvatar,
                            });
                          }}
                          disabled={callState !== "idle" || isBlocked || isBlockedByOther || Boolean(targetRelationship && !targetRelationship.isAcceptedConnection)}
                          className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 text-xs font-semibold shadow-sm ${
                            callState !== "idle" && activeCall?.conversationId === activeConversationId
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                              : isBlocked || isBlockedByOther || (targetRelationship && !targetRelationship.isAcceptedConnection)
                              ? "opacity-50 cursor-not-allowed bg-white/5 text-slate-500 border border-white/5"
                              : "text-slate-200 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30"
                          }`}
                          title={isBlocked ? "Cannot call blocked contact" : isBlockedByOther ? "User is unavailable" : (targetRelationship && !targetRelationship.isAcceptedConnection) ? "Follow request must be accepted before calling" : "Start Voice Call"}
                        >
                          <PhoneCall size={15} className={isBlocked || isBlockedByOther || (targetRelationship && !targetRelationship.isAcceptedConnection) ? "text-slate-500" : "text-indigo-400"} />
                          <span className="hidden sm:inline">Voice Call</span>
                        </button>
                      )}

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
                          {isGroup && (
                            <>
                              <button
                                onClick={() => {
                                  setIsGroupInfoOpen(true);
                                  setIsHeaderMenuOpen(false);
                                }}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                              >
                                <Users size={15} className="text-indigo-400" />
                                <span>Group Info</span>
                              </button>

                              <button
                                onClick={() => {
                                  setIsAddGroupMemberOpen(true);
                                  setIsHeaderMenuOpen(false);
                                }}
                                className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                              >
                                <UserPlus size={15} className="text-indigo-400" />
                                <span>Add Participants</span>
                              </button>

                              <div className="h-px bg-white/5 my-1" />
                            </>
                          )}
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
                              setIsClearChatModalOpen(true);
                              setIsHeaderMenuOpen(false);
                            }}
                            className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-left"
                          >
                            <Eraser size={15} className="text-amber-400" />
                            <span>Clear Chat</span>
                          </button>

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
                  </div>
                );
              })()}

              {/* Chat Messages */}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div 
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-5 flex flex-col gap-1 sm:gap-2"
                >
                  {messages.length === 0 ? (
                    <div className="my-auto text-center py-10">
                      <p className="text-sm text-slate-400">No messages in this chat yet.</p>
                      <p className="text-xs text-slate-600 mt-1">Send a message to break the ice! 💬</p>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      const isMe = msg.sender_id === user.id;
                      const senderDisplayName = isMe 
                        ? "You" 
                        : getProfileDisplayName(msg.profiles, msg.profiles?.username || "Someone");
                      const senderUsername = msg.profiles?.username;
                      const senderAvatar = msg.profiles?.avatar;
                      const parsed = parseMessageContent(msg.content);

                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const isNewDay = !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);
                      const dateLabel = isNewDay ? formatChatDateDivider(msg.created_at) : null;
                      const isSameSenderAsPrev = !isNewDay && prevMsg && prevMsg.sender_id === msg.sender_id;
                      const isFirstInCluster = !isSameSenderAsPrev;

                      if (parsed.text && parsed.text.startsWith("📞")) {
                        return (
                          <Fragment key={msg.id}>
                            {isNewDay && dateLabel && (
                              <div className="w-full flex justify-center my-2.5 select-none pointer-events-none sticky top-1 z-20">
                                <div className="px-3.5 py-1 rounded-full bg-[#141622]/95 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-slate-300 shadow-md flex items-center gap-1.5 tracking-wide">
                                  <span>{dateLabel}</span>
                                </div>
                              </div>
                            )}
                            <div id={`msg-${msg.id}`} className="w-full flex justify-center my-2">
                              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950/40 border border-indigo-500/20 text-indigo-300 text-xs font-medium shadow-sm backdrop-blur-md">
                                <PhoneCall size={14} className="text-indigo-400 shrink-0" />
                                <span>{parsed.text.replace("📞", "").trim()}</span>
                                <span className="text-[10px] text-slate-500 ml-1 font-mono">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          </Fragment>
                        );
                      }

                      return (
                        <Fragment key={msg.id}>
                          {isNewDay && dateLabel && (
                            <div className="w-full flex justify-center my-2 select-none pointer-events-none shrink-0">
                              <div className="px-3 py-0.5 rounded-full bg-[#141622]/90 border border-white/10 text-[10px] font-semibold text-slate-300 shadow-md flex items-center gap-1.5 tracking-wide">
                                <span>{dateLabel}</span>
                              </div>
                            </div>
                          )}
                          <div 
                            id={`msg-${msg.id}`}
                            className={`group relative flex items-start gap-1.5 sm:gap-2 transition-all duration-300 rounded-2xl p-0.5 ${
                              isMe ? 'justify-end' : 'justify-start'
                            } ${isFirstInCluster ? 'mt-2.5 sm:mt-3' : 'mt-0.5 sm:mt-1'}`}
                          >
                          {/* Avatar in group for incoming messages: shown on first message of cluster, spacer on consecutive */}
                          {!isMe && activeConversation?.type === "group" && (
                            isFirstInCluster ? (
                              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10 mt-0.5 shadow-sm">
                                {senderAvatar?.includes("http") ? (
                                  <img src={senderAvatar} alt={senderDisplayName} className="w-full h-full object-cover" />
                                ) : (
                                  <UserAvatar avatar={senderAvatar} size="sm" className="!w-full !h-full" />
                                )}
                              </div>
                            ) : (
                              <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 pointer-events-none" />
                            )
                          )}

                          {/* Floating Action Menu for own messages (floats above bubble, does NOT squish bubble) */}
                          {isMe && (
                            <div className={`absolute -top-9 right-2 z-30 transition-all duration-150 ${
                              activeActionMsgId === msg.id
                                ? "opacity-100 scale-100 pointer-events-auto"
                                : "opacity-0 scale-95 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:scale-100 sm:group-hover:pointer-events-auto"
                            } flex items-center gap-0.5 bg-[#12131A]/95 border border-white/15 rounded-xl px-1.5 py-1 shadow-2xl backdrop-blur-xl`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMsgId(null);
                                  setReplyingTo({
                                    id: msg.id,
                                    sender: senderDisplayName,
                                    text: parsed.type === "voice" ? "Voice Note" : parsed.type === "gif" ? "GIF" : parsed.type === "room_invite" ? "Voice Hangout Invite" : parsed.text || "",
                                    isVoice: parsed.type === "voice",
                                    isGif: parsed.type === "gif",
                                    gifUrl: parsed.gifUrl,
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Reply"
                                aria-label="Reply"
                              >
                                <Reply size={13} />
                              </button>

                              {parsed.type !== "voice" && parsed.type !== "room_invite" && parsed.type !== "gif" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMsgId(null);
                                    startEditingMessage(msg.id, msg.content);
                                  }}
                                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                  title="Edit message"
                                  aria-label="Edit message"
                                >
                                  <Edit3 size={13} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMsgId(null);
                                  setDeletingMessageId(msg.id);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete message"
                                aria-label="Delete message"
                              >
                                <Trash2 size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMsgId(null);
                                  setMessageInfoTarget({
                                    message: msg,
                                    parsedMessage: parsed,
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-white/10 transition-colors"
                                title="Message info (Seen by)"
                                aria-label="Message info"
                              >
                                <Info size={13} />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id));
                                }}
                                className={`p-1 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/10 transition-colors ${
                                  activeReactionPickerMsgId === msg.id ? "text-amber-400 bg-white/10" : ""
                                }`}
                                title="React"
                                aria-label="React"
                              >
                                <Smile size={13} />
                              </button>
                            </div>
                          )}

                          <div className={`max-w-[85%] sm:max-w-[70%] min-w-[64px] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {/* Message Bubble Container */}
                            {(() => {
                              const isGif = parsed.type === "gif" && !!parsed.gifUrl;
                              const msgTime = new Date(msg.created_at).getTime();
                              const otherReadTime = otherUserLastReadAt ? new Date(otherUserLastReadAt).getTime() : 0;
                              const isMsgSeen = Boolean(otherUserLastReadAt && otherReadTime >= msgTime);
                              const isMsgDelivered = Boolean(isOtherUserOnline || isMsgSeen);
                              return (
                                <div 
                                  onClick={() => setActiveActionMsgId(prev => prev === msg.id ? null : msg.id)}
                                  className={`w-fit rounded-2xl shadow-md break-words min-w-[64px] max-w-full overflow-hidden cursor-pointer transition-all ${
                                    isGif 
                                      ? isMe
                                        ? 'p-1 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-xs'
                                        : 'p-1 bg-[#1e202c] text-slate-100 border border-white/5 rounded-tl-xs backdrop-blur-sm'
                                      : isMe 
                                        ? `px-3 py-1.5 sm:px-3.5 sm:py-2 text-sm leading-relaxed bg-gradient-to-r from-indigo-600 to-indigo-500 text-white ${
                                            isFirstInCluster ? 'rounded-tr-xs' : ''
                                          }` 
                                        : `px-3 py-1.5 sm:px-3.5 sm:py-2 text-sm leading-relaxed bg-[#1e202c] text-slate-100 border border-white/5 ${
                                            isFirstInCluster ? 'rounded-tl-xs' : ''
                                          } backdrop-blur-sm`
                                  }`}
                                >
                                  {/* WhatsApp-Style Group Chat Sender Name INSIDE the bubble (first in cluster only, NO @username) */}
                                  {!isMe && activeConversation?.type === "group" && isFirstInCluster && (
                                    <div className="mb-0.5 select-none pointer-events-none">
                                      <span className={`text-[11px] font-bold tracking-tight truncate block ${getSenderColor(senderDisplayName)}`}>
                                        {senderDisplayName}
                                      </span>
                                    </div>
                                  )}
                                  {/* Quoted Reply reference if this message was in reply to another */}
                                  {parsed.replyTo && (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        scrollToMessage(parsed.replyTo?.id);
                                      }}
                                      className={`mb-1.5 px-2.5 py-1.5 rounded-xl text-xs border-l-2 cursor-pointer transition-colors w-full min-w-0 overflow-hidden ${
                                        isMe
                                          ? "bg-indigo-950/70 border-white/70 hover:bg-indigo-950/90 text-white/90"
                                          : "bg-white/5 border-indigo-400 hover:bg-white/10 text-slate-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-1 font-semibold text-[11px] mb-0.5 text-indigo-300 min-w-0">
                                        <Reply size={11} className="rotate-180 shrink-0" />
                                        <span className="truncate">{parsed.replyTo.sender}</span>
                                      </div>
                                      <p className="line-clamp-2 text-[11px] opacity-80 break-words w-full overflow-hidden text-ellipsis">
                                        {parsed.replyTo.isVoice ? "🎵 Voice Note" : parsed.replyTo.isGif ? "🖼️ GIF" : parsed.replyTo.text}
                                      </p>
                                    </div>
                                  )}

                                  {/* Voice Note, Room Invite, GIF, or Text */}
                                  {parsed.type === "room_invite" && parsed.roomInvite ? (
                                    <RoomInviteCard invite={parsed.roomInvite} isMe={isMe} />
                                  ) : parsed.type === "voice" ? (
                                    <VoiceNotePlayer
                                      audioUrl={parsed.audioUrl || ""}
                                      duration={parsed.duration}
                                      isMe={isMe}
                                    />
                                  ) : isGif ? (
                                    <div className="relative rounded-xl overflow-hidden max-w-[240px] sm:max-w-[300px] bg-black/40 group/gif">
                                      <img
                                        src={parsed.gifUrl}
                                        alt={parsed.gifTitle || "GIF"}
                                        className="w-full h-auto max-h-[260px] sm:max-h-[300px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                                        loading="lazy"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedMediaUrl(parsed.gifUrl!);
                                          setExpandedMediaTitle(parsed.gifTitle || "GIF");
                                        }}
                                      />
                                      <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-black text-white/90 border border-white/10 pointer-events-none tracking-wider">
                                        GIF
                                      </div>
                                      <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-[9px] font-medium text-white/90 border border-white/10 flex items-center gap-1 select-none pointer-events-none">
                                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        {isMe && activeConversation?.type !== "group" && (
                                          <span className="inline-flex items-center gap-0.5 ml-0.5">
                                            {isMsgSeen ? (
                                              <span className="text-sky-400 font-bold flex items-center" title="Seen">
                                                <CheckCheck size={12} className="stroke-[2.5]" />
                                              </span>
                                            ) : isMsgDelivered ? (
                                              <span className="text-indigo-200/80 flex items-center" title="Delivered">
                                                <CheckCheck size={12} className="stroke-[1.8]" />
                                              </span>
                                            ) : (
                                              <span className="text-indigo-200/60 flex items-center" title="Sent">
                                                <Check size={11} className="stroke-[2]" />
                                              </span>
                                            )}
                                          </span>
                                        )}
                                        {isMe && activeConversation?.type === "group" && (() => {
                                          const otherMembers = activeGroupMembers.filter((m) => m.id !== user.id);
                                          const totalRecipients = otherMembers.length;
                                          if (totalRecipients === 0) return null;
                                          const readCount = otherMembers.filter((m) => {
                                            const r = groupMembersReadMap[m.id];
                                            return r && new Date(r).getTime() >= msgTime;
                                          }).length;
                                          const isAllSeen = readCount === totalRecipients;

                                          return (
                                            <span
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setMessageInfoTarget({ message: msg, parsedMessage: parsed });
                                              }}
                                              className={`inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded cursor-pointer pointer-events-auto hover:opacity-90 transition-all font-semibold ${
                                                isAllSeen
                                                  ? "text-sky-400"
                                                  : readCount > 0
                                                  ? "text-sky-300"
                                                  : "text-slate-300"
                                              }`}
                                              title="Click to view message info"
                                            >
                                              {isAllSeen ? (
                                                <>
                                                  <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                                                  <span>All</span>
                                                </>
                                              ) : readCount > 0 ? (
                                                <>
                                                  <CheckCheck size={11} className="stroke-[2] text-sky-400" />
                                                  <span>{readCount}/{totalRecipients}</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Check size={10} className="stroke-[2]" />
                                                </>
                                              )}
                                            </span>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-wrap items-end justify-between gap-x-2.5 gap-y-0.5">
                                      <p className="whitespace-pre-wrap select-text text-[13.5px] leading-relaxed break-words min-w-0">
                                        {parsed.text}
                                      </p>
                                      <div 
                                        className={`text-[9.5px] flex items-center gap-1 select-none shrink-0 ml-auto pb-0.5 ${
                                          isMe ? 'text-indigo-200/80' : 'text-slate-400'
                                        }`}
                                      >
                                        {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                                        <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                                        {/* WhatsApp-Style Sent / Delivered / Seen read receipts */}
                                        {isMe && activeConversation?.type !== "group" && (
                                          <span className="ml-0.5 inline-flex items-center gap-0.5">
                                            {isMsgSeen ? (
                                              <span className="text-sky-300 font-bold flex items-center gap-0.5" title="Seen">
                                                <CheckCheck size={12} className="stroke-[2.5] text-sky-400" />
                                              </span>
                                            ) : isMsgDelivered ? (
                                              <span className="text-indigo-200/80 flex items-center gap-0.5" title="Delivered">
                                                <CheckCheck size={12} className="stroke-[1.8]" />
                                              </span>
                                            ) : (
                                              <span className="text-indigo-200/60 flex items-center gap-0.5" title="Sent">
                                                <Check size={11} className="stroke-[2]" />
                                              </span>
                                            )}
                                          </span>
                                        )}

                                        {/* WhatsApp-Style Group Seen by Badge */}
                                        {isMe && activeConversation?.type === "group" && (() => {
                                          const otherMembers = activeGroupMembers.filter((m) => m.id !== user.id);
                                          const totalRecipients = otherMembers.length;
                                          if (totalRecipients === 0) return null;
                                          const readCount = otherMembers.filter((m) => {
                                            const r = groupMembersReadMap[m.id];
                                            return r && new Date(r).getTime() >= msgTime;
                                          }).length;
                                          const isAllSeen = readCount === totalRecipients;

                                          return (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setMessageInfoTarget({ message: msg, parsedMessage: parsed });
                                              }}
                                              className={`ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all hover:scale-105 cursor-pointer select-none ${
                                                isAllSeen
                                                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30"
                                                  : readCount > 0
                                                  ? "bg-indigo-900/60 text-indigo-200 border border-indigo-400/30 hover:bg-indigo-900/80"
                                                  : "bg-white/10 text-white/70 border border-white/10 hover:bg-white/15"
                                              }`}
                                              title="Click to view who read this message"
                                            >
                                              {isAllSeen ? (
                                                <>
                                                  <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                                                  <span>Seen by all</span>
                                                </>
                                              ) : readCount > 0 ? (
                                                <>
                                                  <CheckCheck size={11} className="stroke-[2] text-sky-400" />
                                                  <span>Seen by {readCount}/{totalRecipients}</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Check size={10} className="stroke-[2] text-white/60" />
                                                  <span>Delivered</span>
                                                </>
                                              )}
                                            </button>
                                          );
                                        })()}
                                      </div>
                                    </div>
                                  )}

                                  {/* Timestamp, (edited) and Read Receipts for Voice & Invite messages */}
                                  {(parsed.type === "voice" || parsed.type === "room_invite") && (
                                    <div 
                                      className={`text-[9px] mt-1 flex items-center gap-1 select-none ${
                                        isMe ? 'text-indigo-200/80 justify-end' : 'text-slate-400 justify-end'
                                      }`}
                                    >
                                      {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                                      <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                                      {/* WhatsApp-Style Sent / Delivered / Seen read receipts */}
                                      {isMe && activeConversation?.type !== "group" && (
                                        <span className="ml-1 inline-flex items-center gap-0.5">
                                          {isMsgSeen ? (
                                            <span className="text-sky-300 font-bold flex items-center gap-0.5" title="Seen">
                                              <CheckCheck size={13} className="stroke-[2.5] text-sky-400" />
                                            </span>
                                          ) : isMsgDelivered ? (
                                            <span className="text-indigo-200/80 flex items-center gap-0.5" title="Delivered">
                                              <CheckCheck size={13} className="stroke-[1.8]" />
                                            </span>
                                          ) : (
                                            <span className="text-indigo-200/60 flex items-center gap-0.5" title="Sent">
                                              <Check size={12} className="stroke-[2]" />
                                            </span>
                                          )}
                                        </span>
                                      )}

                                      {/* WhatsApp-Style Group Seen by Badge */}
                                      {isMe && activeConversation?.type === "group" && (() => {
                                        const otherMembers = activeGroupMembers.filter((m) => m.id !== user.id);
                                        const totalRecipients = otherMembers.length;
                                        if (totalRecipients === 0) return null;
                                        const readCount = otherMembers.filter((m) => {
                                          const r = groupMembersReadMap[m.id];
                                          return r && new Date(r).getTime() >= msgTime;
                                        }).length;
                                        const isAllSeen = readCount === totalRecipients;

                                        return (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setMessageInfoTarget({ message: msg, parsedMessage: parsed });
                                            }}
                                            className={`ml-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold transition-all hover:scale-105 cursor-pointer select-none ${
                                              isAllSeen
                                                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30"
                                                : readCount > 0
                                                ? "bg-indigo-900/60 text-indigo-200 border border-indigo-400/30 hover:bg-indigo-900/80"
                                                : "bg-white/10 text-white/70 border border-white/10 hover:bg-white/15"
                                            }`}
                                            title="Click to view who read this message"
                                          >
                                            {isAllSeen ? (
                                              <>
                                                <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                                                <span>Seen by all</span>
                                              </>
                                            ) : readCount > 0 ? (
                                              <>
                                                <CheckCheck size={11} className="stroke-[2] text-sky-400" />
                                                <span>Seen by {readCount}/{totalRecipients}</span>
                                              </>
                                            ) : (
                                              <>
                                                <Check size={10} className="stroke-[2] text-white/60" />
                                                <span>Delivered</span>
                                              </>
                                            )}
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Reaction Badges below the message bubble */}
                            <ReactionBadges
                              reactions={parsed.reactions}
                              currentUserId={user?.id}
                              onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                              onOpenPicker={() => setActiveReactionPickerMsgId(msg.id)}
                              isMe={isMe}
                            />
                          </div>

                          {/* Quick Reaction Floating Picker */}
                          {activeReactionPickerMsgId === msg.id && (
                            <div className={`absolute -top-10 ${isMe ? 'right-2' : 'left-2'} z-30`}>
                              <QuickReactionPicker
                                onSelect={(emoji) => {
                                  handleToggleReaction(msg.id, emoji);
                                  setActiveReactionPickerMsgId(null);
                                  setActiveActionMsgId(null);
                                }}
                                onClose={() => setActiveReactionPickerMsgId(null)}
                                isMe={isMe}
                              />
                            </div>
                          )}

                          {/* Floating Action Menu for incoming messages (floats above bubble, does NOT squish bubble) */}
                          {!isMe && (
                            <div className={`absolute -top-9 ${activeConversation?.type === "group" ? "left-9 sm:left-10" : "left-2"} z-30 transition-all duration-150 ${
                              activeActionMsgId === msg.id
                                ? "opacity-100 scale-100 pointer-events-auto"
                                : "opacity-0 scale-95 pointer-events-none sm:group-hover:opacity-100 sm:group-hover:scale-100 sm:group-hover:pointer-events-auto"
                            } flex items-center gap-0.5 bg-[#12131A]/95 border border-white/15 rounded-xl px-1.5 py-1 shadow-2xl backdrop-blur-xl shrink-0`}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveActionMsgId(null);
                                  setReplyingTo({
                                    id: msg.id,
                                    sender: senderDisplayName,
                                    text: parsed.type === "voice" ? "Voice Note" : parsed.type === "gif" ? "GIF" : parsed.type === "room_invite" ? "Voice Hangout Invite" : parsed.text || "",
                                    isVoice: parsed.type === "voice",
                                    isGif: parsed.type === "gif",
                                    gifUrl: parsed.gifUrl,
                                  });
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                                title="Reply"
                                aria-label="Reply"
                              >
                                <Reply size={13} />
                              </button>

                              {activeConversation?.type === "group" && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMsgId(null);
                                    setMessageInfoTarget({
                                      message: msg,
                                      parsedMessage: parsed,
                                    });
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                                  title="Message info (Seen by)"
                                  aria-label="Message info"
                                >
                                  <Info size={13} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id));
                                }}
                                className={`p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-white/10 active:scale-95 transition-all cursor-pointer ${
                                  activeReactionPickerMsgId === msg.id ? "text-amber-400 bg-white/10" : ""
                                }`}
                                title="React"
                                aria-label="React"
                              >
                                <Smile size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </Fragment>
                    );
                  })
                  )}

                  {/* Bouncing Typing Bubble */}
                  {isOtherUserTyping && activeConversation?.type !== "group" && (
                    <div className="flex items-center gap-2 justify-start py-1">
                      <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10 flex items-center justify-center">
                        {activeConversation?.other_user?.avatar?.includes("http") ? (
                          <img src={activeConversation.other_user.avatar} alt={getProfileDisplayName(activeConversation?.other_user)} className="w-full h-full object-cover" />
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
                const isGroup = activeConversation?.type === "group";
                const otherUserId = activeConversation?.other_user?.id;
                const isBlocked = otherUserId && !isGroup 
                  ? blockedUsers.includes(otherUserId) 
                  : false;
                const isBlockedByOther = otherUserId && !isGroup
                  ? blockedMeUsers.includes(otherUserId)
                  : false;

                if (user?.isBanned) {
                  return (
                    <div className="p-4 border-t border-white/5 bg-rose-950/30 backdrop-blur-md flex items-center justify-center gap-2 text-rose-300 text-xs sm:text-sm shrink-0">
                      <ShieldAlert size={18} className="text-rose-400 shrink-0" />
                      <span>Your account is suspended. Messaging is disabled.</span>
                    </div>
                  );
                }

                if (isBlockedByOther) {
                  return (
                    <div className="p-4 border-t border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-center gap-2 text-slate-400 text-xs sm:text-sm shrink-0">
                      <ShieldAlert size={16} className="text-slate-500" />
                      <span>You can&apos;t message this account.</span>
                    </div>
                  );
                }

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

                if (!isGroup && otherUserId && (isRelationshipLoading || !targetRelationship || !targetRelationship.isAcceptedConnection)) {
                  if (isRelationshipLoading && !targetRelationship) {
                    return (
                      <div className="p-3 sm:p-4 border-t border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-center gap-2 text-slate-400 text-xs">
                        <Loader2 size={16} className="animate-spin text-indigo-400" />
                        <span>Verifying connection status...</span>
                      </div>
                    );
                  }

                  return (
                    <div className="p-3 sm:p-4 border-t border-white/5 bg-black/40 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 animate-in fade-in">
                      <div className="flex items-center gap-2.5 text-amber-300 text-xs sm:text-sm">
                        <Lock size={18} className="text-amber-400 shrink-0" />
                        <span>
                          {targetRelationship?.hasPendingRequestFromMe
                            ? "Follow request sent. Messaging is locked until they accept."
                            : targetRelationship?.hasPendingRequestFromThem
                            ? "This user sent you a follow request. Accept to start messaging."
                            : "Follow request must be accepted before you can send messages."}
                        </span>
                      </div>
                      {targetRelationship?.hasPendingRequestFromThem ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!user || !otherUserId) return;
                              const res = await socialService.acceptFollowRequest(user.id, otherUserId, targetRelationship.incomingRequestId);
                              if (res.success) {
                                const rel = await socialService.getRelationship(user.id, otherUserId);
                                setTargetRelationship(rel);
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-1.5"
                          >
                            <Check size={14} />
                            <span>Accept Request</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!user || !otherUserId) return;
                              const res = await socialService.declineFollowRequest(user.id, otherUserId, targetRelationship.incomingRequestId);
                              if (res.success) {
                                const rel = await socialService.getRelationship(user.id, otherUserId);
                                setTargetRelationship(rel);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      ) : targetRelationship?.hasPendingRequestFromMe ? (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user || !otherUserId) return;
                            const res = await socialService.cancelFollowRequest(user.id, otherUserId);
                            if (res.success) {
                              const rel = await socialService.getRelationship(user.id, otherUserId);
                              setTargetRelationship(rel);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
                        >
                          Cancel Request
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!user || !otherUserId) return;
                            const res = await socialService.followUser(user.id, otherUserId);
                            if (res.success) {
                              const rel = await socialService.getRelationship(user.id, otherUserId);
                              setTargetRelationship(rel);
                            } else if (res.error) {
                              alert(res.error);
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-1.5"
                        >
                          <UserPlus size={14} />
                          <span>Send Follow Request</span>
                        </button>
                      )}
                    </div>
                  );
                }

                return (
                  <form onSubmit={handleSendMessage} className="relative p-2 sm:p-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] border-t border-white/5 bg-[#090A0F]/95 backdrop-blur-xl shrink-0">
                    {/* GIF Picker Popover / Mobile Drawer */}
                    <GifPicker
                      isOpen={isGifPickerOpen}
                      onClose={() => setIsGifPickerOpen(false)}
                      onSelectGif={handleSendGif}
                    />

                    {/* Replying Banner */}
                    {replyingTo && (
                      <div className="mb-2 flex items-center justify-between px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <Reply size={14} className="text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-indigo-300">Replying to {replyingTo.sender}: </span>
                            <span className="text-slate-300 truncate inline-block max-w-[180px] sm:max-w-md align-bottom">
                              {replyingTo.isVoice ? "🎵 Voice Note" : replyingTo.isGif ? "🖼️ GIF" : replyingTo.text}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingTo(null)}
                          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Editing Banner */}
                    {editingMessage && (
                      <div className="mb-2 flex items-center justify-between px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-amber-950/60 border border-amber-500/30 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <Edit3 size={14} className="text-amber-400 shrink-0" />
                          <span className="font-semibold text-amber-300">Editing message</span>
                        </div>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {/* Active Voice Recording Bar */}
                    {isRecordingVoice ? (
                      <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 bg-rose-950/40 border border-rose-500/30 rounded-full animate-in fade-in duration-200">
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping absolute" />
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                          </div>
                          <span className="text-xs font-semibold text-rose-300 hidden xs:inline">
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
                            className="p-2 rounded-full bg-white/5 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Discard recording"
                          >
                            <Trash2 size={16} />
                          </button>

                          <button
                            type="button"
                            onClick={sendVoiceRecording}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                          >
                            <Send size={14} />
                            <span>Send</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* GIF Picker Button on Left */}
                        <button
                          type="button"
                          onClick={() => setIsGifPickerOpen(!isGifPickerOpen)}
                          className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full transition-all shrink-0 cursor-pointer ${
                            isGifPickerOpen
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                              : "text-slate-400 hover:text-white hover:bg-white/10 active:scale-95"
                          }`}
                          title="Send GIF"
                          aria-label="Send GIF"
                        >
                          <span className="text-[10px] font-black tracking-wider border border-current px-1 py-0.5 rounded leading-none">
                            GIF
                          </span>
                        </button>

                        {/* Message Text Input */}
                        <div className="relative flex-1 min-w-0">
                          <input
                            ref={textInputRef}
                            type="text"
                            value={inputMessage}
                            onChange={handleInputChange}
                            placeholder={editingMessage ? "Edit message..." : "Type a message..."}
                            className="w-full px-4 py-2.5 sm:py-3 bg-white/5 border border-white/10 rounded-full text-base sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors shadow-inner"
                          />
                        </div>

                        {/* Voice Note Record Button (When not typing & not editing) */}
                        {!inputMessage.trim() && !editingMessage && (
                          <button
                            type="button"
                            onClick={startVoiceRecording}
                            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white active:scale-95 transition-all shrink-0 cursor-pointer border border-white/10"
                            title="Record voice note"
                            aria-label="Record voice note"
                          >
                            <Mic size={18} />
                          </button>
                        )}

                        {/* Send / Save Button (Active when typing or editing) */}
                        {(inputMessage.trim() || editingMessage) && (
                          <button
                            type="submit"
                            className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-full transition-all shadow-md shadow-indigo-600/30 shrink-0 cursor-pointer animate-in zoom-in-75 duration-150"
                            aria-label={editingMessage ? "Save Edit" : "Send Message"}
                          >
                            {editingMessage ? <Check size={18} /> : <Send size={16} />}
                          </button>
                        )}
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

      {/* Clear Chat Confirmation Modal */}
      {isClearChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#12131A] border border-white/10 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
              <Eraser size={20} />
            </div>
            <h3 className="text-base font-bold text-white mb-1">Clear this chat?</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Are you sure you want to clear all messages in this chat? All messages will be permanently deleted for everyone in this chat. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isClearingChat}
                onClick={() => setIsClearChatModalOpen(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isClearingChat}
                onClick={handleClearChat}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isClearingChat && <Loader2 size={14} className="animate-spin" />}
                <span>{isClearingChat ? "Clearing..." : "Clear Chat"}</span>
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

      {/* WhatsApp-Style Group Info Modal */}
      {activeConversation && activeConversation.type === "group" && (
        <GroupInfoModal
          isOpen={isGroupInfoOpen}
          onClose={() => setIsGroupInfoOpen(false)}
          conversationId={activeConversation.id}
          groupName={activeConversation.name || "Group Chat"}
          currentUser={user}
          onlineUserIds={onlineUserIds}
          onMembersChange={loadActiveGroupMembers}
          onUpdateGroupName={(newName) => {
            setConversations((prev) =>
              prev.map((c) => (c.id === activeConversation.id ? { ...c, name: newName } : c))
            );
          }}
          onLeaveGroup={() => {
            setConversations((prev) => prev.filter((c) => c.id !== activeConversation.id));
            setActiveConversationId(null);
            setIsGroupInfoOpen(false);
          }}
          onOpenDirectMessage={async (targetUserId) => {
            if (!user?.id || targetUserId === user.id) return;
            try {
              const convId = await socialService.ensureDirectConversation(user.id, targetUserId);
              if (convId) {
                setActiveConversationId(convId);
                setIsGroupInfoOpen(false);
              }
            } catch (e) {
              console.error("Error opening DM with group member:", e);
            }
          }}
        />
      )}

      {/* Add Members to Group Modal */}
      {activeConversation && activeConversation.type === "group" && (
        <AddGroupMemberModal
          isOpen={isAddGroupMemberOpen}
          onClose={() => setIsAddGroupMemberOpen(false)}
          conversationId={activeConversation.id}
          existingMemberIds={activeGroupMembers.map((m) => m.id)}
          currentUser={user}
          onMembersAdded={loadActiveGroupMembers}
        />
      )}

      {/* WhatsApp-Style Message Info ("Seen by") Modal */}
      {messageInfoTarget && (
        <MessageInfoModal
          isOpen={!!messageInfoTarget}
          onClose={() => setMessageInfoTarget(null)}
          message={messageInfoTarget.message}
          parsedMessage={messageInfoTarget.parsedMessage}
          readMembers={(() => {
            if (!messageInfoTarget) return [];
            const msgTime = new Date(messageInfoTarget.message.created_at).getTime();
            if (activeConversation?.type === "group") {
              const otherMembers = activeGroupMembers.filter((m) => m.id !== user?.id);
              return otherMembers
                .filter((m) => {
                  const readIso = groupMembersReadMap[m.id];
                  return readIso && new Date(readIso).getTime() >= msgTime;
                })
                .map((m) => ({
                  id: m.id,
                  username: m.username,
                  name: m.name,
                  displayName: m.displayName || m.name || m.username,
                  avatar: m.avatar,
                  readAt: groupMembersReadMap[m.id],
                }));
            } else if (activeConversation?.other_user) {
              const otherReadTime = otherUserLastReadAt ? new Date(otherUserLastReadAt).getTime() : 0;
              if (otherUserLastReadAt && otherReadTime >= msgTime) {
                return [
                  {
                    id: activeConversation.other_user.id,
                    username: activeConversation.other_user.username,
                    name: activeConversation.other_user.name,
                    displayName: getProfileDisplayName(activeConversation.other_user, activeConversation.other_user.username),
                    avatar: activeConversation.other_user.avatar,
                    readAt: otherUserLastReadAt,
                  },
                ];
              }
            }
            return [];
          })()}
          unreadMembers={(() => {
            if (!messageInfoTarget) return [];
            const msgTime = new Date(messageInfoTarget.message.created_at).getTime();
            if (activeConversation?.type === "group") {
              const otherMembers = activeGroupMembers.filter((m) => m.id !== user?.id);
              return otherMembers
                .filter((m) => {
                  const readIso = groupMembersReadMap[m.id];
                  return !readIso || new Date(readIso).getTime() < msgTime;
                })
                .map((m) => ({
                  id: m.id,
                  username: m.username,
                  name: m.name,
                  displayName: m.displayName || m.name || m.username,
                  avatar: m.avatar,
                }));
            } else if (activeConversation?.other_user) {
              const otherReadTime = otherUserLastReadAt ? new Date(otherUserLastReadAt).getTime() : 0;
              if (!otherUserLastReadAt || otherReadTime < msgTime) {
                return [
                  {
                    id: activeConversation.other_user.id,
                    username: activeConversation.other_user.username,
                    name: activeConversation.other_user.name,
                    displayName: getProfileDisplayName(activeConversation.other_user, activeConversation.other_user.username),
                    avatar: activeConversation.other_user.avatar,
                  },
                ];
              }
            }
            return [];
          })()}
          onlineUserIds={onlineUserIds}
        />
      )}

      {/* Fullscreen Media Lightbox for GIFs and Photos */}
      <MediaLightbox
        mediaUrl={expandedMediaUrl}
        onClose={() => setExpandedMediaUrl(null)}
        title={expandedMediaTitle}
      />
    </div>
  );
}

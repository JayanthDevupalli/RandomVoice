"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo, Fragment } from "react";
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
  Smile,
  Tag,
  Image as ImageIcon
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
  serializeNicknameMessage,
  serializeImagesMessage,
  ChatImageItem,
  getSenderColor,
  getProfileDisplayName,
  isSameDay,
  formatChatDateDivider,
  ParsedMessage,
  MessageReaction,
  NicknameUpdateData,
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
import { WhatsAppImageCluster } from "@/components/chat/WhatsAppImageCluster";
import { compressImage, encryptImage } from "@/lib/e2ee-service";

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
  const { onlineUserIds, showOnline, setShowOnline } = useGlobalPresence();
  const { startCall, callState, activeCall } = useDMVoiceCall();
  const router = useRouter();
  
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [targetRelationship, setTargetRelationship] = useState<RelationshipStatus | null>(null);
  const [isRelationshipLoading, setIsRelationshipLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatFilter, setChatFilter] = useState<"all" | "direct" | "groups" | "unread">("all");

  const unreadConversationsCount = useMemo(() => {
    return conversations.filter((c) => (unreadByConversation[c.id] || 0) > 0).length;
  }, [conversations, unreadByConversation]);

  const groupsCount = useMemo(() => {
    return conversations.filter((c) => c.type === "group").length;
  }, [conversations]);

  const directCount = useMemo(() => {
    return conversations.filter((c) => c.type !== "group").length;
  }, [conversations]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Feature 2: Nicknames ---
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameTargetUserId, setNicknameTargetUserId] = useState<string | null>(null);
  const [nicknameTargetName, setNicknameTargetName] = useState<string | null>(null);

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      // 1. WhatsApp-style category filter (All / Direct / Groups / Unread)
      if (chatFilter === "direct" && conv.type === "group") return false;
      if (chatFilter === "groups" && conv.type !== "group") return false;
      if (chatFilter === "unread") {
        const unseenCount = unreadByConversation[conv.id] || 0;
        if (unseenCount <= 0) return false;
      }

      // 2. Search query filter
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
  }, [conversations, chatFilter, searchQuery, nicknames, unreadByConversation]);

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
    isImages?: boolean;
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

  // Latest message timestamp received from the other user (messages sent before this are guaranteed seen)
  const otherUserLatestMsgTime = useMemo(() => {
    if (!user?.id || !messages.length) return 0;
    let maxTime = 0;
    for (const m of messages) {
      if (m.sender_id !== user.id) {
        const t = new Date(m.created_at).getTime();
        if (t > maxTime) maxTime = t;
      }
    }
    return maxTime;
  }, [messages, user?.id]);

  // --- Feature 7: Animated GIFs & Media Lightbox ---
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);
  const [expandedMediaTitle, setExpandedMediaTitle] = useState<string>("GIF");
  const [lightboxImages, setLightboxImages] = useState<Array<{ url: string; caption?: string; title?: string }>>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxMessageId, setLightboxMessageId] = useState<string | null>(null);

  // --- Feature: End-to-End Encrypted Photo Sharing (WhatsApp Style) ---
  const [stagedImages, setStagedImages] = useState<Array<{ id: string; file: File; previewUrl: string; width?: number; height?: number }>>([]);
  const [isEncryptingImages, setIsEncryptingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
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

  // Auto-scroll to bottom of chat (contained within chat container, NEVER scrolls window/document)
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      if (behavior === "smooth") {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, []);

  // When switching conversations, pin window scroll to 0 and scroll messages to bottom
  useEffect(() => {
    if (activeConversationId) {
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      setShowScrollToBottom(false);
      setUnreadNewMsgs(0);
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    }
  }, [activeConversationId, scrollToBottom]);

  // When messages update in the active chat
  useEffect(() => {
    if (!activeConversationId) return;
    if (showScrollToBottom) {
      setUnreadNewMsgs(prev => prev + 1);
    } else {
      scrollToBottom("auto");
    }
  }, [messages.length, activeConversationId, showScrollToBottom, scrollToBottom]);

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

    // 2. Persist to profiles.social_links as resilient primary storage across all devices/incognito
    Promise.resolve(
      supabase
        .from("profiles")
        .select("social_links")
        .eq("id", user.id)
        .maybeSingle()
    ).then(({ data }) => {
      const links = data?.social_links || {};
      const lastReadMap = links.last_read_map || {};
      lastReadMap[activeConversationId] = safeReadTime;
      return supabase
        .from("profiles")
        .update({ social_links: { ...links, last_read_map: lastReadMap } })
        .eq("id", user.id);
    }).catch(() => {});

    // 3. Persist to conversation_members table (safely caught in case column does not exist)
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

  // Real-time conversation-level nicknames parsed chronologically from messages
  const conversationNicknames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const msg of messages) {
      const parsed = parseMessageContent(msg.content);
      if (parsed.type === "nickname_update" && parsed.nicknameUpdate) {
        const { targetUserId, nickname, action } = parsed.nicknameUpdate;
        if (targetUserId) {
          if (action === "set" && nickname && nickname.trim()) {
            map[targetUserId] = nickname.trim();
          } else if (action === "cleared") {
            delete map[targetUserId];
          }
        }
      }
    }
    return map;
  }, [messages]);

  // Map of each member's latest message time in this conversation (proves user was active up to this time)
  const memberLatestMsgTimeMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const msg of messages) {
      if (msg.sender_id && msg.created_at) {
        const time = new Date(msg.created_at).getTime();
        if (!map[msg.sender_id] || time > map[msg.sender_id]) {
          map[msg.sender_id] = time;
        }
      }
    }
    return map;
  }, [messages]);

  // Load active group members for header subtitle, online indicators & member management
  const loadActiveGroupMembers = useCallback(async () => {
    if (!activeConversationId) {
      setActiveGroupMembers([]);
      setGroupMembersReadMap({});
      return;
    }
    // If conversation is already loaded and is confirmed NOT a group, return early
    if (activeConversation && activeConversation.type !== "group") {
      setActiveGroupMembers([]);
      setGroupMembersReadMap({});
      return;
    }
    try {
      let membersData: any[] = [];
      const { data, error } = await supabase
        .from("conversation_members")
        .select(`
          user_id,
          role,
          profiles (
            id,
            username,
            avatar,
            social_links
          )
        `)
        .eq("conversation_id", activeConversationId);

      if (!error && data && data.length > 0) {
        membersData = data;
      } else {
        // Fallback flat query if join fails
        const { data: flatMembers } = await supabase
          .from("conversation_members")
          .select("user_id, role")
          .eq("conversation_id", activeConversationId);

        if (flatMembers && flatMembers.length > 0) {
          const uids = flatMembers.map((m: any) => m.user_id).filter(Boolean);
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, username, avatar, social_links")
            .in("id", uids);

          const pMap = new Map((profs || []).map((p: any) => [p.id, p]));
          membersData = flatMembers.map((m: any) => ({
            user_id: m.user_id,
            role: m.role,
            profiles: pMap.get(m.user_id) || null,
          }));
        }
      }

      const initialReadMap: Record<string, string> = {};

      const membersList = membersData.map((d: any) => {
        const profile = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
        const dName = getProfileDisplayName(profile, profile?.username || "Unknown");
        const readFromSocial = (profile?.social_links as any)?.last_read_map?.[activeConversationId];
        const memberMsgTime = memberLatestMsgTimeMap[d.user_id]
          ? new Date(memberLatestMsgTimeMap[d.user_id]).toISOString()
          : undefined;

        // Current user is actively looking at this conversation right now
        const isSelf = d.user_id === user?.id;
        const selfTime = isSelf ? new Date().toISOString() : undefined;

        const effectiveReadIso = [readFromSocial, memberMsgTime, selfTime]
          .filter(Boolean)
          .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

        if (effectiveReadIso && d.user_id) {
          initialReadMap[d.user_id] = effectiveReadIso;
        }

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
      setGroupMembersReadMap((prev) => ({
        ...initialReadMap,
        ...prev,
      }));
    } catch (err) {
      console.error("Failed to load active group members:", err);
    }
  }, [activeConversationId, activeConversation?.type, memberLatestMsgTimeMap, user?.id]);

  useEffect(() => {
    if (activeConversationId && (!activeConversation || activeConversation.type === "group")) {
      loadActiveGroupMembers();
    } else {
      setActiveGroupMembers([]);
      setGroupMembersReadMap({});
    }
  }, [activeConversationId, activeConversation?.type, loadActiveGroupMembers]);

  // Comprehensive check whether a group member has read a message
  const isMemberRead = useCallback(
    (memberId: string, msgTime: number) => {
      // 1. From groupMembersReadMap (realtime presence, postgres change, social_links, conversation_members)
      const readIso = groupMembersReadMap[memberId];
      const readTime = readIso ? new Date(readIso).getTime() : 0;
      // 2. From messages sent by this member in this chat (if they sent a message at or after msgTime, they've seen it)
      const latestMsgTime = memberLatestMsgTimeMap[memberId] || 0;
      const effectiveReadTime = Math.max(readTime, latestMsgTime);
      // 3-second buffer for client-server clock skew
      return effectiveReadTime > 0 && effectiveReadTime >= msgTime - 3000;
    },
    [groupMembersReadMap, memberLatestMsgTimeMap]
  );

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
    const trimmedNick = newNickname.trim();
    if (trimmedNick) {
      updated[targetUserId] = trimmedNick;
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
    setNicknameTargetUserId(null);
    setNicknameTargetName(null);

    // 4. Persist to Supabase user_metadata for cloud persistence across logins
    try {
      await supabase.auth.updateUser({
        data: { nicknames: updated }
      });
    } catch (e) {
      console.error("Failed to sync nicknames to Supabase user_metadata:", e);
    }

    // 5. Send Instagram-style Real-time System Announcement into active conversation
    if (activeConversationId) {
      const otherUser = activeConversation?.other_user;
      const targetDisplayName = otherUser?.id === targetUserId 
        ? getProfileDisplayName(otherUser, otherUser?.username || "friend")
        : (user.id === targetUserId ? (user.name || user.displayName || user.username || "You") : (nicknameTargetName || "friend"));
      
      const myDisplayName = getProfileDisplayName(user, user.username || "Someone");

      const nicknamePayload: NicknameUpdateData = {
        setterId: user.id,
        setterUsername: myDisplayName,
        targetUserId,
        targetUsername: targetDisplayName,
        nickname: trimmedNick,
        action: trimmedNick ? "set" : "cleared",
      };

      const serialized = serializeNicknameMessage(nicknamePayload);

      // Optimistic append to message list for instant UI feedback
      const tempId = `temp-nick-${Date.now()}`;
      const nowIso = new Date().toISOString();
      const optimisticMsg = {
        id: tempId,
        conversation_id: activeConversationId,
        sender_id: user.id,
        content: serialized,
        created_at: nowIso,
        profiles: {
          username: user.username,
          avatar: user.avatar,
          social_links: { display_name: myDisplayName },
        },
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        await supabase.from("messages").insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: serialized,
        });

        await supabase
          .from("conversations")
          .update({ last_message_at: nowIso })
          .eq("id", activeConversationId);
      } catch (err) {
        console.error("Failed to publish nickname announcement:", err);
      }
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

    // 1. Instant optimistic local state update
    if (isCurrentlyBlocked) {
      setBlockedUsers((prev) => prev.filter((id) => id !== targetUserId));
    } else {
      setBlockedUsers((prev) => [...prev, targetUserId]);
    }
    setIsHeaderMenuOpen(false);

    // 2. Realtime presence broadcast so other user's UI responds immediately
    if (presenceChannelRef.current) {
      try {
        presenceChannelRef.current.send({
          type: "broadcast",
          event: "block_status_changed",
          payload: {
            blocker_id: user.id,
            blocked_id: targetUserId,
            is_blocked: !isCurrentlyBlocked,
          },
        });
      } catch (err) {}
    }

    // 3. Persist via backend API
    try {
      if (isCurrentlyBlocked) {
        await socialService.unblockUser(user.id, targetUserId);
      } else {
        await socialService.blockUser(user.id, targetUserId);
      }
    } catch (err) {
      console.error("Failed to toggle block:", err);
    }
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

      // Connection acceptance guard (relaxed if chat history exists)
      if (activeConversation?.type !== "group" && messages.length === 0 && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
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
    if (parsed.type === "voice" || parsed.type === "images" || parsed.type === "gif" || parsed.type === "room_invite") return;
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
    if (!msgId || !chatContainerRef.current) return;
    const elem = document.getElementById(`msg-${msgId}`);
    if (elem) {
      const container = chatContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elemRect = elem.getBoundingClientRect();
      const relativeTop = elemRect.top - containerRect.top + container.scrollTop;
      container.scrollTo({
        top: relativeTop - container.clientHeight / 2 + elem.clientHeight / 2,
        behavior: "smooth",
      });
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

    // 1. Direct chat: Fetch persistent read receipt timestamp so previously seen messages immediately render as "seen"
    if (!isGroup && otherUserId) {
      // Fetch from profiles.social_links.last_read_map (publicly readable across RLS)
      supabase
        .from("profiles")
        .select("social_links")
        .eq("id", otherUserId)
        .maybeSingle()
        .then(({ data }) => {
          const theirReadTime = (data?.social_links as any)?.last_read_map?.[activeConversationId];
          if (theirReadTime) {
            setOtherUserLastReadAt((prev) => {
              if (!prev || new Date(theirReadTime).getTime() > new Date(prev).getTime()) {
                return theirReadTime;
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
      .on("broadcast", { event: "block_status_changed" }, (payload: any) => {
        const { blocker_id, blocked_id, is_blocked } = payload?.payload || {};
        if (blocked_id === user.id) {
          setBlockedMeUsers((prev) =>
            is_blocked ? Array.from(new Set([...prev, blocker_id])) : prev.filter((id) => id !== blocker_id)
          );
        } else if (blocker_id === user.id) {
          setBlockedUsers((prev) =>
            is_blocked ? Array.from(new Set([...prev, blocked_id])) : prev.filter((id) => id !== blocked_id)
          );
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const nowIso = new Date().toISOString();
          if (showOnline) {
            await presenceChannel.track({ user_id: user.id, online_at: Date.now(), last_read_at: nowIso });
          }
        }
      });

    presenceChannelRef.current = presenceChannel;

    // 3. Listen to DB changes on conversation_members for live updates
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

    // 4. Listen to profiles table updates for live cross-device persistent read receipts
    const profilesReadChannel = supabase
      .channel(`profiles_read_sync_${activeConversationId}_${Math.random().toString(36).substring(2, 7)}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id || updated.id === user.id) return;
          const remoteReadMap = (updated?.social_links as any)?.last_read_map;
          const readAt = remoteReadMap?.[activeConversationId];
          if (!readAt) return;

          if (isGroup) {
            setGroupMembersReadMap((prev) => {
              if (!prev[updated.id] || new Date(readAt).getTime() > new Date(prev[updated.id]).getTime()) {
                return { ...prev, [updated.id]: readAt };
              }
              return prev;
            });
          } else if (updated.id === otherUserId) {
            setOtherUserLastReadAt((prev) => {
              if (!prev || new Date(readAt).getTime() > new Date(prev).getTime()) {
                return readAt;
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
      supabase.removeChannel(profilesReadChannel);
      presenceChannelRef.current = null;
      setIsOtherUserConvOnline(false);
      setIsOtherUserTyping(false);
    };
  }, [activeConversationId, user?.id, activeConversation?.other_user?.id, activeConversation?.type, showOnline]);

  // Dynamically track or untrack on active conversation's presence channel when toggle changes
  useEffect(() => {
    if (!presenceChannelRef.current || !user?.id) return;
    if (showOnline) {
      const nowIso = new Date().toISOString();
      presenceChannelRef.current.track({ user_id: user.id, online_at: Date.now(), last_read_at: nowIso }).catch(() => {});
    } else {
      presenceChannelRef.current.untrack().catch(() => {});
    }
  }, [showOnline, user?.id]);

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
    if (!activeConversationId || !user) return;

    if (stagedImages.length > 0) {
      await handleSendImages();
      return;
    }

    if (!inputMessage.trim()) return;

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

    // Connection acceptance guard (relaxed if chat history exists)
    if (activeConversation?.type !== "group" && messages.length === 0 && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
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

    if (activeConversation?.type !== "group" && messages.length === 0 && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
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

  // --- Lightbox & Image Handlers (WhatsApp Style with E2EE) ---
  const openSingleMediaLightbox = (url: string, title: string = "Media", messageId?: string) => {
    setLightboxImages([{ url, title }]);
    setLightboxIndex(0);
    setLightboxMessageId(messageId || null);
    setIsLightboxOpen(true);
  };

  const openClusterLightbox = (
    images: Array<{ url: string; caption?: string; title?: string }>,
    initialIndex: number,
    messageId?: string
  ) => {
    setLightboxImages(images);
    setLightboxIndex(initialIndex);
    setLightboxMessageId(messageId || null);
    setIsLightboxOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: Array<{ id: string; file: File; previewUrl: string }> = [];

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        alert(`"${file.name}" is not an image.`);
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        alert(`"${file.name}" exceeds the 25MB limit.`);
        return;
      }
      newItems.push({
        id: `staged-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    });

    if (newItems.length > 0) {
      setStagedImages((prev) => [...prev, ...newItems]);
    }

    e.target.value = "";
  };

  const handleRemoveStagedImage = (id: string) => {
    setStagedImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleClearStagedImages = () => {
    stagedImages.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setStagedImages([]);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      const newItems = imageFiles.map((file) => ({
        id: `staged-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setStagedImages((prev) => [...prev, ...newItems]);
    }
  };

  const handleSendImages = async () => {
    if (!activeConversationId || !user || stagedImages.length === 0 || isEncryptingImages) return;

    if (user?.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }

    const targetUserId = activeConversation?.other_user?.id;
    if (targetUserId && (blockedUsers.includes(targetUserId) || blockedMeUsers.includes(targetUserId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }

    if (activeConversation?.type !== "group" && messages.length === 0 && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    setIsEncryptingImages(true);
    const caption = inputMessage.trim();
    const currentReplyTo = replyingTo;
    const currentStaged = [...stagedImages];

    // Reset input fields immediately
    setInputMessage("");
    setReplyingTo(null);
    setStagedImages([]);

    const tempId = `temp-img-${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Optimistic image cluster for instant local viewing
    const optimisticImages: ChatImageItem[] = currentStaged.map((staged) => ({
      id: staged.id,
      url: staged.previewUrl,
    }));

    const optimisticContent = serializeImagesMessage(optimisticImages, caption, currentReplyTo);

    const optimisticMsg = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: optimisticContent,
      created_at: nowIso,
      profiles: {
        username: user.username,
        avatar: user.avatar,
        social_links: { display_name: user.name || user.displayName },
      },
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // Compress and Encrypt each image on client using Web Crypto AES-256-GCM
      const encryptedItems: ChatImageItem[] = await Promise.all(
        currentStaged.map(async (staged) => {
          const compressed = await compressImage(staged.file, 1600, 0.82);
          const encrypted = await encryptImage(
            compressed.blob,
            activeConversationId,
            compressed.width,
            compressed.height
          );
          return {
            id: staged.id,
            ciphertext: encrypted.ciphertext,
            iv: encrypted.iv,
            mimeType: encrypted.mimeType,
            width: encrypted.width,
            height: encrypted.height,
          };
        })
      );

      const serializedContent = serializeImagesMessage(encryptedItems, caption, currentReplyTo);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: serializedContent,
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
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...data, profiles: profile } : m))
        );

        await supabase
          .from("conversations")
          .update({ last_message_at: nowIso })
          .eq("id", activeConversationId);

        markAsRead(activeConversationId);
      }
    } catch (err) {
      console.error("Error compressing/encrypting and sending images:", err);
      alert("Failed to send encrypted images. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setIsEncryptingImages(false);
    }
  };

  if (!isLoaded || !isRegistered || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh max-h-dvh w-full flex flex-col bg-background overflow-hidden fixed inset-0 sm:relative sm:inset-auto">
      <Navbar className={activeConversationId ? "hidden sm:block" : "block"} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-0 sm:p-4 flex gap-4 min-h-0 overflow-hidden">
        {/* Sidebar (Conversations Inbox) */}
        <div 
          className={`w-full sm:w-80 md:w-96 flex flex-col bg-card border-0 sm:border border-white/5 sm:rounded-2xl overflow-hidden shrink-0 h-full min-h-0 transition-all ${
            activeConversationId ? "hidden sm:flex" : "flex"
          }`}
        >
          {/* Header */}
          <div className="px-3.5 py-2.5 sm:p-4 border-b border-white/5 bg-background/40 sm:bg-transparent">
            <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button 
                  onClick={() => router.push("/junctions")}
                  className="p-1.5 -ml-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                  title="Back to Voice Rooms"
                  aria-label="Back to Voice Rooms"
                >
                  <ArrowLeft size={18} />
                </button>
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Messages</h2>
              </div>

              {/* Action Cluster: Online Toggle Switch + New Group */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Sleek inline switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={showOnline}
                  onClick={() => setShowOnline(!showOnline)}
                  className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 transition-colors cursor-pointer select-none"
                  title={showOnline ? "Status: Online. Click to appear Offline." : "Status: Offline. Click to appear Online."}
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    {showOnline && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    )}
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        showOnline ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-slate-500"
                      }`}
                    />
                  </span>
                  <span className="text-[11px] font-medium text-slate-300 hidden sm:inline">
                    {showOnline ? "Online" : "Offline"}
                  </span>
                  <div
                    className={`relative inline-flex h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
                      showOnline ? "bg-emerald-500" : "bg-slate-700/80"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                        showOnline ? "translate-x-3" : "translate-x-0"
                      }`}
                    />
                  </div>
                </button>

                {/* New Group Button */}
                <button 
                  onClick={() => setIsGroupModalOpen(true)}
                  className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-semibold transition-all shadow-md shrink-0"
                  title="New Group"
                >
                  <Plus size={14} />
                  <span>Group</span>
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..." 
                className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-black/30 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
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

            {/* WhatsApp-Style Chat Filter Pills */}
            <div className="flex items-center gap-1.5 mt-2 sm:mt-2.5 overflow-x-auto no-scrollbar scroll-smooth">
              <button
                type="button"
                onClick={() => setChatFilter("all")}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  chatFilter === "all"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-indigo-400/40"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5"
                }`}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setChatFilter("direct")}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  chatFilter === "direct"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-indigo-400/40"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5"
                }`}
              >
                <span>Direct</span>
                {directCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      chatFilter === "direct" ? "bg-white/20 text-white" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {directCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setChatFilter("groups")}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  chatFilter === "groups"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-indigo-400/40"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5"
                }`}
              >
                <span>Groups</span>
                {groupsCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      chatFilter === "groups" ? "bg-white/20 text-white" : "bg-white/5 text-slate-400"
                    }`}
                  >
                    {groupsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setChatFilter("unread")}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                  chatFilter === "unread"
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 ring-1 ring-indigo-400/40"
                    : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5"
                }`}
              >
                <span>Unread</span>
                {unreadConversationsCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      chatFilter === "unread" ? "bg-white/20 text-white" : "bg-indigo-500/20 text-indigo-300"
                    }`}
                  >
                    {unreadConversationsCount}
                  </span>
                )}
              </button>
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
                  {chatFilter === "groups" ? <Users size={22} /> : <MessageSquare size={22} />}
                </div>
                <p className="text-sm font-medium text-slate-300">
                  {searchQuery
                    ? "No matches found"
                    : chatFilter === "groups"
                    ? "No group chats"
                    : chatFilter === "direct"
                    ? "No direct chats"
                    : chatFilter === "unread"
                    ? "No unread messages"
                    : "No conversations yet"}
                </p>
                <p className="text-xs text-slate-500 max-w-[220px]">
                  {searchQuery
                    ? "Try a different search keyword."
                    : chatFilter === "groups"
                    ? "Create a group to chat and connect with multiple friends!"
                    : chatFilter === "direct"
                    ? "Connect with friends from voice junctions to chat directly."
                    : chatFilter === "unread"
                    ? "You are all caught up on your messages."
                    : "Connect with friends from rooms or start a group chat!"}
                </p>
                {chatFilter === "groups" && !searchQuery && (
                  <button
                    onClick={() => setIsGroupModalOpen(true)}
                    className="mt-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                  >
                    Start a Group Chat
                  </button>
                )}
                {chatFilter !== "all" && !searchQuery && (
                  <button
                    onClick={() => setChatFilter("all")}
                    className="mt-1 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Show all chats
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
                      if (typeof window !== "undefined") {
                        window.scrollTo(0, 0);
                        document.documentElement.scrollTop = 0;
                        document.body.scrollTop = 0;
                        window.history.replaceState(null, "", `/messages?id=${conv.id}`);
                      }
                      setActiveConversationId(conv.id);
                      markAsRead(conv.id, conv.last_message_at);
                      broadcastReadReceipt(conv.last_message_at);
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
              const lastMsgTime = messages[messages.length - 1]?.created_at;
              markAsRead(activeConversationId, lastMsgTime);
              broadcastReadReceipt(lastMsgTime);
            }
          }}
          className={`bg-card border-0 sm:border border-white/5 sm:rounded-2xl overflow-hidden min-h-0 ${
            !activeConversationId
              ? 'hidden sm:flex flex-1 sm:h-full items-center justify-center'
              : 'flex flex-1 flex-col fixed inset-0 z-30 sm:relative sm:inset-auto sm:z-auto sm:h-full h-dvh max-h-dvh w-full'
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
                const customNickname = otherUserId ? (nicknames[otherUserId] || conversationNicknames[otherUserId]) : null;
                const isBlocked = otherUserId ? blockedUsers.includes(otherUserId) : false;
                const isBlockedByOther = otherUserId ? blockedMeUsers.includes(otherUserId) : false;
                const shownName = getProfileDisplayName(activeConversation?.other_user, activeConversation?.other_user?.username || "Chat");
                const headerTitle = isGroup 
                  ? (activeConversation.name || "Group Chat") 
                  : isBlockedByOther
                    ? `${shownName || "User"} (Unavailable)`
                    : (customNickname || shownName || "Chat");

                return (
                  <div className="h-14 sm:h-16 border-b border-white/5 flex items-center justify-between px-2.5 sm:px-6 shrink-0 bg-[#090A0F]/95 backdrop-blur-xl shadow-sm pt-[env(safe-area-inset-top,0px)]">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Back Button */}
                      <button
                        onClick={() => {
                          setActiveConversationId(null);
                          if (typeof window !== "undefined") {
                            window.history.replaceState(null, "", "/messages");
                          }
                        }}
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
                          disabled={callState !== "idle" || isBlocked || isBlockedByOther || Boolean(targetRelationship && !targetRelationship.isAcceptedConnection && messages.length === 0)}
                          className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 text-xs font-semibold shadow-sm ${
                            callState !== "idle" && activeCall?.conversationId === activeConversationId
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse"
                              : isBlocked || isBlockedByOther || (targetRelationship && !targetRelationship.isAcceptedConnection && messages.length === 0)
                              ? "opacity-50 cursor-not-allowed bg-white/5 text-slate-500 border border-white/5"
                              : "text-slate-200 hover:text-white bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30"
                          }`}
                          title={isBlocked ? "Cannot call blocked contact" : isBlockedByOther ? "User is unavailable" : (targetRelationship && !targetRelationship.isAcceptedConnection && messages.length === 0) ? "Follow request must be accepted before calling" : "Start Voice Call"}
                        >
                          <PhoneCall size={15} className={isBlocked || isBlockedByOther || (targetRelationship && !targetRelationship.isAcceptedConnection && messages.length === 0) ? "text-slate-500" : "text-indigo-400"} />
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
                                  setNicknameTargetUserId(otherUserId);
                                  setNicknameTargetName(shownName || "Friend");
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
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <div 
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 min-h-0 overflow-y-auto px-2.5 py-3 sm:px-6 sm:py-5 flex flex-col gap-1 sm:gap-2 overscroll-contain"
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

                      if (parsed.type === "nickname_update" || parsed.nicknameUpdate) {
                        const update = parsed.nicknameUpdate;
                        const isSetter = msg.sender_id === user.id || update?.setterId === user.id;
                        const targetIsMe = update ? update.targetUserId === user.id : false;
                        const isSet = update ? update.action === "set" && Boolean(update.nickname) : Boolean(parsed.text && !parsed.text.includes("removed"));
                        const nick = update?.nickname || "";
                        
                        // Clean, concise display names (reduced context)
                        const setterName = isSetter 
                          ? "You" 
                          : getProfileDisplayName(msg.profiles, update?.setterUsername || msg.profiles?.username || "Someone");

                        let noticeText = "";
                        if (nick) {
                          if (isSetter) {
                            noticeText = isSet
                              ? `You set nickname to "${nick}"`
                              : `You cleared the nickname`;
                          } else if (targetIsMe) {
                            noticeText = isSet
                              ? `${setterName} set your nickname to "${nick}"`
                              : `${setterName} cleared your nickname`;
                          } else {
                            const targetName = update?.targetUsername || "member";
                            noticeText = isSet
                              ? `${setterName} set ${targetName}'s nickname to "${nick}"`
                              : `${setterName} cleared ${targetName}'s nickname`;
                          }
                        } else {
                          noticeText = parsed.text?.replace("🏷️", "").trim() || "Nickname updated";
                        }

                        return (
                          <Fragment key={msg.id}>
                            {isNewDay && dateLabel && (
                              <div className="w-full flex justify-center my-2.5 select-none pointer-events-none sticky top-1 z-20">
                                <div className="px-3.5 py-1 rounded-full bg-[#141622]/95 backdrop-blur-md border border-white/10 text-[11px] font-semibold text-slate-300 shadow-md flex items-center gap-1.5 tracking-wide">
                                  <span>{dateLabel}</span>
                                </div>
                              </div>
                            )}
                            <div id={`msg-${msg.id}`} className="w-full flex justify-center my-1.5 px-3">
                              <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/5 text-slate-400 text-[11px] sm:text-xs leading-none shadow-sm max-w-fit text-center">
                                <Tag size={11} className="text-indigo-400/80 shrink-0" />
                                <span className="text-slate-300 font-normal">{noticeText}</span>
                                {isSetter && isSet && (
                                  <>
                                    <span className="text-slate-500">·</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setNicknameTargetUserId(update?.targetUserId || activeConversation?.other_user?.id || null);
                                        setNicknameTargetName(update?.targetUsername || (activeConversation?.other_user ? getProfileDisplayName(activeConversation.other_user, activeConversation.other_user.username || "Friend") : "Friend"));
                                        setNicknameInput(nick || "");
                                        setIsNicknameModalOpen(true);
                                      }}
                                      className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline underline-offset-2 shrink-0"
                                    >
                                      Change
                                    </button>
                                  </>
                                )}
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
                                    text: parsed.type === "voice"
                                      ? "Voice Note"
                                      : parsed.type === "gif"
                                      ? "GIF"
                                      : parsed.type === "images"
                                      ? `📷 Photo${(parsed.images?.length || 1) > 1 ? `s (${parsed.images?.length})` : ""}`
                                      : parsed.type === "room_invite"
                                      ? "Voice Hangout Invite"
                                      : parsed.text || "",
                                    isVoice: parsed.type === "voice",
                                    isGif: parsed.type === "gif",
                                    gifUrl: parsed.gifUrl,
                                    isImages: parsed.type === "images",
                                  });
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                title="Reply"
                                aria-label="Reply"
                              >
                                <Reply size={13} />
                              </button>

                              {parsed.type !== "voice" && parsed.type !== "room_invite" && parsed.type !== "gif" && parsed.type !== "images" && (
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
                              const isImages = parsed.type === "images" && Boolean(parsed.images && parsed.images.length > 0);
                              const msgTime = new Date(msg.created_at).getTime();
                              const otherReadTime = otherUserLastReadAt ? new Date(otherUserLastReadAt).getTime() : 0;
                              const effectiveOtherReadTime = Math.max(otherReadTime, otherUserLatestMsgTime);
                              const isMsgSeen = Boolean(effectiveOtherReadTime > 0 && effectiveOtherReadTime >= msgTime - 3000);
                              const isMsgDelivered = Boolean(isOtherUserOnline || isMsgSeen);
                              return (
                                <div 
                                  onClick={() => setActiveActionMsgId(prev => prev === msg.id ? null : msg.id)}
                                  className={`w-fit rounded-2xl shadow-md break-words min-w-[64px] max-w-full overflow-hidden cursor-pointer transition-all ${
                                    isGif || isImages
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
                                        {parsed.replyTo.isVoice ? "🎵 Voice Note" : parsed.replyTo.isGif ? "🖼️ GIF" : parsed.replyTo.isImages ? "📷 Photo" : parsed.replyTo.text}
                                      </p>
                                    </div>
                                  )}

                                  {/* WhatsApp E2EE Image Cluster, Room Invite, Voice Note, GIF, or Text */}
                                  {isImages ? (
                                    <WhatsAppImageCluster
                                      images={parsed.images!}
                                      conversationId={activeConversationId}
                                      caption={parsed.text}
                                      isMe={isMe}
                                      onOpenLightbox={(imgs, idx) => openClusterLightbox(imgs, idx, msg.id)}
                                      onOpenReactionPicker={() => setActiveReactionPickerMsgId((prev) => prev === msg.id ? null : msg.id)}
                                      onToggleReaction={(emoji) => handleToggleReaction(msg.id, emoji)}
                                      timestamp={new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      readStatusNode={
                                        <>
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
                                            const readCount = otherMembers.filter((m) => isMemberRead(m.id, msgTime)).length;
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
                                        </>
                                      }
                                    />
                                  ) : parsed.type === "room_invite" && parsed.roomInvite ? (
                                    <RoomInviteCard invite={parsed.roomInvite} isMe={isMe} />
                                  ) : parsed.type === "voice" ? (
                                    <VoiceNotePlayer
                                      audioUrl={parsed.audioUrl || ""}
                                      duration={parsed.duration}
                                      isMe={isMe}
                                    />
                                  ) : isGif ? (
                                    <div className="relative rounded-xl overflow-hidden max-w-[240px] sm:max-w-[300px] bg-black/40 group/gif">
                                      {/* Quick React Smile button on GIF */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveReactionPickerMsgId((prev) => (prev === msg.id ? null : msg.id));
                                        }}
                                        className="absolute top-1.5 right-1.5 z-20 p-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white/80 hover:text-amber-300 border border-white/15 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg flex items-center justify-center opacity-85 hover:opacity-100"
                                        title="React to GIF"
                                        aria-label="React to GIF"
                                      >
                                        <Smile size={13} />
                                      </button>
                                      <img
                                        src={parsed.gifUrl}
                                        alt={parsed.gifTitle || "GIF"}
                                        className="w-full h-auto max-h-[260px] sm:max-h-[300px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                                        loading="lazy"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedMediaUrl(parsed.gifUrl!);
                                          setExpandedMediaTitle(parsed.gifTitle || "GIF");
                                          setLightboxMessageId(msg.id);
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
                                          const readCount = otherMembers.filter((m) => isMemberRead(m.id, msgTime)).length;
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
                                          const readCount = otherMembers.filter((m) => isMemberRead(m.id, msgTime)).length;
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
                                        const readCount = otherMembers.filter((m) => isMemberRead(m.id, msgTime)).length;
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
                            <div className={`absolute ${index === 0 ? 'top-full mt-1.5' : '-top-11'} ${isMe ? 'right-2' : 'left-2'} z-40`}>
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
                                    text: parsed.type === "voice"
                                      ? "Voice Note"
                                      : parsed.type === "gif"
                                      ? "GIF"
                                      : parsed.type === "images"
                                      ? `📷 Photo${(parsed.images?.length || 1) > 1 ? `s (${parsed.images?.length})` : ""}`
                                      : parsed.type === "room_invite"
                                      ? "Voice Hangout Invite"
                                      : parsed.text || "",
                                    isVoice: parsed.type === "voice",
                                    isGif: parsed.type === "gif",
                                    gifUrl: parsed.gifUrl,
                                    isImages: parsed.type === "images",
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

                const hasChatHistory = messages.length > 0;
                if (!isGroup && otherUserId && !hasChatHistory && (isRelationshipLoading || !targetRelationship || !targetRelationship.isAcceptedConnection)) {
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
                  <form
                    onSubmit={handleSendMessage}
                    className="relative p-2 sm:p-4 border-t border-white/5 bg-[#090A0F]/95 backdrop-blur-xl shrink-0 w-full z-20"
                    style={{ paddingBottom: "max(0.65rem, env(safe-area-inset-bottom, 0px))" }}
                  >
                    {/* Hidden E2EE Image File Input */}
                    <input
                      ref={imageInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />

                    {/* GIF Picker Popover / Mobile Drawer */}
                    <GifPicker
                      isOpen={isGifPickerOpen}
                      onClose={() => setIsGifPickerOpen(false)}
                      onSelectGif={handleSendGif}
                    />

                    {/* Staged Images Preview Tray (WhatsApp Style) */}
                    {stagedImages.length > 0 && (
                      <div className="mb-2 p-2.5 rounded-2xl bg-[#12131D]/95 border border-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                            <ImageIcon size={14} className="text-indigo-400" />
                            <span>{stagedImages.length} photo{stagedImages.length > 1 ? "s" : ""} staged</span>
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium ml-1">
                              <Lock size={9} />
                              <span>End-to-End Encrypted</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleClearStagedImages}
                            className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                          {stagedImages.map((staged, idx) => (
                            <div
                              key={staged.id}
                              className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden shrink-0 border border-white/10 group shadow-md"
                            >
                              <img src={staged.previewUrl} alt="" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => handleRemoveStagedImage(staged.id)}
                                className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-rose-600 text-white transition-colors cursor-pointer shadow-md"
                                title="Remove photo"
                              >
                                <X size={11} />
                              </button>
                              <span className="absolute bottom-1 left-1 px-1 py-0.2 rounded bg-black/60 text-[9px] text-white/80 font-mono">
                                #{idx + 1}
                              </span>
                            </div>
                          ))}

                          {/* Add more photos button */}
                          <button
                            type="button"
                            onClick={() => imageInputRef.current?.click()}
                            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-400/60 bg-white/[0.02] hover:bg-white/5 flex flex-col items-center justify-center gap-1 text-slate-400 hover:text-white transition-all shrink-0 cursor-pointer"
                            title="Add more photos"
                          >
                            <Plus size={18} className="text-indigo-400" />
                            <span className="text-[10px] font-semibold">Add</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Replying Banner */}
                    {replyingTo && (
                      <div className="mb-2 flex items-center justify-between px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150">
                        <div className="flex items-center gap-2 min-w-0">
                          <Reply size={14} className="text-indigo-400 shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-indigo-300">Replying to {replyingTo.sender}: </span>
                            <span className="text-slate-300 truncate inline-block max-w-[180px] sm:max-w-md align-bottom">
                              {replyingTo.isVoice ? "🎵 Voice Note" : replyingTo.isGif ? "🖼️ GIF" : replyingTo.isImages ? "📷 Photo" : replyingTo.text}
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
                      <div className="flex items-center gap-2 w-full max-w-4xl mx-auto">
                        {/* Unified WhatsApp-style Message Input Capsule */}
                        <div className="relative flex-1 flex items-center min-w-0 bg-[#12131D]/90 hover:bg-[#151724] focus-within:bg-[#151724] border border-white/10 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20 rounded-full pl-1.5 pr-2 sm:pl-2 sm:pr-3 py-1 sm:py-1.5 transition-all shadow-inner">
                          
                          {/* Media Buttons: Photos & GIF */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Attach Photos Button (E2EE) */}
                            <button
                              type="button"
                              onClick={() => imageInputRef.current?.click()}
                              className={`relative w-8 h-8 sm:w-8.5 sm:h-8.5 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                                stagedImages.length > 0
                                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 ring-1 ring-indigo-400/50"
                                  : "text-slate-400 hover:text-white hover:bg-white/10 active:scale-95"
                              }`}
                              title="Attach photos (End-to-End Encrypted)"
                              aria-label="Attach photos"
                            >
                              <ImageIcon size={18} />
                              {stagedImages.length > 0 && (
                                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 text-[9px] font-bold text-white flex items-center justify-center border border-[#12131D] shadow-sm">
                                  {stagedImages.length}
                                </span>
                              )}
                            </button>

                            {/* Sleek GIF Badge Button */}
                            <button
                              type="button"
                              onClick={() => setIsGifPickerOpen(!isGifPickerOpen)}
                              className={`h-7 px-2.5 rounded-full font-black text-[11px] tracking-wider uppercase transition-all flex items-center justify-center cursor-pointer ${
                                isGifPickerOpen
                                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/40 ring-1 ring-indigo-400"
                                  : "bg-white/[0.08] hover:bg-white/[0.16] text-slate-300 hover:text-white border border-white/10 hover:border-indigo-400/40 active:scale-95"
                              }`}
                              title="Search & Send GIFs"
                              aria-label="Send GIF"
                            >
                              GIF
                            </button>

                            {/* Vertical Divider */}
                            <div className="w-[1px] h-4 bg-white/10 mx-1 shrink-0" />
                          </div>

                          {/* Seamless Message Text Input */}
                          <input
                            ref={textInputRef}
                            type="text"
                            value={inputMessage}
                            onChange={handleInputChange}
                            onPaste={handlePaste}
                            placeholder={
                              stagedImages.length > 0
                                ? "Add a caption..."
                                : editingMessage
                                ? "Edit message..."
                                : "Type a message..."
                            }
                            className="flex-1 bg-transparent border-0 text-white placeholder:text-slate-500 text-sm sm:text-[14.5px] px-2 py-1.5 focus:outline-none focus:ring-0 min-w-0"
                          />

                          {/* Clear text button if user typed text */}
                          {inputMessage && (
                            <button
                              type="button"
                              onClick={() => setInputMessage("")}
                              className="p-1 rounded-full text-slate-500 hover:text-slate-300 transition-colors shrink-0 mr-1"
                              title="Clear text"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* Floating Action Button (FAB) on the Right: Voice Note or Send */}
                        <div className="shrink-0">
                          {!inputMessage.trim() && !editingMessage && stagedImages.length === 0 ? (
                            <button
                              type="button"
                              onClick={startVoiceRecording}
                              className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-slate-300 hover:text-white border border-white/10 active:scale-95 transition-all shadow-md shadow-black/20 cursor-pointer"
                              title="Record voice note"
                              aria-label="Record voice note"
                            >
                              <Mic size={19} />
                            </button>
                          ) : (
                            <button
                              type="submit"
                              disabled={isEncryptingImages}
                              className={`flex items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 hover:from-indigo-500 hover:to-violet-400 active:scale-95 text-white transition-all shadow-lg shadow-indigo-600/35 cursor-pointer animate-in zoom-in-75 duration-150 ${
                                stagedImages.length > 0
                                  ? "px-3.5 h-10 sm:h-11 gap-1.5 font-bold text-xs"
                                  : "w-10 h-10 sm:w-11 sm:h-11"
                              }`}
                              aria-label={editingMessage ? "Save Edit" : "Send Message"}
                              title={editingMessage ? "Save Edit" : stagedImages.length > 0 ? "Send Encrypted Photos" : "Send Message"}
                            >
                              {isEncryptingImages ? (
                                <>
                                  <Loader2 size={16} className="animate-spin" />
                                  <span className="hidden xs:inline text-xs font-semibold">Encrypting...</span>
                                </>
                              ) : stagedImages.length > 0 ? (
                                <>
                                  <Send size={14} />
                                  <span>Send ({stagedImages.length})</span>
                                </>
                              ) : editingMessage ? (
                                <Check size={18} className="stroke-[2.5]" />
                              ) : (
                                <Send size={17} className="translate-x-[1px]" />
                              )}
                            </button>
                          )}
                        </div>
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
            <div className="flex items-center gap-2 mb-1">
              <Tag size={18} className="text-indigo-400" />
              <h3 className="text-base font-bold text-white">
                {nicknameTargetName
                  ? `Set Nickname for ${nicknameTargetName}`
                  : activeConversation?.other_user
                    ? `Set Nickname for ${getProfileDisplayName(activeConversation.other_user, activeConversation.other_user.username || "Friend")}`
                    : "Set Contact Nickname"}
              </h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Everyone in this chat will be notified and can see this nickname (Instagram style).
            </p>
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              placeholder="e.g. Bestie, Johnny, Bro"
              maxLength={30}
              className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 mb-4"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsNicknameModalOpen(false);
                  setNicknameTargetUserId(null);
                  setNicknameTargetName(null);
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {(() => {
                const targetId = nicknameTargetUserId || activeConversation?.other_user?.id;
                if (!targetId) return null;
                const hasExistingNick = Boolean(nicknames[targetId] || conversationNicknames[targetId]);
                if (!hasExistingNick) return null;
                return (
                  <button
                    type="button"
                    onClick={() => handleSaveNickname(targetId, "")}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                );
              })()}
              <button
                type="button"
                onClick={() => {
                  const targetId = nicknameTargetUserId || activeConversation?.other_user?.id;
                  if (targetId) {
                    handleSaveNickname(targetId, nicknameInput);
                  }
                }}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
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
          currentUserId={user?.id}
          readMembers={(() => {
            if (!messageInfoTarget) return [];
            const msgTime = new Date(messageInfoTarget.message.created_at).getTime();
            if (activeConversation?.type === "group") {
              const senderId = messageInfoTarget.message.sender_id;
              const recipients = activeGroupMembers.filter((m) => m.id !== senderId);
              return recipients
                .filter((m) => {
                  if (m.id === user?.id) return true;
                  return isMemberRead(m.id, msgTime);
                })
                .map((m) => {
                  const readIso = groupMembersReadMap[m.id];
                  const latestMsgTime = memberLatestMsgTimeMap[m.id] || 0;
                  const effectiveReadTime = Math.max(
                    readIso ? new Date(readIso).getTime() : 0,
                    latestMsgTime,
                    m.id === user?.id ? Date.now() : 0
                  );
                  return {
                    id: m.id,
                    username: m.username,
                    name: m.name,
                    displayName: m.displayName || m.name || m.username,
                    avatar: m.avatar,
                    readAt: effectiveReadTime > 0 ? new Date(effectiveReadTime).toISOString() : (readIso || new Date().toISOString()),
                  };
                });
            } else if (activeConversation?.other_user) {
              const otherReadTime = otherUserLastReadAt ? new Date(otherUserLastReadAt).getTime() : 0;
              const effectiveOtherReadTime = Math.max(otherReadTime, otherUserLatestMsgTime);
              if (effectiveOtherReadTime > 0 && effectiveOtherReadTime >= msgTime - 3000) {
                return [
                  {
                    id: activeConversation.other_user.id,
                    username: activeConversation.other_user.username,
                    name: activeConversation.other_user.name,
                    displayName: getProfileDisplayName(activeConversation.other_user, activeConversation.other_user.username),
                    avatar: activeConversation.other_user.avatar,
                    readAt: otherUserLastReadAt || new Date(effectiveOtherReadTime).toISOString(),
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
              const senderId = messageInfoTarget.message.sender_id;
              const recipients = activeGroupMembers.filter((m) => m.id !== senderId);
              return recipients
                .filter((m) => {
                  if (m.id === user?.id) return false;
                  return !isMemberRead(m.id, msgTime);
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
              const effectiveOtherReadTime = Math.max(otherReadTime, otherUserLatestMsgTime);
              if (effectiveOtherReadTime === 0 || effectiveOtherReadTime < msgTime - 3000) {
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
              ? parseMessageContent(messages.find((m) => m.id === lightboxMessageId)?.content || "").reactions
              : undefined
          }
          currentUserId={user?.id}
        />
      )}
      {expandedMediaUrl && !isLightboxOpen && (
        <MediaLightbox
          mediaUrl={expandedMediaUrl}
          onClose={() => {
            setExpandedMediaUrl(null);
            setExpandedMediaTitle("");
            setLightboxMessageId(null);
          }}
          title={expandedMediaTitle}
          onToggleReaction={lightboxMessageId ? (emoji) => handleToggleReaction(lightboxMessageId, emoji) : undefined}
          reactions={
            lightboxMessageId
              ? parseMessageContent(messages.find((m) => m.id === lightboxMessageId)?.content || "").reactions
              : undefined
          }
          currentUserId={user?.id}
        />
      )}
    </div>
  );
}

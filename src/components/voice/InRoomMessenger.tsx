"use client";

import React, { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/hooks/useUser";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  MessageCircle,
  X,
  Minus,
  Maximize2,
  ArrowLeft,
  Send,
  Search,
  Sparkles,
  Lock,
  UserPlus,
  Check,
  CheckCheck,
  Radio,
  Loader2,
  AlertTriangle,
  Users,
  Image as ImageIcon,
  MoreVertical,
  Edit3,
  Trash2,
  Smile,
} from "lucide-react";
import { VoiceNotePlayer } from "@/components/chat/VoiceNotePlayer";
import { RoomInviteCard } from "@/components/chat/RoomInviteCard";
import { WhatsAppImageCluster } from "@/components/chat/WhatsAppImageCluster";
import { MediaLightbox, LightboxMediaItem } from "@/components/chat/MediaLightbox";
import { GifPicker } from "@/components/chat/GifPicker";
import { QuickReactionPicker, ReactionBadges } from "@/components/chat/MessageReactions";
import { compressImage, encryptImage } from "@/lib/e2ee-service";
import {
  parseMessageContent,
  serializeTextMessage,
  serializeImagesMessage,
  serializeGifMessage,
  serializeRoomInvite,
  ChatImageItem,
  getSenderColor,
  getProfileDisplayName,
  isSameDay,
  formatChatDateDivider,
  toggleReactionInContent,
} from "@/lib/chat-utils";
import { socialService, RelationshipStatus } from "@/lib/social-service";

interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar: string;
    name?: string;
    displayName?: string;
    social_links?: any;
  } | null;
}

interface ConversationSummary {
  id: string;
  type: string;
  name: string | null;
  last_message_at: string;
  other_user?: {
    id: string;
    username: string;
    name?: string;
    displayName?: string;
    avatar: string;
    social_links?: any;
  };
}

export interface CurrentJunctionInfo {
  id: string;
  name: string;
  description?: string;
  participantCount?: number;
  maxParticipants?: number;
}

interface InRoomMessengerProps {
  isOpen: boolean;
  onClose: () => void;
  currentJunction?: CurrentJunctionInfo;
}

export function InRoomMessenger({ isOpen, onClose, currentJunction }: InRoomMessengerProps) {
  const { user, isRegistered, isLoaded } = useUser();
  const { unreadCount, unreadByConversation, markAsRead } = useUnreadMessages();

  const [isMinimized, setIsMinimized] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activePartnerStub, setActivePartnerStub] = useState<{
    id: string;
    username: string;
    name?: string;
    displayName?: string;
    avatar: string;
  } | null>(null);

  const [groupMembersMap, setGroupMembersMap] = useState<
    Record<string, { username: string; avatar: string; name?: string; displayName?: string; lastReadAt?: string }>
  >({});

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [partnerLastReadAt, setPartnerLastReadAt] = useState<string | null>(null);

  // Lightbox & Reaction states for rich media
  const [lightboxImages, setLightboxImages] = useState<LightboxMediaItem[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxMessageId, setLightboxMessageId] = useState<string | null>(null);
  const [activeReactionPickerMsgId, setActiveReactionPickerMsgId] = useState<string | null>(null);

  // Staged Photos for E2EE Image sending
  const [stagedImages, setStagedImages] = useState<
    Array<{ id: string; file: File; previewUrl: string; width?: number; height?: number }>
  >([]);
  const [isEncryptingImages, setIsEncryptingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GIF Picker state
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);

  // Message editing state with strict 5-minute limit
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string; createdAt: string } | null>(null);

  // Cleared chats map (clear for me only)
  const [clearedChatsMap, setClearedChatsMap] = useState<Record<string, string>>({});
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Social relationship & block state
  const [targetRelationship, setTargetRelationship] = useState<RelationshipStatus | null>(null);
  const [isRelationshipLoading, setIsRelationshipLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [blockedMeUsers, setBlockedMeUsers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load user's private cleared chats map (stored in profiles.social_links.cleared_chats_map & localStorage)
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

    Promise.resolve(
      supabase
        .from("profiles")
        .select("social_links")
        .eq("id", user.id)
        .maybeSingle()
    )
      .then(({ data }) => {
        const remoteMap = (data?.social_links as any)?.cleared_chats_map || {};
        const merged = { ...remoteMap, ...localMap };
        setClearedChatsMap(merged);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(storageKey, JSON.stringify(merged));
          } catch {}
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Load nicknames and block lists
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    const loadNicknamesAndBlocks = async () => {
      // 1. Nicknames
      let localMap: Record<string, string> = {};
      try {
        const saved = localStorage.getItem(`yapclub_nicknames_${user.id}`);
        if (saved) localMap = JSON.parse(saved);
      } catch (e) {}

      setNicknames(localMap);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const cloudMap = session?.user?.user_metadata?.nicknames;
        if (cloudMap && typeof cloudMap === "object") {
          const merged = { ...cloudMap, ...localMap };
          setNicknames(merged);
        }
      } catch (e) {}

      // 2. Block lists
      try {
        const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(user.id);
        setBlockedUsers(blockedByMeIds);
        setBlockedMeUsers(blockedMeIds);
      } catch (e) {}
    };

    loadNicknamesAndBlocks();

    const handleNicknameUpdateEvent = (e: Event) => {
      const customEvent = e as CustomEvent<Record<string, string>>;
      if (customEvent.detail) {
        setNicknames(customEvent.detail);
      }
    };
    window.addEventListener("yapclub_nicknames_updated", handleNicknameUpdateEvent);

    const handleSocialUpdated = async () => {
      try {
        const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(user.id);
        setBlockedUsers(blockedByMeIds);
        setBlockedMeUsers(blockedMeIds);
      } catch (e) {}
    };
    window.addEventListener("yapclub_social_updated", handleSocialUpdated);

    // Event dispatched from ProfilePreviewModal or elsewhere
    const handleOpenDmEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        conversationId?: string;
        partnerId?: string;
        partnerProfile?: { id: string; username: string; avatar: string };
      }>;

      if (customEvent.detail?.conversationId) {
        const convId = customEvent.detail.conversationId;
        setActiveConversationId(convId);
        setIsMinimized(false);

        if (customEvent.detail.partnerProfile) {
          setActivePartnerStub(customEvent.detail.partnerProfile);
          setConversations((prev) => {
            const exists = prev.some((c) => c.id === convId);
            if (exists) return prev;
            return [
              {
                id: convId,
                type: "direct",
                name: null,
                last_message_at: new Date().toISOString(),
                other_user: customEvent.detail.partnerProfile,
              },
              ...prev,
            ];
          });
        }

        fetchConversations();
      }
    };
    window.addEventListener("yapclub_open_inroom_dm", handleOpenDmEvent);

    return () => {
      window.removeEventListener("yapclub_nicknames_updated", handleNicknameUpdateEvent);
      window.removeEventListener("yapclub_social_updated", handleSocialUpdated);
      window.removeEventListener("yapclub_open_inroom_dm", handleOpenDmEvent);
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
                avatar,
                social_links
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
                    name: getProfileDisplayName(prof, prof.username),
                    displayName: getProfileDisplayName(prof, prof.username),
                    avatar: prof.avatar || "user",
                    social_links: prof.social_links,
                  };
                }
              }
            }

            convos.push({
              id: c.id,
              type: c.type || "direct",
              name: c.name || null,
              last_message_at: c.last_message_at || new Date(0).toISOString(),
              other_user: otherUser,
            });
          }

          // Sort by latest message
          convos.sort(
            (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
          );
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

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePartner = activeConversation?.other_user || activePartnerStub;
  const partnerId = activePartner?.id;
  const isGroupChat = activeConversation?.type === "group";

  // Fetch group members when active conversation is a group
  useEffect(() => {
    if (!activeConversationId || !isGroupChat) {
      setGroupMembersMap({});
      return;
    }

    const fetchGroupMembers = async () => {
      try {
        const { data } = await supabase
          .from("conversation_members")
          .select(`
            user_id,
            profiles (
              id,
              username,
              avatar,
              social_links
            )
          `)
          .eq("conversation_id", activeConversationId);

        if (data) {
          const map: Record<string, { username: string; avatar: string; name?: string; displayName?: string; lastReadAt?: string }> = {};
          for (const item of data) {
            const raw = (item as any).profiles;
            const prof = Array.isArray(raw) ? raw[0] : raw;
            if (prof && item.user_id) {
              const dName = getProfileDisplayName(prof, prof.username || "User");
              const readFromSocial = (prof?.social_links as any)?.last_read_map?.[activeConversationId];
              map[item.user_id] = {
                username: prof.username || "User",
                name: dName,
                displayName: dName,
                avatar: prof.avatar || "user",
                lastReadAt: (item as any).last_read_at || readFromSocial || undefined,
              };
            }
          }
          setGroupMembersMap(map);
        }
      } catch (e) {
        console.error("Failed to fetch group members:", e);
      }
    };

    fetchGroupMembers();
  }, [activeConversationId, isGroupChat]);

  // Check relationship status for 1-on-1 direct conversations to ensure connection is accepted
  useEffect(() => {
    if (!activeConversationId || isGroupChat || !partnerId || !user?.id) {
      setTargetRelationship(null);
      setIsRelationshipLoading(false);
      return;
    }

    let isSubscribed = true;
    setIsRelationshipLoading(true);

    const checkRelationship = async () => {
      try {
        const rel = await socialService.getRelationship(user.id, partnerId);
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
  }, [activeConversationId, isGroupChat, partnerId, user?.id]);

  // If partner profile wasn't found in conversations list, load it from member row
  useEffect(() => {
    if (activeConversationId && !activePartner && user?.id) {
      supabase
        .from("conversation_members")
        .select(`
          user_id,
          profiles (
            id,
            username,
            avatar,
            social_links
          )
        `)
        .eq("conversation_id", activeConversationId)
        .neq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data && data.profiles) {
            const rawProf = (data as any).profiles;
            const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf;
            if (prof) {
              const dName = getProfileDisplayName(prof, prof.username);
              setActivePartnerStub({
                id: prof.id,
                username: prof.username,
                name: dName,
                displayName: dName,
                avatar: prof.avatar || "user",
              });
            }
          }
        });
    }
  }, [activeConversationId, activePartner, user?.id]);

  // Fetch partner's last read timestamp for 1-on-1 chats to display live seen ticks
  useEffect(() => {
    if (!activeConversationId || isGroupChat || !partnerId) {
      setPartnerLastReadAt(null);
      return;
    }
    supabase
      .from("profiles")
      .select("social_links")
      .eq("id", partnerId)
      .maybeSingle()
      .then(({ data }) => {
        const readAt = (data?.social_links as any)?.last_read_map?.[activeConversationId];
        if (readAt) {
          setPartnerLastReadAt(readAt);
        }
      });
  }, [activeConversationId, isGroupChat, partnerId]);

  // Fetch messages for active conversation & sync read status
  useEffect(() => {
    if (!activeConversationId || !user?.id) {
      setMessages([]);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
      return;
    }

    if (typeof window !== "undefined") {
      sessionStorage.setItem("yapclub_active_conversation", activeConversationId);
    }
    markAsRead(activeConversationId);

    const fetchMessages = async () => {
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
            avatar
          )
        `)
        .eq("conversation_id", activeConversationId)
        .order("created_at", { ascending: true })
        .limit(100);

      if (error) {
        console.error("Error fetching messages:", error);
      } else if (data) {
        const clearedIso = clearedChatsMap[activeConversationId];
        const clearedMs = clearedIso ? new Date(clearedIso).getTime() : 0;
        const visibleRows = clearedMs
          ? (data as any[]).filter((m) => new Date(m.created_at).getTime() > clearedMs)
          : (data as any[]);

        setMessages(visibleRows);
        if (visibleRows.length > 0) {
          const latest = visibleRows[visibleRows.length - 1];
          markAsRead(activeConversationId, latest.created_at);
        }
      }
    };

    fetchMessages();

    // Subscribe to incoming messages & updates in this active conversation
    const channelId = `in_room_dm_${activeConversationId}_${Math.random().toString(36).substring(2, 9)}`;
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
        (payload) => {
          const newMsg = payload.new as DirectMessage;
          if (!newMsg) return;

          const clearedIso = clearedChatsMap[activeConversationId];
          const clearedMs = clearedIso ? new Date(clearedIso).getTime() : 0;
          if (clearedMs && new Date(newMsg.created_at).getTime() <= clearedMs) {
            return;
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          markAsRead(activeConversationId, newMsg.created_at);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        (payload) => {
          const updated = payload.new as DirectMessage;
          if (updated) {
            setMessages((prev) =>
              prev.map((m) => (m.id === updated.id ? { ...m, content: updated.content } : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("yapclub_active_conversation");
      }
      supabase.removeChannel(channel);
    };
  }, [activeConversationId, user?.id, markAsRead, clearedChatsMap]);

  // Global realtime subscription for updating all conversations' last message timestamp & sorting
  useEffect(() => {
    if (!user?.id || !isRegistered) return;

    const channelId = `in_room_global_${user.id}_${Math.random().toString(36).substring(2, 9)}`;
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
          const newMsg = payload.new as DirectMessage;
          if (!newMsg) return;

          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === newMsg.conversation_id);
            if (idx === -1) {
              fetchConversations();
              return prev;
            }
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              last_message_at: newMsg.created_at,
            };
            updated.sort(
              (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
            );
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isRegistered, fetchConversations]);

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

  // Open full-screen MediaLightbox for single image, GIF or image cluster
  const openClusterLightbox = (
    imgs: Array<{ url: string; caption?: string; title?: string }>,
    initialIndex: number,
    msgId?: string
  ) => {
    setLightboxImages(imgs);
    setLightboxIndex(initialIndex);
    setLightboxMessageId(msgId || null);
    setIsLightboxOpen(true);
  };

  // Image Selection for WhatsApp-style E2EE Photos
  const handleSelectPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const valid = files.filter((f) => f.type.startsWith("image/"));
    if (valid.length === 0) {
      alert("Please select valid image files.");
      return;
    }
    const newStaged = valid.map((file) => ({
      id: `staged_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setStagedImages((prev) => [...prev, ...newStaged].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Send WhatsApp-Style Encrypted Photos
  const handleSendImages = async () => {
    if (!activeConversationId || !user || stagedImages.length === 0 || isEncryptingImages) return;

    if (user.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }
    if (partnerId && (blockedUsers.includes(partnerId) || blockedMeUsers.includes(partnerId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }
    if (!isGroupChat && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    setIsEncryptingImages(true);
    const caption = inputMessage.trim();
    const currentStaged = [...stagedImages];
    setInputMessage("");
    setStagedImages([]);

    const tempId = `temp-img-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const optimisticImages: ChatImageItem[] = currentStaged.map((s) => ({
      id: s.id,
      url: s.previewUrl,
    }));
    const optimisticContent = serializeImagesMessage(optimisticImages, caption);
    const optimisticMsg: DirectMessage = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content: optimisticContent,
      created_at: nowIso,
      profiles: {
        username: user.name || user.username || "You",
        avatar: user.avatar || "user",
      },
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
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

      const serializedContent = serializeImagesMessage(encryptedItems, caption);
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content: serializedContent,
        })
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          profiles (
            username,
            avatar
          )
        `)
        .single();

      if (!error && data) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as any) : m)));
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: nowIso })
        .eq("id", activeConversationId);

      markAsRead(activeConversationId);
    } catch (err) {
      console.error("Failed to send encrypted images:", err);
    } finally {
      setIsEncryptingImages(false);
    }
  };

  // Send Animated GIF
  const handleSendGif = async (gifUrl: string, gifTitle: string) => {
    if (!activeConversationId || !user || isSending) return;

    if (user.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }
    if (partnerId && (blockedUsers.includes(partnerId) || blockedMeUsers.includes(partnerId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }
    if (!isGroupChat && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    setIsGifPickerOpen(false);
    setIsSending(true);

    const content = serializeGifMessage(gifUrl, gifTitle);
    const tempId = "temp-gif-" + Date.now();
    const nowIso = new Date().toISOString();

    const optimisticMsg: DirectMessage = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content,
      created_at: nowIso,
      profiles: {
        username: user.name || user.username || "You",
        avatar: user.avatar || "user",
      },
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
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          profiles (
            username,
            avatar
          )
        `)
        .single();

      if (!error && data) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as any) : m)));
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: nowIso })
        .eq("id", activeConversationId);

      markAsRead(activeConversationId);
    } catch (err) {
      console.error("Failed to send GIF:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Clear Chat for Me Only
  const handleClearChatForMe = async () => {
    if (!activeConversationId || !user?.id) return;
    const nowIso = new Date().toISOString();
    const updatedMap = { ...clearedChatsMap, [activeConversationId]: nowIso };
    setClearedChatsMap(updatedMap);
    setMessages([]);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(`yapclub_cleared_chats_${user.id}`, JSON.stringify(updatedMap));
      } catch {}
    }

    Promise.resolve(
      supabase
        .from("profiles")
        .select("social_links")
        .eq("id", user.id)
        .maybeSingle()
    )
      .then(({ data }) => {
        const links = data?.social_links || {};
        const remoteMap = links.cleared_chats_map || {};
        remoteMap[activeConversationId] = nowIso;
        return supabase
          .from("profiles")
          .update({ social_links: { ...links, cleared_chats_map: remoteMap } })
          .eq("id", user.id);
      })
      .catch(() => {});

    setShowClearConfirm(false);
    setIsHeaderMenuOpen(false);
  };

  // Handle Send Message with Strict Relationship & Format Verification
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    // If staged images exist, send images instead
    if (stagedImages.length > 0) {
      await handleSendImages();
      return;
    }

    // Message editing within 5 minutes
    if (editingMessage) {
      if (!inputMessage.trim() || !user?.id) return;
      const ageMs = Date.now() - new Date(editingMessage.createdAt).getTime();
      if (ageMs > 5 * 60 * 1000) {
        alert("Messages can only be edited within 5 minutes of sending.");
        setEditingMessage(null);
        setInputMessage("");
        return;
      }
      const targetMsg = messages.find((m) => m.id === editingMessage.id);
      const parsedTarget = targetMsg ? parseMessageContent(targetMsg.content) : null;
      const newContent = serializeTextMessage(
        inputMessage.trim(),
        parsedTarget?.replyTo,
        true,
        parsedTarget?.reactions
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === editingMessage.id ? { ...m, content: newContent } : m))
      );
      const msgIdToEdit = editingMessage.id;
      setEditingMessage(null);
      setInputMessage("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch("/api/messages", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({ id: msgIdToEdit, content: newContent, userId: user.id }),
        });
      } catch (err) {
        console.error("Failed to edit message:", err);
      }
      return;
    }

    if (!inputMessage.trim() || !activeConversationId || !user?.id || isSending) return;

    // Platform ban guard
    if (user.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }

    // Block status guard
    if (partnerId && (blockedUsers.includes(partnerId) || blockedMeUsers.includes(partnerId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }

    // Mutual connection acceptance guard
    if (!isGroupChat && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Messaging is locked until the follow request is accepted by both users.");
      return;
    }

    const text = inputMessage.trim();
    const content = serializeTextMessage(text);
    setInputMessage("");
    setIsSending(true);

    const tempId = "temp_" + Date.now();
    const optimisticMsg: DirectMessage = {
      id: tempId,
      conversation_id: activeConversationId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: {
        username: user.name || user.username || "You",
        avatar: user.avatar || "user",
      },
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
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          profiles (
            username,
            avatar
          )
        `)
        .single();

      if (error) {
        console.error("Failed to send message:", error);
      } else if (data) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as any) : m)));
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", activeConversationId);

      markAsRead(activeConversationId);
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user?.id) return;
      const targetMsg = messages.find((m) => m.id === messageId);
      if (!targetMsg) return;

      const dName = getProfileDisplayName(user, user.username || "You");

      const { newContent } = toggleReactionInContent(targetMsg.content, {
        emoji,
        userId: user.id,
        username: user.username,
        displayName: dName,
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: newContent } : m))
      );

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
      } catch (e) {
        console.error("Failed to save reaction in room messenger:", e);
      }
    },
    [messages, user]
  );

  // Quick Room Invite sending
  const handleSendRoomInvite = async () => {
    if (!currentJunction || !activeConversationId || !user?.id || isSending) return;

    if (user.isBanned) {
      alert("Your account is currently suspended. Messaging is disabled.");
      return;
    }

    if (partnerId && (blockedUsers.includes(partnerId) || blockedMeUsers.includes(partnerId))) {
      alert("Cannot send messages in this conversation.");
      return;
    }

    if (!isGroupChat && (!targetRelationship || !targetRelationship.isAcceptedConnection)) {
      alert("Follow request must be accepted before you can send room invites.");
      return;
    }

    setIsSending(true);
    try {
      const content = serializeRoomInvite({
        junctionId: currentJunction.id,
        junctionName: currentJunction.name,
        description: currentJunction.description,
        participantCount: currentJunction.participantCount,
        maxParticipants: currentJunction.maxParticipants,
        inviterName: user.name || user.username || "Your friend",
      });

      const tempId = "temp_" + Date.now();
      const optimisticMsg: DirectMessage = {
        id: tempId,
        conversation_id: activeConversationId,
        sender_id: user.id,
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: activeConversationId,
          sender_id: user.id,
          content,
        })
        .select(`
          id,
          conversation_id,
          sender_id,
          content,
          created_at,
          profiles (
            username,
            avatar
          )
        `)
        .single();

      if (error) {
        console.error("Failed to send room invite:", error);
      } else if (data) {
        setMessages((prev) => prev.map((m) => (m.id === tempId ? (data as any) : m)));
      }

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", activeConversationId);

      markAsRead(activeConversationId);
    } catch (err) {
      console.error("Failed to send room invite:", err);
    } finally {
      setIsSending(false);
    }
  };

  // Only render if user is logged in, registered, and messenger is open
  if (!isLoaded || !isRegistered || !user || !isOpen) {
    return null;
  }

  const activePartnerShownName = activePartner ? getProfileDisplayName(activePartner, activePartner.username) : "Direct Message";
  const activePartnerName = isGroupChat
    ? activeConversation?.name || "Group Chat"
    : activePartner
    ? nicknames[activePartner.id] || activePartnerShownName
    : "Direct Message";

  const isBlocked = partnerId ? blockedUsers.includes(partnerId) : false;
  const isBlockedByOther = partnerId ? blockedMeUsers.includes(partnerId) : false;

  const filteredConversations = conversations.filter((c) => {
    const dName = c.other_user ? getProfileDisplayName(c.other_user, c.other_user.username) : "";
    const name = c.other_user
      ? nicknames[c.other_user.id] || dName || c.other_user.username
      : c.name || "";
    return name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.other_user?.username || "").toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div
      className={`fixed z-50 transition-all duration-300 ease-out shadow-2xl backdrop-blur-2xl border border-white/10 bg-[#0B0C15]/95 overflow-hidden flex flex-col ${
        isMinimized
          ? "bottom-20 right-3.5 sm:right-6 w-auto sm:min-w-[280px] h-14 rounded-2xl bg-[#0F101C]/95 border-white/15 px-3 py-2"
          : "inset-x-3 bottom-20 top-14 sm:inset-auto sm:bottom-20 sm:right-6 sm:w-[400px] sm:h-[530px] rounded-3xl"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.08] bg-black/40 backdrop-blur-md flex items-center justify-between shrink-0 select-none">
        {activeConversationId ? (
          /* Conversation View Header */
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setActiveConversationId(null);
                setActivePartnerStub(null);
                setGroupMembersMap({});
                fetchConversations();
              }}
              className="p-1.5 -ml-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              title="Back to Chats"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Avatar or Group Icon */}
            {isGroupChat ? (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500/25 to-purple-500/25 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-sm shrink-0">
                <Users size={16} />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-800 border border-white/15 shrink-0 shadow-sm">
                {activePartner?.avatar?.includes("http") ? (
                  <img
                    src={activePartner.avatar}
                    alt={activePartnerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <UserAvatar avatar={activePartner?.avatar || "user"} size="sm" className="!w-full !h-full" />
                )}
              </div>
            )}

            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-white truncate max-w-[150px] sm:max-w-[180px]">
                {activePartnerName}
              </h4>
              <div className="text-[10px] font-medium flex items-center gap-1.5">
                {isGroupChat ? (
                  <span className="text-indigo-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    {Object.keys(groupMembersMap).length > 0
                      ? `${Object.keys(groupMembersMap).length} members`
                      : "Group Chat"}
                  </span>
                ) : targetRelationship?.isAcceptedConnection ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Connected
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Lock size={10} /> Locked
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Inbox View Header */
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <MessageCircle size={16} />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-bold text-white tracking-wide">Direct Messages</h4>
              <p className="text-[10px] text-slate-400">Connected conversations</p>
            </div>
            {unreadCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-bold">
                {unreadCount} new
              </span>
            )}
          </div>
        )}

        {/* Window Controls */}
        <div className="flex items-center gap-1">
          {activeConversationId && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsHeaderMenuOpen(!isHeaderMenuOpen)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                title="Conversation Options"
              >
                <MoreVertical size={14} />
              </button>
              {isHeaderMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsHeaderMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-8 z-50 w-44 bg-[#141524]/95 border border-white/15 rounded-2xl shadow-2xl backdrop-blur-xl p-1 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        setShowClearConfirm(true);
                      }}
                      className="w-full px-3 py-2 text-left text-xs font-medium text-rose-300 hover:bg-rose-500/15 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} className="text-rose-400" />
                      <span>Clear Chat for Me</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsMinimized(!isMinimized)}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <Maximize2 size={13} /> : <Minus size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              setActiveConversationId(null);
              setActivePartnerStub(null);
              setGroupMembersMap({});
            }}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-colors cursor-pointer"
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
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0B13]/50">
              {/* Search Bar */}
              <div className="px-3 py-2.5 border-b border-white/[0.06] bg-black/25">
                <div className="relative flex items-center">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chats..."
                    className="w-full pl-10 pr-8 py-2 bg-black/40 hover:bg-black/50 border border-white/10 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/10 hover:bg-white/20 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                      title="Clear search"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              </div>

              {/* Conversations Scroll Area */}
              <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03] p-1">
                {isLoading ? (
                  <div className="flex items-center justify-center h-48 text-slate-500 text-xs gap-2">
                    <Loader2 size={16} className="animate-spin text-indigo-400" />
                    <span>Loading conversations...</span>
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center px-4 text-slate-500">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-2.5 shadow-inner">
                      <MessageCircle size={20} />
                    </div>
                    <p className="text-xs font-semibold text-slate-300">No conversations yet</p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-[220px]">
                      Follow and connect with friends on YapClub to send direct messages anytime.
                    </p>
                  </div>
                ) : (
                  filteredConversations.map((c) => {
                    const isGroup = c.type === "group";
                    const dName = c.other_user ? getProfileDisplayName(c.other_user, c.other_user.username) : "Chat";
                    const name = isGroup
                      ? c.name || "Group Chat"
                      : c.other_user
                      ? nicknames[c.other_user.id] || dName || c.other_user.username
                      : c.name || "Chat";
                    const unread = unreadByConversation[c.id] || 0;

                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setActiveConversationId(c.id);
                          markAsRead(c.id);
                        }}
                        className="w-full px-3 py-2.5 rounded-2xl flex items-center justify-between gap-3 hover:bg-white/[0.05] active:bg-white/[0.08] transition-all text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isGroup ? (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                              <Users size={18} />
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-800 border border-white/15 shrink-0">
                              {c.other_user?.avatar?.includes("http") ? (
                                <img src={c.other_user.avatar} alt={name} className="w-full h-full object-cover" />
                              ) : (
                                <UserAvatar avatar={c.other_user?.avatar || "user"} size="sm" className="!w-full !h-full" />
                              )}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
                              {name}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              {c.last_message_at && new Date(c.last_message_at).getTime() > 0
                                ? new Date(c.last_message_at).toLocaleDateString([], {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "Active chat"}
                            </p>
                          </div>
                        </div>

                        {unread > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-[10px] font-bold shadow-md shrink-0">
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
            <div className="flex-1 flex flex-col overflow-hidden bg-[#0A0B13]/40">
              {/* Message Stream */}
              <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 scroll-smooth">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-6 select-none opacity-80">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-2.5 shadow-inner">
                      <Sparkles size={20} />
                    </div>
                    <span className="text-xs font-semibold text-slate-200">Start the conversation</span>
                    <p className="text-[10px] text-slate-400 mt-0.5">Send a message to {activePartnerName}</p>
                  </div>
                ) : (
                  messages.map((m, index) => {
                    const isMe = m.sender_id === user.id;
                    const parsed = parseMessageContent(m.content);

                    // Resolve sender identity for group chat
                    const memberProfile = groupMembersMap[m.sender_id] || (m as any).profiles;
                    const memberDisplayName = getProfileDisplayName(memberProfile, memberProfile?.username || "Member");
                    const senderName = isMe
                      ? "You"
                      : nicknames[m.sender_id] || memberDisplayName || "Member";

                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const isNewDay = !prevMsg || !isSameDay(prevMsg.created_at, m.created_at);
                    const dateLabel = isNewDay ? formatChatDateDivider(m.created_at) : null;
                    const isSameSenderAsPrev = !isNewDay && prevMsg && prevMsg.sender_id === m.sender_id;
                    const isFirstInCluster = !isSameSenderAsPrev;

                    return (
                      <Fragment key={m.id}>
                        {isNewDay && dateLabel && (
                          <div className="w-full flex justify-center my-2 select-none pointer-events-none sticky top-1 z-20">
                            <div className="px-3 py-0.5 rounded-full bg-[#151622]/95 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-slate-300 shadow-md tracking-wide">
                              <span>{dateLabel}</span>
                            </div>
                          </div>
                        )}
                        <div
                          className={`flex items-start gap-2 max-w-full ${isMe ? "justify-end" : "justify-start"} ${isFirstInCluster ? "mt-2.5" : "mt-1"}`}
                        >
                          {/* Avatar in group for incoming messages: avatar on first message in cluster, spacer on consecutive */}
                          {!isMe && isGroupChat && (
                            isFirstInCluster ? (
                              <div className="w-6 h-6 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10 mt-0.5 shadow-sm">
                                {memberProfile?.avatar?.includes("http") ? (
                                  <img src={memberProfile.avatar} alt={senderName} className="w-full h-full object-cover" />
                                ) : (
                                  <UserAvatar avatar={memberProfile?.avatar} size="sm" className="!w-full !h-full" />
                                )}
                              </div>
                            ) : (
                              <div className="w-6 h-6 shrink-0 pointer-events-none" />
                            )
                          )}

                          {/* Snug Message Bubble */}
                          <div
                            className={`w-fit min-w-[64px] max-w-[85%] sm:max-w-[78%] px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl text-[13px] leading-relaxed break-words shadow-sm ${
                              isMe
                                ? `bg-gradient-to-r from-indigo-600 to-indigo-500 text-white ${isFirstInCluster ? "rounded-br-xs" : ""} shadow-indigo-950/30`
                                : `bg-[#181926] text-slate-100 ${isFirstInCluster ? "rounded-bl-xs" : ""} border border-white/[0.08]`
                            }`}
                          >
                            {/* WhatsApp-Style Sender Name inside the bubble on first message in cluster */}
                            {!isMe && isGroupChat && isFirstInCluster && (
                              <div className="mb-0.5 select-none pointer-events-none">
                                <span className={`text-[11px] font-bold tracking-tight truncate block ${getSenderColor(senderName)}`}>
                                  {senderName}
                                </span>
                              </div>
                            )}

                            {parsed.replyTo && (
                              <div className="mb-1.5 px-2.5 py-1.5 rounded-xl bg-black/30 text-[10px] border-l-2 border-indigo-400 w-full min-w-0 overflow-hidden">
                                <div className="flex items-center gap-1 font-semibold text-indigo-300 min-w-0 mb-0.5">
                                  <span className="truncate">{parsed.replyTo.sender}</span>
                                </div>
                                <p className="line-clamp-2 break-words w-full overflow-hidden text-ellipsis opacity-80">
                                  {parsed.replyTo.isVoice ? "🎵 Voice Note" : parsed.replyTo.text}
                                </p>
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
                                conversationId={activeConversationId}
                                caption={parsed.text}
                                isMe={isMe}
                                onOpenLightbox={(imgs, idx) => openClusterLightbox(imgs, idx, m.id)}
                                onOpenReactionPicker={() => setActiveReactionPickerMsgId((prev) => (prev === m.id ? null : m.id))}
                                onToggleReaction={(emoji) => handleToggleReaction(m.id, emoji)}
                                timestamp={new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                readStatusNode={
                                  isMe && !isGroupChat ? (
                                    <span 
                                      className="inline-flex items-center gap-0.5 ml-0.5"
                                      title={partnerLastReadAt && new Date(partnerLastReadAt).getTime() >= new Date(m.created_at).getTime() ? "Seen" : "Delivered"}
                                    >
                                      {partnerLastReadAt && new Date(partnerLastReadAt).getTime() >= new Date(m.created_at).getTime() ? (
                                        <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                                      ) : (
                                        <CheckCheck size={11} className="stroke-[1.8] text-indigo-200/70" />
                                      )}
                                    </span>
                                  ) : undefined
                                }
                              />
                            </div>
                          ) : parsed.type === "gif" && parsed.gifUrl ? (
                            <div className="relative rounded-xl overflow-hidden max-w-[240px] bg-black/40 group/gif my-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveReactionPickerMsgId((prev) => (prev === m.id ? null : m.id));
                                }}
                                className="absolute top-1.5 right-1.5 z-20 p-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white/80 hover:text-amber-300 border border-white/15 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-lg flex items-center justify-center opacity-85 hover:opacity-100"
                                title="React to GIF"
                              >
                                <Smile size={13} />
                              </button>
                              <img
                                src={parsed.gifUrl}
                                alt={parsed.gifTitle || "GIF"}
                                className="w-full h-auto max-h-[180px] object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => {
                                  setLightboxImages([{ url: parsed.gifUrl!, title: parsed.gifTitle || "GIF" }]);
                                  setLightboxIndex(0);
                                  setLightboxMessageId(m.id);
                                  setIsLightboxOpen(true);
                                }}
                              />
                              <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-black text-white/90 border border-white/10 pointer-events-none tracking-wider">
                                GIF
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-0.5">
                              <p className="whitespace-pre-wrap select-text break-words min-w-0 text-[13px] leading-relaxed">
                                {parsed.text}
                              </p>
                              <div
                                className={`flex items-center gap-1 select-none shrink-0 ml-auto pb-0.5 text-[9px] font-mono ${
                                  isMe ? "text-indigo-200/70" : "text-slate-400/80"
                                }`}
                              >
                                {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                                <span>
                                  {new Date(m.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>

                                {/* 5-Minute Message Edit Action Button */}
                                {isMe && parsed.type === "text" && (Date.now() - new Date(m.created_at).getTime() <= 5 * 60 * 1000) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingMessage({ id: m.id, text: parsed.text || "", createdAt: m.created_at });
                                      setInputMessage(parsed.text || "");
                                    }}
                                    className="p-0.5 hover:text-white text-indigo-200/80 transition-colors cursor-pointer"
                                    title="Edit message (within 5 min)"
                                  >
                                    <Edit3 size={10} />
                                  </button>
                                )}

                                {/* Smile React Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveReactionPickerMsgId((prev) => (prev === m.id ? null : m.id));
                                  }}
                                  className="p-0.5 hover:text-amber-300 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                                  title="Add reaction"
                                >
                                  <Smile size={10} />
                                </button>

                                {/* Sent / Seen ticks for 1-on-1 chats */}
                                {isMe && !isGroupChat && (
                                  <span 
                                    className="inline-flex items-center gap-0.5 ml-0.5"
                                    title={partnerLastReadAt && new Date(partnerLastReadAt).getTime() >= new Date(m.created_at).getTime() ? "Seen" : "Delivered"}
                                  >
                                    {partnerLastReadAt && new Date(partnerLastReadAt).getTime() >= new Date(m.created_at).getTime() ? (
                                      <CheckCheck size={11} className="stroke-[2.5] text-sky-400" />
                                    ) : (
                                      <CheckCheck size={11} className="stroke-[1.8] text-indigo-200/70" />
                                    )}
                                  </span>
                                )}

                                {/* Group chat seen status */}
                                {isMe && isGroupChat && (() => {
                                  const otherMembers = Object.entries(groupMembersMap).filter(([uid]) => uid !== user?.id);
                                  const total = otherMembers.length;
                                  if (total === 0) return null;
                                  const msgTime = new Date(m.created_at).getTime();
                                  const readCount = otherMembers.filter(([, member]) => member.lastReadAt && new Date(member.lastReadAt).getTime() >= msgTime).length;
                                  const isAll = readCount === total;

                                  return (
                                    <span
                                      className={`inline-flex items-center gap-0.5 ml-1 text-[9px] font-semibold ${
                                        isAll ? "text-sky-400" : readCount > 0 ? "text-sky-300" : "text-indigo-200/60"
                                      }`}
                                      title={isAll ? "Seen by all" : readCount > 0 ? `Seen by ${readCount}/${total}` : "Delivered"}
                                    >
                                      {isAll ? (
                                        <>
                                          <CheckCheck size={11} className="stroke-[2.5]" />
                                          <span>all</span>
                                        </>
                                      ) : readCount > 0 ? (
                                        <>
                                          <CheckCheck size={11} className="stroke-[2]" />
                                          <span>{readCount}</span>
                                        </>
                                      ) : (
                                        <Check size={10} className="stroke-[2]" />
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Bubble timestamp for Voice & Invites */}
                          {(parsed.type === "voice" || parsed.type === "room_invite") && (
                            <div
                              className={`flex items-center justify-end gap-1 mt-1 text-[9px] font-mono select-none ${
                                isMe ? "text-indigo-200/70" : "text-slate-400/80"
                              }`}
                            >
                              {parsed.isEdited && <span className="italic opacity-80">(edited)</span>}
                              <span>
                                {new Date(m.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          )}

                          {/* Reaction Badges */}
                          <ReactionBadges
                            reactions={parsed.reactions}
                            currentUserId={user?.id}
                            onToggleReaction={(emoji) => handleToggleReaction(m.id, emoji)}
                            isMe={isMe}
                          />

                          {/* Floating Quick Reaction Picker */}
                          {activeReactionPickerMsgId === m.id && (
                            <div className={`relative mt-1 z-30 ${isMe ? "self-end" : "self-start"}`}>
                              <QuickReactionPicker
                                onSelect={(emoji) => {
                                  handleToggleReaction(m.id, emoji);
                                }}
                                onClose={() => setActiveReactionPickerMsgId(null)}
                                isMe={isMe}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Bottom Area: Guards vs Polished Input Form */}
              {user.isBanned ? (
                <div className="p-3 border-t border-rose-500/20 bg-rose-950/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                  <span>Your account is currently suspended. Messaging is disabled.</span>
                </div>
              ) : isBlocked ? (
                <div className="p-3 border-t border-white/[0.08] bg-black/40 text-slate-400 text-xs flex items-center justify-between gap-2">
                  <span>You have blocked this contact.</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!partnerId) return;
                      await socialService.unblockUser(user.id, partnerId);
                      const { blockedByMeIds, blockedMeIds } = await socialService.getBlockLists(user.id);
                      setBlockedUsers(blockedByMeIds);
                      setBlockedMeUsers(blockedMeIds);
                    }}
                    className="text-xs text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Unblock
                  </button>
                </div>
              ) : isBlockedByOther ? (
                <div className="p-3 border-t border-white/[0.08] bg-black/40 text-slate-400 text-xs flex items-center gap-2">
                  <Lock size={14} className="text-slate-500 shrink-0" />
                  <span>This user is unavailable.</span>
                </div>
              ) : !isGroupChat && partnerId && isRelationshipLoading && !targetRelationship ? (
                <div className="p-3.5 border-t border-white/[0.08] bg-black/40 flex items-center justify-center gap-2 text-slate-400 text-xs">
                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                  <span>Verifying connection status...</span>
                </div>
              ) : !isGroupChat && partnerId && (!targetRelationship || !targetRelationship.isAcceptedConnection) ? (
                /* Follow Acceptance Guard Banner with Direct Action Buttons */
                <div className="p-3.5 border-t border-white/[0.08] bg-black/50 backdrop-blur-md flex flex-col gap-2.5 shrink-0 animate-in fade-in">
                  <div className="flex items-center gap-2 text-amber-300 text-xs">
                    <Lock size={15} className="text-amber-400 shrink-0" />
                    <span>
                      {targetRelationship?.hasPendingRequestFromMe
                        ? "Follow request sent. Messaging is locked until they accept."
                        : targetRelationship?.hasPendingRequestFromThem
                        ? "This user sent you a follow request. Accept to start messaging."
                        : "Follow request must be accepted before you can send messages."}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {targetRelationship?.hasPendingRequestFromThem ? (
                      <>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={async () => {
                            if (!user || !partnerId) return;
                            setIsActionLoading(true);
                            try {
                              const res = await socialService.acceptFollowRequest(
                                user.id,
                                partnerId,
                                targetRelationship.incomingRequestId
                              );
                              if (res.success) {
                                const rel = await socialService.getRelationship(user.id, partnerId);
                                setTargetRelationship(rel);
                              }
                            } finally {
                              setIsActionLoading(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-1.5"
                        >
                          {isActionLoading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          <span>Accept Request</span>
                        </button>
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={async () => {
                            if (!user || !partnerId) return;
                            setIsActionLoading(true);
                            try {
                              const res = await socialService.declineFollowRequest(
                                user.id,
                                partnerId,
                                targetRelationship.incomingRequestId
                              );
                              if (res.success) {
                                const rel = await socialService.getRelationship(user.id, partnerId);
                                setTargetRelationship(rel);
                              }
                            } finally {
                              setIsActionLoading(false);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
                        >
                          Decline
                        </button>
                      </>
                    ) : targetRelationship?.hasPendingRequestFromMe ? (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={async () => {
                          if (!user || !partnerId) return;
                          setIsActionLoading(true);
                          try {
                            const res = await socialService.cancelFollowRequest(user.id, partnerId);
                            if (res.success) {
                              const rel = await socialService.getRelationship(user.id, partnerId);
                              setTargetRelationship(rel);
                            }
                          } finally {
                            setIsActionLoading(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-white/10 text-xs font-semibold active:scale-95 transition-all shrink-0 cursor-pointer"
                      >
                        {isActionLoading ? <Loader2 size={13} className="animate-spin" /> : null}
                        <span>Cancel Request</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isActionLoading}
                        onClick={async () => {
                          if (!user || !partnerId) return;
                          setIsActionLoading(true);
                          try {
                            const res = await socialService.followUser(user.id, partnerId);
                            if (res.success) {
                              const rel = await socialService.getRelationship(user.id, partnerId);
                              setTargetRelationship(rel);
                            } else if (res.error) {
                              alert(res.error);
                            }
                          } finally {
                            setIsActionLoading(false);
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold active:scale-95 transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-1.5"
                      >
                        {isActionLoading ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                        <span>Send Follow Request</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/[0.08] bg-[#0E0F17]/95 backdrop-blur-xl shrink-0 flex flex-col">
                  {/* Editing Message Banner */}
                  {editingMessage && (
                    <div className="px-3.5 py-1.5 bg-indigo-950/70 border-b border-indigo-500/25 text-xs flex items-center justify-between text-indigo-300 animate-in fade-in">
                      <span className="flex items-center gap-1.5 truncate">
                        <Edit3 size={12} className="text-indigo-400 shrink-0" />
                        <span>Editing message (allowed within 5 min)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessage(null);
                          setInputMessage("");
                        }}
                        className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Cancel edit"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  {/* Staged Encrypted Photos Thumbnail Preview Strip */}
                  {stagedImages.length > 0 && (
                    <div className="p-2.5 bg-black/60 border-b border-white/10 flex items-center gap-2 overflow-x-auto animate-in fade-in">
                      <div className="flex items-center gap-2">
                        {stagedImages.map((staged, idx) => (
                          <div key={staged.id} className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/20 shrink-0 group">
                            <img src={staged.previewUrl} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setStagedImages((prev) => prev.filter((s) => s.id !== staged.id))}
                              className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/80 hover:bg-rose-600 text-white flex items-center justify-center transition-colors cursor-pointer"
                              title="Remove photo"
                            >
                              <X size={9} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <span className="text-[10px] text-indigo-300 font-semibold shrink-0">
                        {stagedImages.length} photo{stagedImages.length > 1 ? "s" : ""} staged
                      </span>
                    </div>
                  )}

                  {/* Hidden File Input for Image Attachments */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleSelectPhotos}
                    className="hidden"
                  />

                  {/* Enhanced Sleek Message Input Form */}
                  <form
                    onSubmit={handleSendMessage}
                    className="p-2.5 sm:p-3"
                  >
                    <div className="flex items-center gap-1.5 sm:gap-2 bg-[#141522] border border-white/10 hover:border-white/15 focus-within:border-indigo-500/60 focus-within:ring-2 focus-within:ring-indigo-500/20 rounded-2xl p-1.5 transition-all shadow-inner">
                      {/* Attach Photo Button */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending || isEncryptingImages}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
                        title="Attach photos (WhatsApp-style E2EE)"
                        aria-label="Attach photos"
                      >
                        <ImageIcon size={16} />
                      </button>

                      {/* GIF Button */}
                      <button
                        type="button"
                        onClick={() => setIsGifPickerOpen(true)}
                        disabled={isSending || isEncryptingImages}
                        className="px-1.5 py-0.5 rounded-md border border-white/20 hover:border-white/40 text-slate-300 hover:text-white text-[10px] font-black tracking-wider active:scale-95 transition-all cursor-pointer shrink-0"
                        title="Choose animated GIF"
                        aria-label="Choose GIF"
                      >
                        GIF
                      </button>

                      {/* Quick Room Invite Button if in a Junction Room */}
                      {currentJunction && (
                        <button
                          type="button"
                          onClick={handleSendRoomInvite}
                          disabled={isSending || isEncryptingImages}
                          title={`Invite ${activePartnerName} to ${currentJunction.name}`}
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-600 active:scale-90 transition-all cursor-pointer shrink-0"
                        >
                          <Radio size={13} />
                        </button>
                      )}

                      <input
                        ref={inputRef}
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder={
                          editingMessage
                            ? "Edit message..."
                            : stagedImages.length > 0
                            ? "Add a caption..."
                            : `Message ${activePartnerName}...`
                        }
                        maxLength={500}
                        className="flex-1 bg-transparent px-2 py-1.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none min-w-0 font-normal"
                      />

                      <button
                        type="submit"
                        disabled={
                          (!inputMessage.trim() && stagedImages.length === 0 && !editingMessage) ||
                          isSending ||
                          isEncryptingImages
                        }
                        className={`min-w-[32px] h-8 px-2.5 rounded-xl flex items-center justify-center gap-1 transition-all shrink-0 ${
                          (inputMessage.trim() || stagedImages.length > 0 || editingMessage) &&
                          !isSending &&
                          !isEncryptingImages
                            ? "bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-md shadow-indigo-600/30 scale-100 hover:scale-105 active:scale-95 cursor-pointer text-xs font-semibold"
                            : "bg-white/5 text-slate-600 cursor-not-allowed text-xs font-semibold"
                        }`}
                        aria-label={editingMessage ? "Save Edit" : stagedImages.length > 0 ? "Send Photos" : "Send message"}
                      >
                        {isSending || isEncryptingImages ? (
                          <Loader2 size={13} className="animate-spin text-indigo-400" />
                        ) : stagedImages.length > 0 ? (
                          <span>Send ({stagedImages.length})</span>
                        ) : editingMessage ? (
                          <span>Save</span>
                        ) : (
                          <Send size={13} className={inputMessage.trim() ? "translate-x-0.5" : ""} />
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Clear Chat Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xs bg-[#12131F] border border-white/15 rounded-2xl p-4 shadow-2xl text-center flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-2.5">
              <Trash2 size={18} />
            </div>
            <h4 className="text-sm font-bold text-white mb-1">Clear chat for you?</h4>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              This will clear the conversation messages from your view only. Other participants will not be affected.
            </p>
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearChatForMe}
                className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors shadow-md cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GIF Picker Modal */}
      <GifPicker
        isOpen={isGifPickerOpen}
        onClose={() => setIsGifPickerOpen(false)}
        onSelectGif={handleSendGif}
      />

      {/* Fullscreen Media Lightbox for InRoomMessenger */}
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
    </div>
  );
}

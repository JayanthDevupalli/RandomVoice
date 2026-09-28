"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GuestUser, Junction, JunctionParticipant, RoomChatMessage } from "@/lib/types";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";
import { useUser } from "@/hooks/useUser";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { ModeratorControlModal } from "./ModeratorControlModal";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { ProfilePreviewModal } from "@/components/profile/ProfilePreviewModal";
import { InRoomMessenger } from "./InRoomMessenger";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabase";
import { LiveKitRoom, useTracks, useLocalParticipant, useRoomContext, useConnectionState } from "@livekit/components-react";
import { Track, RoomEvent, ConnectionState } from "livekit-client";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  MessageSquare,
  MessageCircle,
  Smile,
  Users,
  Share2,
  AlertCircle,
  Radio,
  Send,
  X,
  Volume1,
  UserPlus,
  Flame,
  Rocket,
  Heart,
  Sparkles,
  Crown,
  Shield,
  ThumbsUp,
  Activity,
  MoreVertical,
  Reply,
  Edit2,
  Trash2,
  ChevronDown,
  Lock,
  Check,
  Compass,
  LogIn,
  RotateCw,
  Search,
  Bell,
  BellOff,
  Eye,
  EyeOff
} from "lucide-react";

interface JunctionRoomProps {
  junctionId: string;
  guest: GuestUser;
}

interface InRoomPopupMessage {
  id: string;
  senderName: string;
  avatar?: string;
  color?: string;
  text: string;
  isWhisper: boolean;
  targetIdentity?: string;
  timestamp: number;
}

interface VectorReaction {
  id: string;
  iconName: string;
  label: string;
  senderName: string;
  color: string;
  x: number;
}

const EMOJI_REACTIONS = [
  { id: "heart", label: "Love", emoji: "❤️", color: "#EC4899" },
  { id: "fire", label: "Fire", emoji: "🔥", color: "#F59E0B" },
  { id: "rocket", label: "Rocket", emoji: "🚀", color: "#8B5CF6" },
  { id: "laugh", label: "Haha", emoji: "😂", color: "#EAB308" },
  { id: "clap", label: "Clap", emoji: "👏", color: "#10B981" },
  { id: "100", label: "100", emoji: "💯", color: "#EF4444" },
  { id: "party", label: "Party", emoji: "🎉", color: "#3B82F6" },
];

function ParticipantAudio({ identity, volume, isDeafened }: { identity: string; volume: number; isDeafened: boolean }) {
  const tracks = useTracks([Track.Source.Microphone]);
  const track = tracks.find((t) => t.participant?.identity === identity)?.publication?.track;
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (el && track) {
      track.attach(el);
    }
    return () => {
      if (el && track) {
        track.detach(el);
      }
    };
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      const safeVolume = Math.min(1, Math.max(0, (volume ?? 100) / 100));
      audioRef.current.volume = isDeafened ? 0 : safeVolume;
    }
  }, [volume, isDeafened]);

  return <audio ref={audioRef} autoPlay playsInline style={{ display: "none" }} />;
}

function LiveKitDataSync({
  onMessage,
  publishRef,
  onSpeakingChange,
  isMuted,
  isMutedByMod,
  isDeafened
}: {
  onMessage: (data: any) => void;
  publishRef: React.MutableRefObject<((data: any) => void) | null>;
  onSpeakingChange: (speakingIdentities: string[]) => void;
  isMuted: boolean;
  isMutedByMod: boolean;
  isDeafened: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!room) return;
    const handleData = (
      payload: Uint8Array,
      participant?: any,
      kind?: any,
      topic?: string
    ) => {
      try {
        const strData = new TextDecoder().decode(payload);
        const parsed = JSON.parse(strData);
        onMessage(parsed);
      } catch (err) { }
    };
    room.on(RoomEvent.DataReceived, handleData);

    const handleActiveSpeakers = (speakers: any[]) => {
      onSpeakingChange(speakers.map(s => s.identity));
    };
    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);

    return () => {
      room.off(RoomEvent.DataReceived, handleData);
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [room, onMessage, onSpeakingChange]);

  useEffect(() => {
    if (localParticipant) {
      publishRef.current = async (data: any) => {
        try {
          const strData = JSON.stringify(data);
          const encoded = new TextEncoder().encode(strData);
          await localParticipant.publishData(encoded, { reliable: true });
        } catch (err) {
          console.error("Failed to publish LiveKit data", err);
        }
      };
    }
    return () => {
      publishRef.current = null;
    };
  }, [localParticipant, publishRef]);

  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(
        !(isMuted || isMutedByMod || isDeafened),
        {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        }
      ).catch(console.error);
    }
  }, [localParticipant, isMuted, isMutedByMod, isDeafened]);

  return null;
}

function RoomConnectionOverlay() {
  const connectionState = useConnectionState();
  if (connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.Connecting) {
    return (
      <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center animate-fadeIn text-white pointer-events-auto">
        <Activity size={32} className="animate-pulse text-indigo-400 mb-4" />
        <h2 className="text-xl font-bold mb-2 tracking-tight">Reconnecting...</h2>
        <p className="text-sm text-slate-400 font-light">Restoring your secure audio connection</p>
      </div>
    );
  }
  return null;
}

export function JunctionRoom({ junctionId, guest }: JunctionRoomProps) {
  const router = useRouter();

  // Room & participants state
  const [junction, setJunction] = useState<Junction | null>(null);
  const [participants, setParticipants] = useState<JunctionParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kickedNotice, setKickedNotice] = useState<string | null>(null);

  // Audio state - initial join is ALWAYS MUTED by default
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isMutedByMod, setIsMutedByMod] = useState(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem(`junction_mod_muted_${junctionId}`) === "true";
    }
    return false;
  });
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const { user, isRegistered } = useUser();
  const { unreadCount } = useUnreadMessages();
  const [isDirectMessengerOpen, setIsDirectMessengerOpen] = useState(false);
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({});
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);

  // LiveKit state
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [liveKitUrl, setLiveKitUrl] = useState<string | null>(null);

  // Moderation state
  const [isModDeckOpen, setIsModDeckOpen] = useState(false);
  const [activeModMenuParticipant, setActiveModMenuParticipant] = useState<string | null>(null);

  // Chat & Reactions state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"chat" | "junctions">("chat");
  const [chatMessages, setChatMessages] = useState<RoomChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [privateRecipient, setPrivateRecipient] = useState<string>("all");
  const [reactions, setReactions] = useState<VectorReaction[]>([]);
  const [isReactionsOpen, setIsReactionsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // In-Room Whisper Chat: Show msgs / Not show msgs toggle state
  const [showInRoomPopups, setShowInRoomPopups] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("yapclub_show_inroom_popups");
      if (saved !== null) return saved === "true";
    }
    return true; // Default to Show msgs enabled
  });
  const [inRoomPopups, setInRoomPopups] = useState<InRoomPopupMessage[]>([]);

  // Refs for real-time LiveKit handlers to avoid stale closures
  const isChatOpenRef = useRef(isChatOpen);
  isChatOpenRef.current = isChatOpen;
  const rightPanelTabRef = useRef(rightPanelTab);
  rightPanelTabRef.current = rightPanelTab;
  const showInRoomPopupsRef = useRef(showInRoomPopups);
  showInRoomPopupsRef.current = showInRoomPopups;
  const privateRecipientRef = useRef(privateRecipient);
  privateRecipientRef.current = privateRecipient;

  const toggleShowInRoomPopups = useCallback(() => {
    setShowInRoomPopups((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("yapclub_show_inroom_popups", String(next));
      }
      if (!next) {
        setInRoomPopups([]);
      }
      return next;
    });
  }, []);

  // Other Live Junctions Explorer state
  const [otherJunctions, setOtherJunctions] = useState<Junction[]>([]);
  const [isLoadingJunctions, setIsLoadingJunctions] = useState(false);
  const [junctionSearchQuery, setJunctionSearchQuery] = useState("");
  const [isSwitchingRoomId, setIsSwitchingRoomId] = useState<string | null>(null);
  const [switchingRoomName, setSwitchingRoomName] = useState<string | null>(null);

  // Fetch Other Public Junctions
  const fetchOtherJunctions = useCallback(async () => {
    try {
      setIsLoadingJunctions(true);
      const res = await fetch("/api/junctions");
      const data = await res.json();
      if (data?.junctions) {
        const others = (data.junctions as Junction[]).filter(
          (j) =>
            j.id !== junctionId &&
            !j.isLocked &&
            !j.isCustom &&
            !j.creatorId &&
            typeof j.id === "string" &&
            !j.id.startsWith("junc_")
        );
        setOtherJunctions(others);
      }
    } catch (err) {
      console.warn("Failed to fetch other junctions:", err);
    } finally {
      setIsLoadingJunctions(false);
    }
  }, [junctionId]);

  useEffect(() => {
    fetchOtherJunctions();
    const interval = setInterval(fetchOtherJunctions, 15000);
    return () => clearInterval(interval);
  }, [fetchOtherJunctions]);

  // Direct Junction Shifting
  const handleShiftJunction = async (targetJunctionId: string, targetName: string) => {
    if (targetJunctionId === junctionId || isSwitchingRoomId) return;

    setIsSwitchingRoomId(targetJunctionId);
    setSwitchingRoomName(targetName);

    if (typeof window !== "undefined") {
      sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
      sessionStorage.removeItem(`junction_role_${junctionId}`);
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    try {
      await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", identity: guest.name }),
      });
    } catch (e) {
      console.error("Failed to leave current junction before shifting:", e);
    }

    router.push(`/junction/${targetJunctionId}`);
  };

  // Whisper Chat: Reply, Edit & Auto-Scroll state
  const [replyingToMessage, setReplyingToMessage] = useState<RoomChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<RoomChatMessage | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  // Custom Styled Recipient Dropdown state
  const [isRecipientMenuOpen, setIsRecipientMenuOpen] = useState(false);
  const recipientMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (recipientMenuRef.current && !recipientMenuRef.current.contains(e.target as Node)) {
        setIsRecipientMenuOpen(false);
      }
    };
    if (isRecipientMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isRecipientMenuOpen]);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    if (isChatOpen) {
      scrollChatToBottom("smooth");
    }
  }, [chatMessages.length, isChatOpen, scrollChatToBottom]);

  // LiveKit Data Publish Ref
  const liveKitPublishRef = useRef<((data: any) => void) | null>(null);

  // Profile Preview Modal State
  const [previewParticipant, setPreviewParticipant] = useState<JunctionParticipant | null>(null);

  // Web Audio Visualizer for local mic
  const isCurrentModerator = junction?.participants.some(p => p.identity === guest.name && p.role === "moderator") || false;

  // We no longer manually request getUserMedia here because LiveKitRoom with audio={true}
  // will capture the microphone automatically. Double capturing causes ducking and conflicts.
  useEffect(() => {
    // MediaStream is disabled to prevent WebRTC half-duplex conflicts with LiveKit.
    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [mediaStream]);

  const onRoomMessage = useCallback((data: any) => {
    try {
      if (!data) return;
      const { type, payload } = data;

      if (type === "chat_message" && payload) {
        if (payload.targetIdentity && payload.targetIdentity !== guest.name && payload.senderName !== guest.name) {
          return;
        }
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev;
          return [...prev, payload];
        });

        // Trigger pop-up message ONLY if:
        // 1. Message is NOT from self
        // 2. Chat drawer is completely closed
        // 3. showInRoomPopups setting is enabled
        const isSelf = payload.senderName === guest.name || payload.senderId === guest.id;
        if (!isSelf && !isChatOpenRef.current && showInRoomPopupsRef.current) {
          const isWhisper = Boolean(payload.targetIdentity && payload.targetIdentity === guest.name);
          const newPopup: InRoomPopupMessage = {
            id: payload.id || `popup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            senderName: payload.senderName || "Room Participant",
            avatar: payload.avatar,
            color: payload.color,
            text: payload.text || "",
            isWhisper,
            targetIdentity: payload.targetIdentity,
            timestamp: Date.now(),
          };

          // Strictly ONE pop-up at a time - never stack or flood the screen
          setInRoomPopups([newPopup]);

          // Auto-dismiss in 4.5s so it gives comfortable time to read clearly
          setTimeout(() => {
            setInRoomPopups((prev) => prev.filter((p) => p.id !== newPopup.id));
          }, 4500);
        }
      } else if (type === "chat_edit" && payload) {
        const { id, text } = payload;
        setChatMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text, isEdited: true } : m))
        );
      } else if (type === "chat_delete" && payload) {
        const { id } = payload;
        setChatMessages((prev) => prev.filter((m) => m.id !== id));
      } else if (type === "reaction" && payload) {
        setReactions((prev) => [...prev, payload]);
        setTimeout(() => {
          setReactions((prev) => prev.filter((r) => r.id !== payload.id));
        }, 2800);
      } else if (type === "clear_chat") {
        setChatMessages([]);
      } else if (type === "moderation_event" && payload) {
        const { targetIdentity, action } = payload;

        // Immediately reflect in room participants state for all users
        setParticipants((prev) =>
          prev.map((p) => {
            if (p.identity === targetIdentity) {
              if (action === "mute") {
                return { ...p, isMuted: true, isMutedByMod: true };
              } else if (action === "unmute") {
                return { ...p, isMuted: false, isMutedByMod: false };
              }
            }
            return p;
          })
        );

        if (targetIdentity === guest.name) {
          if (action === "mute") {
            setIsMutedByMod(true);
            setIsMuted(true);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
            }
          } else if (action === "unmute") {
            setIsMutedByMod(false);
            setIsMuted(false);
            if (typeof window !== "undefined") {
              sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
            }
          } else if (action === "promote_mod") {
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_role_${junctionId}`, "moderator");
            }
          } else if (action === "demote_mod") {
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_role_${junctionId}`, "speaker");
            }
          } else if (action === "kick" || action === "ban") {
            if (typeof window !== "undefined") {
              sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
              sessionStorage.removeItem(`junction_role_${junctionId}`);
            }
            setKickedNotice(
              action === "ban"
                ? "You have been banned from this junction by the moderator."
                : "You were kicked from this junction by the moderator."
            );
          }
        }
      } else if (type === "participant_mute_change" && payload) {
        const { identity: targetId, isMuted: targetMute } = payload;
        setParticipants((prev) =>
          prev.map((p) =>
            p.identity === targetId ? { ...p, isMuted: targetMute } : p
          )
        );
      } else if (type === "room_ended") {
        setKickedNotice("This junction was ended by the moderator.");
      }
    } catch (err) {
      console.error("Error processing room message", err);
    }
  }, [guest.name]);

  // Refs to avoid re-triggering the main effect on polling state changes
  const kickedNoticeRef = useRef(kickedNotice);
  kickedNoticeRef.current = kickedNotice;
  const isMutedByModRef = useRef(isMutedByMod);
  isMutedByModRef.current = isMutedByMod;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const isRealUnmount = useRef(false);

  // 3. Fetch Junction Details & Join Room
  useEffect(() => {
    let isMounted = true;
    isRealUnmount.current = false;

    async function loadAndJoinJunction() {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/junctions/${junctionId}`);
        const data = await res.json();

        if (!res.ok || !data.junction) {
          throw new Error(data.error || "Junction not found");
        }

        if (!isMounted) return false;
        setJunction(data.junction);

        // Read stored session flags to survive page reloads
        const storedModMuted = typeof window !== "undefined" && sessionStorage.getItem(`junction_mod_muted_${junctionId}`) === "true";
        const storedRole = typeof window !== "undefined" ? sessionStorage.getItem(`junction_role_${junctionId}`) : null;

        // Join the junction via API
        const joinRes = await fetch(`/api/junctions/${junctionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "join",
            participant: {
              id: guest.id,
              identity: guest.name,
              name: guest.name,
              avatar: guest.avatar || "zap",
              color: guest.color || "#6366F1",
              role: storedRole || "speaker", // Backend preserves moderator if already host
              isMuted: true, // Always start MUTED by default
              isMutedByMod: storedModMuted,
              isSpeaking: false,
              connectionQuality: "excellent",
            },
          }),
        });

        const joinData = await joinRes.json();
        if (joinRes.ok && joinData.junction) {
          setJunction(joinData.junction);
          setParticipants(joinData.junction.participants || []);

          // Sync local state if participant is mod-muted or has specific role in DB or session
          const myParticipant = joinData.junction.participants?.find((p: any) => p.identity === guest.name);
          if (myParticipant?.isMutedByMod || storedModMuted) {
            setIsMutedByMod(true);
            setIsMuted(true);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
            }
          }
          if (myParticipant?.role && typeof window !== "undefined") {
            sessionStorage.setItem(`junction_role_${junctionId}`, myParticipant.role);
          }
        } else {
          if (joinData.error) {
            setError(joinData.error);
          }
        }

        setChatMessages([]);

        // Fetch LiveKit Token
        try {
          // Find actual role assigned by the server
          const myParticipant = joinData.junction?.participants.find((p: any) => p.identity === guest.name);
          const role = myParticipant?.role || "speaker";
          const lkRes = await fetch(
            `/api/token?room=${junctionId}&username=${encodeURIComponent(
              guest.name
            )}&avatar=${encodeURIComponent(guest.avatar || "zap")}&color=${encodeURIComponent(
              guest.color || "#6366F1"
            )}&role=${encodeURIComponent(role)}`
          );
          const lkData = await lkRes.json();
          if (lkRes.ok && lkData.token) {
            setLiveKitToken(lkData.token);
            setLiveKitUrl(lkData.serverUrl);
          }
        } catch (e) {
          console.error("Failed to fetch LiveKit token", e);
        }

        return true;
      } catch (err: any) {
        if (isMounted) setError(err.message);
        return false;
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    // Auto-sync polling and real-time updates for junction
    let abortController: AbortController | null = null;
    let pollTimeoutId: NodeJS.Timeout;

    const pollJunction = async () => {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      try {
        const pollRes = await fetch(`/api/junctions/${junctionId}`, {
          signal: abortController.signal,
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!pollRes.ok) {
          if (pollRes.status === 404 && isMounted) {
            setKickedNotice("This junction room has ended.");
          }
          return;
        }
        const pollData = await pollRes.json();
        if (pollData.junction && isMounted) {
          setJunction((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(pollData.junction)) return prev;
            return pollData.junction;
          });
          setParticipants((prev) => {
            const serverParticipants = pollData.junction.participants || [];
            const updated = serverParticipants.map((sp: JunctionParticipant) => {
              if (sp.identity === guest.name) {
                return {
                  ...sp,
                  isMuted: isMutedRef.current,
                  isMutedByMod: isMutedByModRef.current,
                };
              }
              return sp;
            });
            if (JSON.stringify(prev) === JSON.stringify(updated)) return prev;
            return updated;
          });

          // Check if user was removed/kicked
          const amIParticipant = pollData.junction.participants.some(
            (p: JunctionParticipant) => p.identity === guest.name
          );
          if (!amIParticipant && !kickedNoticeRef.current) {
            setKickedNotice("You are no longer in this junction.");
          }

          // Check if user is mod-muted
          const myParticipant = pollData.junction.participants.find(
            (p: JunctionParticipant) => p.identity === guest.name
          );
          if (myParticipant?.isMutedByMod && !isMutedByModRef.current) {
            setIsMutedByMod(true);
            setIsMuted(true);
            if (typeof window !== "undefined") {
              sessionStorage.setItem(`junction_mod_muted_${junctionId}`, "true");
            }
          } else if (myParticipant && !myParticipant.isMutedByMod && isMutedByModRef.current) {
            setIsMutedByMod(false);
            setIsMuted(false);
            if (typeof window !== "undefined") {
              sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Polling error:", err);
        }
      } finally {
        if (isMounted) {
          pollTimeoutId = setTimeout(pollJunction, 6000);
        }
      }
    };

    // Realtime Postgres Changes Subscription for Instant Room State Updates
    const roomChannelId = `room_realtime_${junctionId}_${Math.random().toString(36).substring(2, 7)}`;
    const roomChannel = supabase
      .channel(roomChannelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "junction_participants",
          filter: `junction_id=eq.${junctionId}`,
        },
        () => {
          pollJunction();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "junctions",
          filter: `id=eq.${junctionId}`,
        },
        () => {
          pollJunction();
        }
      )
      .subscribe();

    loadAndJoinJunction().then((success) => {
      if (success && isMounted) {
        pollTimeoutId = setTimeout(pollJunction, 6000);
      }
    });

    return () => {
      isMounted = false;
      isRealUnmount.current = true;
      if (abortController) abortController.abort();
      clearTimeout(pollTimeoutId);
      supabase.removeChannel(roomChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [junctionId, guest.name, guest.avatar, guest.color, guest.id]);

  // Clean disconnect on tab close, back button or page hide
  useEffect(() => {
    const handleUnload = () => {
      try {
        const payload = JSON.stringify({ action: "leave", identity: guest.name });
        navigator.sendBeacon(`/api/junctions/${junctionId}`, new Blob([payload], { type: "application/json" }));
      } catch (e) {}
    };

    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [junctionId, guest.name]);

  // Sync local speaking state is no longer needed since LiveKit tracks speaking for all participants including local.

  // Handle Moderator Operations
  const handleModerateParticipant = async (
    targetIdentity: string,
    modAction: "mute" | "unmute" | "kick" | "ban" | "promote_mod" | "demote_mod"
  ) => {
    if (!isCurrentModerator) return;

    // Optimistically update participants state
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.identity === targetIdentity) {
          if (modAction === "mute") {
            return { ...p, isMuted: true, isMutedByMod: true };
          } else if (modAction === "unmute") {
            return { ...p, isMuted: false, isMutedByMod: false };
          }
        }
        return p;
      })
    );

    const res = await fetch(`/api/junctions/${junctionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "moderate",
        moderatorIdentity: guest.name,
        targetIdentity,
        modAction,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Moderation action failed");
    }

    if (data.junction) {
      setJunction(data.junction);
      setParticipants(data.junction.participants || []);
    }

    // Broadcast isolated moderation event
    liveKitPublishRef.current?.({
      type: "moderation_event",
      payload: { targetIdentity, action: modAction },
    });

    setActiveModMenuParticipant(null);
  };

  const handleReportParticipant = async (targetIdentity: string) => {
    setActiveModMenuParticipant(null);
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report",
          identity: guest.name,
          targetIdentity,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        console.error(data.error || "Failed to report user");
        alert(data.error || "Failed to report user");
      } else {
        alert("User has been reported.");
        if (data.banned) {
          liveKitPublishRef.current?.({
            type: "moderation_event",
            payload: { targetIdentity, action: "ban" },
          });
        }
      }
    } catch (err) {
      console.error("Report error:", err);
    }
  };


  const handleClearChat = () => {
    setChatMessages([]);
    liveKitPublishRef.current?.({ type: "clear_chat" });
  };

  const handleUpdateJunctionDetails = async (updates: { name?: string; maxParticipants?: number }) => {
    try {
      const res = await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          moderatorIdentity: guest.name,
          updates,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJunction(data.junction);
      if (liveKitPublishRef.current) {
        liveKitPublishRef.current({ type: "JUNCTION_UPDATE", updates });
      }
    } catch (err: any) {
      throw new Error(err.message);
    }
  };

  const handleToggleRoomLock = async (isLocked: boolean) => {
    if (!isCurrentModerator) return;
    const res = await fetch(`/api/junctions/${junctionId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        moderatorIdentity: guest.name,
        isLocked,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to toggle room lock");
    }
    if (data.junction) {
      setJunction(data.junction);
    }
    // Optionally we can broadcast a lock event if we want a global toast, but it's not strictly necessary.
  };

  const handleEndJunction = async () => {
    if (guest.name !== junction?.creatorId) return;

    await fetch(`/api/junctions/${junctionId}?creatorId=${encodeURIComponent(guest.name)}`, {
      method: "DELETE",
    });

    liveKitPublishRef.current?.({ type: "room_ended" });
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    router.push("/junctions");
  };

  // Send or Edit Chat Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    if (editingMessage) {
      const updatedText = inputMessage.trim();
      setChatMessages((prev) =>
        prev.map((m) => (m.id === editingMessage.id ? { ...m, text: updatedText, isEdited: true } : m))
      );
      liveKitPublishRef.current?.({
        type: "chat_edit",
        payload: { id: editingMessage.id, text: updatedText },
      });
      setEditingMessage(null);
      setInputMessage("");
      return;
    }

    const newMsg: RoomChatMessage = {
      id: "msg_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
      senderId: guest.id,
      senderName: guest.name,
      senderAvatar: guest.avatar || "zap",
      senderColor: guest.color || "#6366F1",
      text: inputMessage.trim(),
      timestamp: Date.now(),
      isModerator: isCurrentModerator,
      targetIdentity: privateRecipient !== "all" ? privateRecipient : undefined,
      replyTo: replyingToMessage ? {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        text: replyingToMessage.text.slice(0, 100),
      } : undefined,
    };

    setChatMessages((prev) => [...prev, newMsg]);
    liveKitPublishRef.current?.({ type: "chat_message", payload: newMsg });
    setInputMessage("");
    setReplyingToMessage(null);
  };

  // Delete message (available to ALL participants for community safety/moderation)
  const handleDeleteMessage = (msgId: string) => {
    setChatMessages((prev) => prev.filter((m) => m.id !== msgId));
    liveKitPublishRef.current?.({
      type: "chat_delete",
      payload: { id: msgId },
    });
    if (editingMessage?.id === msgId) {
      setEditingMessage(null);
      setInputMessage("");
    }
    if (replyingToMessage?.id === msgId) {
      setReplyingToMessage(null);
    }
  };

  // Send Floating Vector Icon Reaction
  const handleSendReaction = (iconName: string, label: string, color: string) => {
    const newReaction: VectorReaction = {
      id: "react_" + Date.now() + Math.random(),
      iconName,
      label,
      color,
      senderName: guest.name,
      x: Math.floor(Math.random() * 60) + 20,
    };

    setReactions((prev) => [...prev, newReaction]);
    liveKitPublishRef.current?.({ type: "reaction", payload: newReaction });

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
    }, 2800);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleLeave = async () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(`junction_mod_muted_${junctionId}`);
      sessionStorage.removeItem(`junction_role_${junctionId}`);
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    // Explicitly call leave before navigating away to ensure immediate DB removal
    try {
      await fetch(`/api/junctions/${junctionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave", identity: guest.name }),
      });
    } catch (e) {
      console.error("Failed to leave junction", e);
    }

    router.push("/junctions");
  };

  const handleVolumeChange = (identity: string, vol: number) => {
    const clamped = Math.min(100, Math.max(0, vol));
    setParticipantVolumes((prev) => ({ ...prev, [identity]: clamped }));
  };

  const handleToggleMic = () => {
    if (isMutedByMod) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    // Optimistically update local participant in participants array
    setParticipants((prev) =>
      prev.map((p) =>
        p.identity === guest.name ? { ...p, isMuted: nextMuted } : p
      )
    );

    // Broadcast mute change immediately over LiveKit data channel
    liveKitPublishRef.current?.({
      type: "participant_mute_change",
      payload: { identity: guest.name, isMuted: nextMuted },
    });

    // Persist to database in background
    fetch(`/api/junctions/${junctionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_participant",
        identity: guest.name,
        updates: { isMuted: nextMuted },
      }),
    }).catch((err) => console.error("Failed to sync mute state to DB", err));
  };

  if (isLoading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background px-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center animate-pulse shadow-md mb-3">
          <Radio className="w-6 h-6 sm:w-7 sm:h-7" />
        </div>
        <h2 className="text-lg sm:text-xl font-bold text-white mb-1">Connecting to Junction...</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Allocating encrypted secure audio stream</p>
      </div>
    );
  }

  // Kicked / Banned / Ended Modal
  if (kickedNotice) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-6 rounded-3xl bg-card max-w-md w-full text-center border border-rose-500/40 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
            <Shield size={28} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Junction Notice</h2>
          <p className="text-xs text-rose-300 mb-6">{kickedNotice}</p>
          <button
            onClick={() => {
              if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
              router.push("/junctions");
            }}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shadow-lg"
          >
            Return to Junctions Hub
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-background">
        <div className="p-6 rounded-2xl bg-card max-w-md w-full text-center border border-rose-500/30">
          <div className="w-12 h-12 rounded-full bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto mb-3">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-white mb-1">Cannot Join Junction</h2>
          <p className="text-xs text-rose-300 mb-6">{error}</p>
          <button
            onClick={() => router.push("/junctions")}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all cursor-pointer"
          >
            Back to Junctions Hub
          </button>
        </div>
      </div>
    );
  }

  const SEAT_SLOTS = Array.from({ length: junction?.maxParticipants || 7 });

  return (
    <div className="relative h-[calc(100vh-3.5rem)] sm:h-[calc(100vh-4rem)] flex flex-col lg:flex-row overflow-hidden bg-background">
      {/* LiveKit Hidden Audio Manager with Auto Noise Suppression & Echo Cancellation */}
      {liveKitToken && liveKitUrl && (
        <LiveKitRoom
          token={liveKitToken}
          serverUrl={liveKitUrl}
          connect={true}
          audio={!isMuted && !isMutedByMod}
          video={false}
          options={{
            audioCaptureDefaults: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
            },
          }}
          style={{ display: 'contents' }}
        >
          <RoomConnectionOverlay />
          <LiveKitDataSync onMessage={onRoomMessage} publishRef={liveKitPublishRef} onSpeakingChange={setActiveSpeakers} isMuted={isMuted} isMutedByMod={isMutedByMod} isDeafened={isDeafened} />
          {participants
            .filter((p) => p.identity !== guest.name)
            .map((p) => (
              <ParticipantAudio
                key={p.identity}
                identity={p.identity}
                volume={participantVolumes[p.identity] ?? 100}
                isDeafened={isDeafened}
              />
            ))}
        </LiveKitRoom>
      )}

      {/* Mod Mute Alert Banner - Floating Centered Toast Notification */}
      {isMutedByMod && (
        <div className="fixed top-16 sm:top-20 inset-x-4 max-w-md mx-auto bg-rose-950/95 border border-rose-500/50 text-rose-200 px-4 py-2.5 rounded-2xl text-center text-xs font-semibold flex items-center justify-center gap-2 shadow-2xl backdrop-blur-xl z-50 animate-fadeIn pointer-events-auto">
          <AlertCircle size={16} className="text-rose-400 shrink-0" />
          <span>You have been force-muted by the Junction Moderator.</span>
        </div>
      )}

      {/* Floating Emoji Reactions Overlay */}
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        {reactions.map((r) => {
          const emoji = EMOJI_REACTIONS.find((er) => er.id === r.iconName)?.emoji || "❤️";

          return (
            <div
              key={r.id}
              style={{ left: `${r.x}%` }}
              className="absolute bottom-28 transform -translate-x-1/2 flex flex-col items-center animate-floatUp drop-shadow-2xl"
            >
              <div className="text-4xl sm:text-5xl drop-shadow-lg">
                {emoji}
              </div>
              <span
                className="text-[10px] sm:text-xs font-bold text-white px-2.5 py-0.5 rounded-full mt-1 bg-black/60 backdrop-blur-md"
                style={{ color: r.color }}
              >
                {r.senderName}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main Left Content Area */}
      <div className={`flex-1 flex flex-col pb-24 lg:pb-0 overflow-y-auto overflow-x-hidden transition-all duration-300`}>
        {/* Top Room Banner - Minimalist */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="flex items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="min-w-0 flex flex-col items-start pr-2">
            {/* Yapclub Brand Logo / Back Button */}
            <button
              onClick={() => router.push('/junctions')}
              className="flex items-center gap-1 mb-1 hover:opacity-80 transition-opacity cursor-pointer group"
            >
              <Radio size={12} className="text-indigo-500 group-hover:text-indigo-400 transition-colors" />
              <span className="text-[10px] font-black tracking-widest text-slate-400 group-hover:text-white transition-colors uppercase">
                yap<span className="text-indigo-500 group-hover:text-indigo-400">club</span>
              </span>
            </button>
            <h1 className="text-base sm:text-lg font-bold text-white truncate w-full drop-shadow-md leading-tight">
              {junction?.name || "Junction Room"}
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate w-full mt-0.5 drop-shadow-sm">
              {junction?.description || "Voice Hangout"}
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-1.5 sm:gap-2 shrink-0 pt-1 sm:pt-0 max-w-[140px] sm:max-w-none">
            {/* Moderator Deck Trigger */}
            {isCurrentModerator && (
              <button
                onClick={() => setIsModDeckOpen(true)}
                className="flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 border border-amber-500/30 shrink-0"
                title="Mod Deck"
              >
                <Shield size={14} className="sm:w-3.5 sm:h-3.5 shrink-0" />
                <span className="hidden sm:inline ml-1.5">Mod Deck</span>
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full sm:rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-[10px] sm:text-xs font-semibold text-white shadow-sm shrink-0">
              <Users size={12} className="opacity-80 shrink-0" />
              <span>{participants.length}/{junction?.maxParticipants || 7}</span>
            </div>

            <button
              onClick={handleCopyLink}
              className="flex items-center justify-center p-2 sm:px-3 sm:py-1.5 rounded-full sm:rounded-xl bg-black/40 backdrop-blur-md border border-white/10 hover:bg-white/10 text-white transition-colors cursor-pointer shadow-sm shrink-0"
              title="Copy Room Link"
            >
              <Share2 size={13} className="sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline ml-1.5 text-xs font-medium">{isCopied ? "Copied" : "Invite"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Seat Stage Grid */}
      <div className={`w-full mx-auto px-3 sm:px-6 my-auto py-3 sm:py-6 ${
        SEAT_SLOTS.length <= 2 ? "max-w-3xl" : 
        SEAT_SLOTS.length <= 4 ? "max-w-4xl" : 
        SEAT_SLOTS.length <= 6 ? "max-w-5xl" : 
        "max-w-6xl"
      }`}>
        <div className={`grid gap-3 sm:gap-5 justify-center mx-auto ${
          SEAT_SLOTS.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : 
          SEAT_SLOTS.length <= 4 ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-2" : 
          SEAT_SLOTS.length <= 6 ? "grid-cols-2 sm:grid-cols-3" : 
          "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
        }`}>
          {SEAT_SLOTS.map((_, index) => {
            const participant = participants[index];
            const isLocal = participant?.identity === guest.name;
            const isParticipantMod = participant?.role === "moderator";
            const volume = participant ? participantVolumes[participant.identity] ?? 100 : 100;
            const isMenuOpen = activeModMenuParticipant === participant?.identity;

            if (participant) {
              const speaking = activeSpeakers.includes(participant.identity);
              const muted = isLocal ? (isMuted || isMutedByMod) : (participant.isMuted || participant.isMutedByMod);

              return (
                <div
                  key={participant.id || participant.identity || index}
                  style={!isParticipantMod ? { borderColor: `${participant.color}40`, backgroundColor: `${participant.color}08` } : {}}
                  className={`relative p-3 sm:p-5 rounded-[1.5rem] flex flex-col justify-between items-center text-center transition-all duration-300 ${
                    SEAT_SLOTS.length <= 2 ? "min-h-[180px] sm:min-h-[300px]" :
                    SEAT_SLOTS.length <= 4 ? "min-h-[160px] sm:min-h-[260px]" :
                    "min-h-[140px] sm:min-h-[215px]"
                  } ${
                    isParticipantMod
                      ? "border border-amber-500/30 bg-[#12131A]/80 backdrop-blur-md"
                      : "border border-white/5 bg-[#12131A]/40 backdrop-blur-md"
                  }`}
                >
                  {/* Top Card Header */}
                  <div className="w-full flex items-start sm:items-center justify-between gap-1">
                    <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] sm:text-[10px] font-mono font-semibold text-slate-400 shrink-0">
                      SEAT #{index + 1}
                    </span>

                    <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                      {isParticipantMod && (
                        <span className="flex items-center justify-center p-0.5 sm:p-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm shrink-0" title="Moderator">
                          <Crown size={10} className="fill-amber-400 sm:w-3 sm:h-3" />
                        </span>
                      )}
                      {isLocal && (
                        <span className="px-1 sm:px-1.5 py-0.5 rounded-md bg-indigo-600/25 text-indigo-300 text-[8px] sm:text-[9px] font-bold border border-indigo-500/40 shrink-0">
                          YOU
                        </span>
                      )}

                      {/* Action Trigger for Participants */}
                      {!isLocal && (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveModMenuParticipant(isMenuOpen ? null : participant.identity);
                            }}
                            className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-white hover:bg-slate-200 dark:bg-slate-800 transition-colors cursor-pointer"
                            title="Participant Actions"
                          >
                            <MoreVertical size={13} />
                          </button>

                          {/* Action Dropdown */}
                          {isMenuOpen && (
                            <div className="absolute top-6 right-0 w-36 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 shadow-2xl p-1 z-30 flex flex-col gap-0.5 text-left animate-fadeIn">
                              {isCurrentModerator && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleModerateParticipant(
                                        participant.identity,
                                        participant.isMutedByMod ? "unmute" : "mute"
                                      )
                                    }
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    {participant.isMutedByMod ? <Mic size={12} /> : <MicOff size={12} className="text-rose-400" />}
                                    <span>{participant.isMutedByMod ? "Unmute" : "Force Mute"}</span>
                                  </button>
                                  <button
                                    onClick={() => handleModerateParticipant(participant.identity, "kick")}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                  >
                                    <PhoneOff size={12} />
                                    <span>Kick User</span>
                                  </button>
                                  {participant.role === "moderator" ? (
                                    <button
                                      onClick={() => handleModerateParticipant(participant.identity, "demote_mod")}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-400 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <Shield size={12} />
                                      <span>Remove Mod</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleModerateParticipant(participant.identity, "promote_mod")}
                                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-amber-400 hover:bg-amber-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    >
                                      <Crown size={12} />
                                      <span>Make Co-Mod</span>
                                    </button>
                                  )}
                                </>
                              )}
                              <button
                                onClick={() => handleReportParticipant(participant.identity)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-950/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                <AlertCircle size={12} />
                                <span>Report User</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Center Vector Avatar */}
                  <div 
                    className="relative my-2 cursor-pointer transition-transform hover:scale-105 active:scale-95"
                    onClick={() => setPreviewParticipant(participant)}
                  >
                    <UserAvatar
                      avatar={participant.avatar}
                      color={participant.color}
                      size="lg"
                      isSpeaking={speaking}
                    />

                    {/* Mute Badge Overlay */}
                    {muted && (
                      <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-600 border-2 border-[#111622] text-white shadow-sm">
                        <MicOff size={11} />
                      </div>
                    )}
                  </div>

                  {/* Name & Audio Wave Status */}
                  <div className="w-full flex flex-col items-center gap-1">
                    <div className="font-bold text-xs sm:text-sm text-white truncate max-w-[110px] sm:max-w-[140px]">
                      {participant.name}
                    </div>

                    {/* Fixed Height Soundwave Bar or Status */}
                    <div className="h-5 flex items-center justify-center">
                      {speaking ? (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40">
                          <div className="flex items-center gap-0.5 h-3">
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-1" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-2" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-3" />
                            <span className="w-0.5 bg-emerald-400 rounded-full soundwave-bar-4" />
                          </div>
                          <span className="text-[10px] text-emerald-400 font-semibold leading-none">
                            Speaking
                          </span>
                        </div>
                      ) : participant.isMutedByMod ? (
                        <span className="text-[10px] text-rose-400 font-semibold">Mod Muted</span>
                      ) : muted ? (
                        <span className="text-[10px] text-rose-400/80 font-medium">Muted</span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-medium">Listening</span>
                      )}
                    </div>

                    {/* Volume Slider for Remote Participants */}
                    {!isLocal && (
                      <div className="w-full mt-1 pt-1.5 border-t border-slate-200 dark:border-slate-800/80 flex items-center gap-1.5">
                        <Volume1 size={11} className="text-slate-500" />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.min(100, Math.max(0, volume))}
                          onChange={(e) =>
                            handleVolumeChange(participant.identity, Number(e.target.value))
                          }
                          className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                          title={`Volume for ${participant.name}`}
                        />
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono w-5 text-right">
                          {Math.min(100, Math.max(0, volume))}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }

            // Vacant Seat Slot
            return (
              <div
                key={`vacant-${index}`}
                onClick={handleCopyLink}
                className={`relative p-3 sm:p-5 rounded-[1.5rem] border border-dashed border-white/20 hover:border-indigo-500/50 bg-white/5 hover:bg-white/10 backdrop-blur-md flex flex-col justify-between items-center text-center group cursor-pointer transition-all active:scale-95 ${
                  SEAT_SLOTS.length <= 2 ? "min-h-[180px] sm:min-h-[300px]" :
                  SEAT_SLOTS.length <= 4 ? "min-h-[160px] sm:min-h-[260px]" :
                  "min-h-[140px] sm:min-h-[215px]"
                }`}
              >
                {/* Top Header */}
                <div className="w-full flex items-center justify-between">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] sm:text-[10px] font-mono font-semibold text-slate-400">
                    SEAT #{index + 1}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-slate-500 font-medium uppercase">
                    Vacant
                  </span>
                </div>

                {/* Center Icon */}
                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl border border-dashed border-white/20 group-hover:border-indigo-500/50 group-hover:bg-indigo-600/10 flex items-center justify-center text-slate-500 group-hover:text-indigo-400 transition-all my-1 sm:my-2">
                  <UserPlus size={18} className="sm:w-5 sm:h-5" />
                </div>

                {/* Bottom Prompt */}
                <div className="flex flex-col items-center">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-300 transition-colors">
                    Open Seat
                  </span>
                  <span className="text-[9px] text-slate-600 group-hover:text-slate-500 dark:text-slate-400 transition-colors">
                    Tap to invite
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Slide-out In-Room Whisper Chat Drawer / Right Sidebar */}
      <div 
        className={`
          fixed inset-x-0 bottom-20 top-14 sm:inset-x-auto sm:right-0 sm:top-16 sm:bottom-24 z-40 bg-[#0B0C12]/95 backdrop-blur-3xl border-t sm:border-t-0 sm:border-l border-white/[0.08] flex flex-col shadow-2xl transition-all duration-300
          ${isChatOpen ? "translate-y-0 translate-x-0 opacity-100" : "translate-y-[150%] sm:translate-y-0 sm:translate-x-full opacity-0 pointer-events-none"}
          lg:relative lg:inset-auto lg:z-10 lg:w-[410px] xl:w-[450px] lg:bg-[#0B0C12]/95 lg:border-l lg:border-white/[0.08] lg:shadow-2xl lg:transform-none lg:transition-none lg:opacity-100 lg:pointer-events-auto
          ${!isChatOpen && 'lg:hidden'}
        `}
      >
        {/* Top Header & Tab Switcher */}
        <div className="p-3 sm:p-4 border-b border-white/[0.08] bg-black/25 flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-between">
            {/* Tab Pill Buttons */}
            <div className="flex items-center gap-1 p-1 bg-white/[0.05] border border-white/10 rounded-2xl">
              <button
                type="button"
                onClick={() => setRightPanelTab("chat")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  rightPanelTab === "chat"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <MessageSquare size={13} />
                <span>Chat</span>
                {chatMessages.length > 0 && rightPanelTab !== "chat" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRightPanelTab("junctions");
                  fetchOtherJunctions();
                }}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  rightPanelTab === "junctions"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Compass size={13} />
                <span><span className="hidden xs:inline">Other </span>Junctions</span>
                {otherJunctions.some((j) => j.currentCount > 0) && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {otherJunctions.filter((j) => j.currentCount > 0).length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1">
              {rightPanelTab === "chat" && chatMessages.length > 1 && (
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  title="Clear chat"
                >
                  Clear
                </button>
              )}
              {rightPanelTab === "junctions" && (
                <button
                  type="button"
                  onClick={fetchOtherJunctions}
                  className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Refresh junctions"
                >
                  <RotateCw size={14} className={isLoadingJunctions ? "animate-spin text-indigo-400" : ""} />
                </button>
              )}
              <button
                onClick={() => setIsChatOpen(false)}
                className="w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
                title="Close panel"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Subheader info depending on tab */}
          {rightPanelTab === "chat" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {/* Private Message Recipient Selector - Custom Styled Glassmorphic Dropdown */}
                <div className="relative flex-1" ref={recipientMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsRecipientMenuOpen(!isRecipientMenuOpen)}
                    className="w-full flex items-center justify-between gap-2 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 rounded-2xl px-3.5 py-2 transition-all cursor-pointer shadow-inner active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0">
                        To:
                      </span>
                      <span className="text-xs font-semibold text-white truncate">
                        {privateRecipient === "all" ? "Everyone in Room" : privateRecipient}
                      </span>
                    </div>
                    <ChevronDown 
                      size={14} 
                      className={`text-slate-400 shrink-0 transition-transform duration-200 ${isRecipientMenuOpen ? 'rotate-180 text-white' : ''}`} 
                    />
                  </button>

                  {/* Custom Dropdown Menu with Glassmorphic Styling */}
                  {isRecipientMenuOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-[#141622]/95 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-2xl p-1.5 z-50 flex flex-col gap-0.5 animate-in fade-in zoom-in-95 duration-150">
                      <button
                        type="button"
                        onClick={() => {
                          setPrivateRecipient("all");
                          setIsRecipientMenuOpen(false);
                        }}
                        className={`w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                          privateRecipient === "all"
                            ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                            : "text-slate-300 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        <span>Everyone in Room</span>
                        {privateRecipient === "all" && <Check size={14} className="text-indigo-400" />}
                      </button>

                      {participants
                        .filter(p => p.identity !== guest.name)
                        .map(p => {
                          const isSelected = privateRecipient === p.identity;
                          return (
                            <button
                              key={p.identity}
                              type="button"
                              onClick={() => {
                                setPrivateRecipient(p.identity);
                                setIsRecipientMenuOpen(false);
                              }}
                              className={`w-full px-3 py-2 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/30"
                                  : "text-slate-300 hover:text-white hover:bg-white/5"
                              }`}
                            >
                              <span className="truncate">{p.name}</span>
                              {isSelected && <Check size={14} className="text-indigo-400" />}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Feature: Show msgs / Not show msgs Toggle */}
                <button
                  type="button"
                  onClick={toggleShowInRoomPopups}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-medium transition-all cursor-pointer shrink-0 active:scale-95 ${
                    showInRoomPopups
                      ? "bg-white/10 text-white border-white/20 hover:bg-white/15"
                      : "bg-transparent text-slate-400 border-white/10 hover:text-slate-200 hover:bg-white/5"
                  }`}
                  title={
                    showInRoomPopups
                      ? "Side pop-up messages are ON (Click to set Not show msgs)"
                      : "Side pop-up messages are OFF (Click to set Show msgs)"
                  }
                >
                  {showInRoomPopups ? (
                    <>
                      <Eye size={13} className="text-slate-200" />
                      <span>Show msgs</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
                    </>
                  ) : (
                    <>
                      <EyeOff size={13} className="text-slate-500" />
                      <span>Not show msgs</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    </>
                  )}
                </button>
              </div>

              {/* Status helper banner */}
              <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
                <span className="truncate">
                  {showInRoomPopups
                    ? "Pop-up previews active when chat is closed"
                    : "Pop-up previews hidden"}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Shift directly between active junctions</span>
              <span className="text-indigo-300 font-semibold">{otherJunctions.length} available</span>
            </p>
          )}
        </div>

        {/* TAB 1: WHISPER CHAT */}
        {rightPanelTab === "chat" && (
          <>
            {/* Chat Messages Log */}
        <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3.5 scroll-smooth flex flex-col">
          {chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center m-auto text-center py-8 px-4 select-none animate-in fade-in zoom-in-95 duration-200">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-500/5">
                <MessageSquare size={22} />
              </div>
              <span className="text-sm font-semibold text-slate-200">Start your conversation</span>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                Send a message to the room or whisper privately to any user.
              </p>
            </div>
          ) : chatMessages.map((msg) => {
            // System Announcement Card
            if (msg.senderId === "system") {
              return (
                <div key={msg.id} className="w-full flex justify-center py-2 px-1">
                  <div className="max-w-[95%] px-3.5 py-2.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-xs text-center flex items-center gap-2.5 shadow-sm">
                    <Sparkles size={14} className="text-indigo-400 shrink-0" />
                    <p className="leading-relaxed font-medium">{msg.text}</p>
                  </div>
                </div>
              );
            }

            const isMe = msg.senderName === guest.name;
            const isPrivate = msg.targetIdentity !== undefined;

            return (
              <div key={msg.id} className={`group/msg relative flex flex-col ${isMe ? 'items-end' : 'items-start'} py-1`}>
                {/* Sender Header for Incoming Messages */}
                {!isMe && (
                  <div className="flex items-center gap-1.5 mb-1 pl-1">
                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/10 bg-slate-800">
                      <UserAvatar avatar={msg.senderAvatar} size="sm" className="!w-full !h-full" />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-300">{msg.senderName}</span>
                    {msg.isModerator && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        <Crown size={9} /> Mod
                      </span>
                    )}
                    {isPrivate && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        <Lock size={9} /> Whisper
                      </span>
                    )}
                  </div>
                )}

                {/* Header for own whisper */}
                {isMe && isPrivate && (
                  <div className="flex items-center gap-1 mb-1 pr-1 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                    <Lock size={10} /> Whisper to {msg.targetIdentity}
                  </div>
                )}

                {/* Quoted Message Preview if Reply */}
                {msg.replyTo && (
                  <div className={`mb-1 px-3 py-1.5 rounded-xl border-l-2 max-w-[85%] text-xs flex flex-col ${
                    isMe 
                      ? 'bg-indigo-950/40 border-indigo-400 text-indigo-200' 
                      : 'bg-black/30 border-purple-400 text-purple-200'
                  }`}>
                    <span className="text-[10px] font-bold opacity-80 flex items-center gap-1">
                      <Reply size={10} /> Replying to {msg.replyTo.senderName}
                    </span>
                    <span className="truncate opacity-75 italic text-[11px]">
                      "{msg.replyTo.text}"
                    </span>
                  </div>
                )}
                
                {/* Bubble Container with Non-Overlapping Action Toolbar Beside It */}
                <div className="relative group/bubble max-w-[85%] flex items-center">
                  {/* Action Bar for isMe: Placed to the LEFT of the bubble in open row space */}
                  {isMe && (
                    <div className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-150 flex items-center gap-1 bg-[#141622]/95 border border-white/10 rounded-full px-1.5 py-1 shadow-2xl backdrop-blur-xl z-20 pointer-events-none group-hover/msg:pointer-events-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToMessage(msg);
                          setEditingMessage(null);
                        }}
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                        title="Reply"
                        aria-label="Reply"
                      >
                        <Reply size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingMessage(msg);
                          setInputMessage(msg.text);
                          setReplyingToMessage(null);
                        }}
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-amber-300 hover:bg-amber-400/15 flex items-center justify-center transition-colors cursor-pointer"
                        title="Edit message"
                        aria-label="Edit"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-400/15 flex items-center justify-center transition-colors cursor-pointer"
                        title="Delete message"
                        aria-label="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={`
                    px-4 py-2.5 text-[13.5px] leading-relaxed shadow-lg backdrop-blur-md break-words transition-all
                    ${isMe 
                      ? (isPrivate 
                          ? 'rounded-2xl rounded-tr-xs text-white bg-gradient-to-br from-purple-600 to-fuchsia-600 shadow-purple-600/25' 
                          : 'rounded-2xl rounded-tr-xs text-white bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-indigo-600/25')
                      : (isPrivate 
                          ? 'rounded-2xl rounded-tl-xs border border-purple-500/30 bg-[#251532]/90 text-purple-100 shadow-purple-950/20' 
                          : 'rounded-2xl rounded-tl-xs border border-white/[0.08] bg-[#181924]/90 text-slate-100 shadow-black/20')
                    }
                  `}>
                    <span>{msg.text}</span>
                    {msg.isEdited && (
                      <span className="text-[10px] opacity-70 ml-1.5 italic select-none">
                        (edited)
                      </span>
                    )}
                  </div>

                  {/* Action Bar for other users: Placed to the RIGHT of the bubble in open row space */}
                  {!isMe && (
                    <div className="absolute left-full ml-2.5 top-1/2 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-all duration-150 flex items-center gap-1 bg-[#141622]/95 border border-white/10 rounded-full px-1.5 py-1 shadow-2xl backdrop-blur-xl z-20 pointer-events-none group-hover/msg:pointer-events-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingToMessage(msg);
                          setEditingMessage(null);
                        }}
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/15 flex items-center justify-center transition-colors cursor-pointer"
                        title="Reply"
                        aria-label="Reply"
                      >
                        <Reply size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="w-6 h-6 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-400/15 flex items-center justify-center transition-colors cursor-pointer"
                        title="Delete message"
                        aria-label="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <span className="text-[9.5px] text-slate-500 mt-1 px-1 select-none">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          })}
          <div ref={chatMessagesEndRef} />
        </div>

        {/* Reply Context Banner */}
        {replyingToMessage && (
          <div className="px-3.5 py-2 bg-indigo-950/70 border-t border-indigo-500/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                <Reply size={11} />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-indigo-300 font-semibold truncate">
                  Replying to {replyingToMessage.senderName}:
                </span>
                <span className="text-slate-400 truncate italic text-[11px]">
                  "{replyingToMessage.text}"
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingToMessage(null)}
              className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
              title="Cancel reply"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Edit Context Banner */}
        {editingMessage && (
          <div className="px-3.5 py-2 bg-amber-950/70 border-t border-amber-500/30 flex items-center justify-between gap-2 shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center gap-2 min-w-0 text-xs">
              <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Edit2 size={11} />
              </div>
              <span className="text-amber-300 font-semibold truncate">
                Editing your message (Enter to save, Esc to cancel)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputMessage("");
              }}
              className="w-6 h-6 rounded-full text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer"
              title="Cancel edit"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Chat Input Area */}
        <form onSubmit={handleSendMessage} className="p-3 sm:p-4 border-t border-white/[0.08] bg-[#0E0F17]/90 backdrop-blur-xl shrink-0">
          <div className="relative flex items-center bg-white/[0.04] border border-white/10 rounded-2xl p-1 focus-within:border-indigo-500/60 focus-within:bg-white/[0.07] focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all shadow-inner">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (editingMessage) {
                    setEditingMessage(null);
                    setInputMessage("");
                  } else if (replyingToMessage) {
                    setReplyingToMessage(null);
                  }
                }
              }}
              placeholder={
                editingMessage 
                  ? "Edit message..." 
                  : privateRecipient !== "all" 
                    ? `Whisper to ${privateRecipient}...` 
                    : "Send a message..."
              }
              maxLength={200}
              className="flex-1 bg-transparent px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim()}
              className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:bg-white/5 disabled:text-slate-600 text-white transition-all shadow-md shadow-indigo-600/20 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Send message"
            >
              <Send size={14} className={inputMessage.trim() ? "translate-x-0.5 -translate-y-0.5 transition-transform" : ""} />
            </button>
          </div>
        </form>
          </>
        )}

        {/* TAB 2: OTHER JUNCTIONS EXPLORER */}
        {rightPanelTab === "junctions" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Search Input */}
            <div className="p-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={junctionSearchQuery}
                  onChange={(e) => setJunctionSearchQuery(e.target.value)}
                  placeholder="Search live junctions..."
                  className="w-full pl-8 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
              </div>
            </div>

            {/* Junctions List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {isLoadingJunctions && otherJunctions.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-xs">
                  <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
                  Scanning active voice junctions...
                </div>
              ) : otherJunctions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-52 text-center px-4 text-slate-500">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-2.5">
                    <Radio size={22} />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-300">No Other Public Junctions</h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-[200px]">
                    You are currently in the only active public voice junction.
                  </p>
                </div>
              ) : (
                otherJunctions
                  .filter((j) =>
                    j.name.toLowerCase().includes(junctionSearchQuery.toLowerCase()) ||
                    j.category.toLowerCase().includes(junctionSearchQuery.toLowerCase()) ||
                    (j.tags && j.tags.some((t) => t.toLowerCase().includes(junctionSearchQuery.toLowerCase())))
                  )
                  .map((j) => {
                    const jCount = j.participants?.length ?? j.currentCount;
                    const maxCap = j.maxParticipants || 7;
                    const isOccupied = jCount > 0;
                    const isSwitching = isSwitchingRoomId === j.id;

                    return (
                      <div
                        key={j.id}
                        className={`p-3.5 rounded-2xl border transition-all duration-200 ${
                          isOccupied
                            ? "bg-white/[0.04] hover:bg-white/[0.07] border-white/10 hover:border-indigo-500/30"
                            : "bg-white/[0.02] border-white/5 opacity-80 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate max-w-[190px]">
                              {j.name}
                            </h4>
                            <span className="text-[10px] font-medium text-slate-400 capitalize">
                              {j.category}
                            </span>
                          </div>

                          {/* Live Occupancy Status Badge */}
                          <div
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              isOccupied
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-white/5 text-slate-400 border border-white/10"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOccupied ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-slate-500"
                              }`}
                            />
                            <span>
                              {jCount}/{maxCap} {isOccupied ? "live" : "empty"}
                            </span>
                          </div>
                        </div>

                        {/* Avatars Preview if participants exist */}
                        {j.participants && j.participants.length > 0 && (
                          <div className="flex items-center gap-1 mb-2.5">
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {j.participants.slice(0, 4).map((p, idx) => (
                                <div
                                  key={p.id || idx}
                                  className="w-5 h-5 rounded-full border border-black/40 overflow-hidden bg-slate-800"
                                  title={p.name}
                                >
                                  <UserAvatar avatar={p.avatar} color={p.color} size="sm" className="!w-full !h-full" />
                                </div>
                              ))}
                            </div>
                            <span className="text-[10px] text-slate-400 ml-1.5">
                              {j.participants[0]?.name}
                              {j.participants.length > 1 && ` +${j.participants.length - 1} more`}
                            </span>
                          </div>
                        )}

                        {/* Tags */}
                        {j.tags && j.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {j.tags.slice(0, 3).map((tag, tIdx) => (
                              <span
                                key={tIdx}
                                className="px-1.5 py-0.2 rounded-md bg-white/5 text-[9px] text-slate-400 font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Switch Room Action Button */}
                        <button
                          type="button"
                          disabled={isSwitching || !!isSwitchingRoomId}
                          onClick={() => handleShiftJunction(j.id, j.name)}
                          className="w-full py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-98 disabled:bg-indigo-900/50 disabled:text-indigo-300/50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all cursor-pointer disabled:cursor-wait"
                        >
                          {isSwitching ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Switching...</span>
                            </>
                          ) : (
                            <>
                              <LogIn size={13} />
                              <span>Switch to this Junction</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Audio Dock Controls */}
      <div className="fixed bottom-3 sm:bottom-4 inset-x-0 z-50 flex justify-center px-2 pointer-events-none">
        <div className="pointer-events-auto p-1.5 sm:p-2 rounded-2xl bg-[#12131A]/90 backdrop-blur-2xl border border-white/10 shadow-2xl flex items-center gap-1 sm:gap-2.5 max-w-full">
          {/* Mute / Unmute Mic */}
          <button
            onClick={handleToggleMic}
            disabled={isMutedByMod}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs transition-all shadow-sm cursor-pointer active:scale-95 ${isMutedByMod
                ? "bg-rose-950 text-rose-400 border border-rose-800 cursor-not-allowed"
                : isMuted
                  ? "bg-rose-600 hover:bg-rose-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            title={isMutedByMod ? "Muted by Moderator" : isMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMuted || isMutedByMod ? <MicOff size={15} /> : <Mic size={15} />}
            <span className="hidden xs:inline">
              {isMutedByMod ? "Mod Muted" : isMuted ? "Unmute" : "Mute"}
            </span>
          </button>

          {/* Deafen / Listen */}
          <button
            onClick={() => setIsDeafened(!isDeafened)}
            className={`p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${isDeafened
                ? "bg-rose-600 text-white border border-rose-500"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
              }`}
            title={isDeafened ? "Undeafen Audio" : "Deafen Audio"}
          >
            {isDeafened ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Reactions */}
          <div className="relative">
            <button
              onClick={() => setIsReactionsOpen(!isReactionsOpen)}
              className={`p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${isReactionsOpen
                  ? "bg-indigo-600 text-white border border-indigo-500"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
                }`}
              title="Reactions"
            >
              <Smile size={15} />
            </button>

            {isReactionsOpen && (
              <div className="absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 p-1.5 sm:p-2 rounded-full bg-[#12131A]/90 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-0.5 sm:gap-1.5 animate-fadeIn max-w-[90vw] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {EMOJI_REACTIONS.map((r) => {
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSendReaction(r.id, r.label, r.color)}
                      className="p-1 sm:p-1.5 text-[22px] sm:text-2xl hover:scale-125 transition-transform flex items-center justify-center cursor-pointer active:scale-90 shrink-0"
                      title={r.label}
                    >
                      {r.emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat Toggle Button */}
          <button
            onClick={() => {
              if (isChatOpen && rightPanelTab === "chat") {
                setIsChatOpen(false);
              } else {
                setRightPanelTab("chat");
                setIsChatOpen(true);
                setInRoomPopups([]);
              }
            }}
            className={`relative p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${
              isChatOpen && rightPanelTab === "chat"
                ? "bg-indigo-600 text-white border border-indigo-500"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
            }`}
            title={showInRoomPopups ? "Room Chat (Show msgs active)" : "Room Chat (Not show msgs)"}
          >
            <MessageSquare size={15} />
            {chatMessages.length > 0 && (!isChatOpen || rightPanelTab !== "chat") && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
            )}
          </button>

          {/* Other Junctions Explorer Toggle Button */}
          <button
            onClick={() => {
              if (isChatOpen && rightPanelTab === "junctions") {
                setIsChatOpen(false);
              } else {
                setRightPanelTab("junctions");
                setIsChatOpen(true);
                fetchOtherJunctions();
              }
            }}
            className={`relative p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${
              isChatOpen && rightPanelTab === "junctions"
                ? "bg-indigo-600 text-white border border-indigo-500"
                : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
            }`}
            title="Explore Other Junctions"
          >
            <Compass size={15} />
            {otherJunctions.some((j) => j.currentCount > 0) && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            )}
          </button>

          {/* Inside Direct Messages Toggle Button (Only visible to logged-in users with minimalist dock styling) */}
          {isRegistered && user && (
            <button
              onClick={() => setIsDirectMessengerOpen(!isDirectMessengerOpen)}
              className={`relative p-2 sm:p-2.5 rounded-xl text-xs transition-colors cursor-pointer active:scale-95 ${
                isDirectMessengerOpen
                  ? "bg-indigo-600 text-white border border-indigo-500 shadow-md shadow-indigo-600/20"
                  : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
              }`}
              title="Direct Messages"
            >
              <MessageCircle size={15} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 px-1 min-w-[16px] h-4 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center border border-[#12131A] shadow-md animate-pulse">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          )}

          <div className="h-5 w-px bg-white/10 mx-0.5" />

          {/* Disconnect & Leave Junction Button */}
          <button
            onClick={handleLeave}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer active:scale-95"
            title="Leave Junction"
          >
            <PhoneOff size={14} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>

      {/* Moderator Control Modal */}
      {junction && isCurrentModerator && (
        <ModeratorControlModal
          isOpen={isModDeckOpen}
          onClose={() => setIsModDeckOpen(false)}
          junction={junction}
          participants={participants}
          currentModerator={guest.name}
          onModerateParticipant={handleModerateParticipant}
          onClearChat={handleClearChat}
          onEndJunction={handleEndJunction}
          onToggleRoomLock={handleToggleRoomLock}
          onUpdateJunctionDetails={handleUpdateJunctionDetails}
        />
      )}

      {/* Profile Preview Popover */}
      <ProfilePreviewModal 
        isOpen={previewParticipant !== null}
        onClose={() => setPreviewParticipant(null)}
        participant={previewParticipant}
      />

      {/* Floating Instagram-Style Direct Messenger for Logged-In Users */}
      <InRoomMessenger isOpen={isDirectMessengerOpen} onClose={() => setIsDirectMessengerOpen(false)} />

      {/* Junction Switching Transition Overlay */}
      {isSwitchingRoomId && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none">
          <div className="p-6 rounded-3xl bg-[#12131A] border border-white/10 shadow-2xl flex flex-col items-center text-center max-w-xs mx-4">
            <div className="w-13 h-13 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
              <Compass size={24} className="animate-spin" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              Switching Junction
            </h3>
            <p className="text-xs text-indigo-300 font-semibold truncate max-w-[220px] mb-2">
              {switchingRoomName || "Connecting..."}
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Disconnecting from current voice audio and entering the new junction...
            </p>
          </div>
        </div>
      )}
      {/* Floating Pop-up Notification (In-Room Whisper Chat Preview) - Positioned right above bottom controls dock */}
      {!isChatOpen && showInRoomPopups && inRoomPopups.length > 0 && (
        <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-24 z-40 max-w-sm sm:max-w-[340px] mx-auto sm:mx-0 pointer-events-none transition-all duration-200">
          {inRoomPopups.map((popup) => (
            <div
              key={popup.id}
              onClick={() => {
                setIsChatOpen(true);
                setRightPanelTab("chat");
                if (popup.isWhisper && popup.senderName) {
                  setPrivateRecipient(popup.senderName);
                }
                setInRoomPopups([]);
              }}
              className="pointer-events-auto rounded-2xl p-3 sm:p-3.5 bg-[#12131C]/95 backdrop-blur-2xl border border-white/15 shadow-2xl shadow-black/80 transition-all duration-200 animate-in slide-in-from-bottom-3 sm:slide-in-from-right-3 fade-in group cursor-pointer hover:border-white/25 active:scale-[0.99]"
            >
              {/* Top Header */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 border border-white/15">
                    <UserAvatar avatar={popup.avatar || "zap"} color={popup.color || "#8B5CF6"} size="sm" className="!w-full !h-full" />
                  </div>
                  <span className="text-xs font-bold text-white truncate max-w-[120px] sm:max-w-[150px]">
                    {popup.senderName}
                  </span>
                  {popup.isWhisper && (
                    <span className="text-[10px] text-slate-300 bg-white/10 px-1.5 py-0.2 rounded-full font-medium flex items-center gap-0.5 shrink-0">
                      <Lock size={9} /> Whisper
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInRoomPopups([]);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>

              {/* Message text */}
              <p className="text-xs text-slate-200 font-medium line-clamp-2 leading-relaxed break-words pl-0.5 mt-0.5">
                {popup.text}
              </p>

              {/* Action Footer */}
              <div className="mt-2 pt-1.5 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400">
                <span className="text-indigo-400 font-semibold group-hover:text-indigo-300 transition-colors flex items-center gap-1">
                  Tap to reply <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShowInRoomPopups();
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  title="Silence future pop-up messages"
                >
                  Not show msgs
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
